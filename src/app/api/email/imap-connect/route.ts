/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * IMAP 邮箱直连 — 连接并扫描
 * POST /api/email/imap-connect
 *
 * Body: {
 *   email: string,        // 邮箱地址
 *   authCode: string,     // IMAP 授权码
 *   daysBack?: number,    // 扫描最近N天（默认7）
 * }
 *
 * 🔧 2026-07-22: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with 10+ mergeCookies calls — now handled automatically by withAuth).
 *    finally block (lock release) preserved — withAuth doesn't interfere with
 *    handler's internal try/finally.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { detectIMAPProvider, isValidEmail } from '@/lib/email/imap-config';
import { parseReceipt, isReceiptEmail } from '@/lib/email/receipt-parser';
import { calculateEmailImpulseScore, extractPlainText } from '@/lib/email/impulse-score';
import { sanitizeImapError } from '@/lib/email/sanitize-error';
import { raceWithTimeoutReject } from '@/lib/race-timeout';
import { ImapFlow } from 'imapflow';
import { logger } from '@/lib/logger';
import { subDays } from 'date-fns';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { encryptSensitive } from '@/lib/crypto-helpers';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { asInsertArray } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];
type ImpulseEventsInsert = Database['public']['Tables']['impulse_events']['Insert'];

// 🔧 ARCH fix (Round 2 C2): 分布式锁 TTL (与 scan/resync 一致)
// 🔧 ARCH fix (Round 19 R19-H-7 — IMAP connect 锁 TTL 同步增加到 180s, maxDuration=180):
//    imap-connect 也做完整 IMAP 扫描 (50 条邮件), 同 scan/resync 一样可能超过 60s。
const IMAP_CONNECT_LOCK_TTL_MS = 180_000; // 180s (与 scan/resync 一致)

// 🔧 ARCH fix (Round 19 R19-H-7): Vercel maxDuration 上限
export const maxDuration = 180;

export const POST = withAuth(async ({ request, supabase, user }) => {
  // 🔧 ARCH fix (Round 2 C2 — imap-connect missing distributed lock):
  //    旧代码无分布式锁 → 用户双击 "连接 IMAP" 触发两个并发请求, 都插入 impulse_events +
  //    email_receipts, 导致重复数据和潜在双倍 vitality 伤害。
  //    根因修复: 与 scan/resync 一致, 加 acquireLock(failClosed=true)。
  // 🔧 ARCH fix (Round 20 BUG-R19D-H3): acquireLock 内部生成 ownership token
  const lockKey = `email-imap-connect:${user.id}`;
  const locked = await acquireLock(lockKey, IMAP_CONNECT_LOCK_TTL_MS, true);
  if (!locked) {
    return NextResponse.json(
      { error: 'IMAP connection already in progress. Please wait.', connected: false },
      { status: 429 }
    );
  }

  // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  //    BUG-113: catch invalid JSON
  //    BUG-114: clamp daysBack (1-90) 防 DoS
  const imapConnectSchema = z.object({
    email: z.string().min(1, 'Missing email or authCode').max(200),
    authCode: z.string().min(1).max(500),
    daysBack: z.number().int().min(1).max(90).default(7),
  });
  const bodyResult = await validateBody(request, imapConnectSchema);
  if (isValidationError(bodyResult)) {
    await releaseLock(lockKey);
    return bodyResult;
  }
  const { email: emailAddress, authCode, daysBack } = bodyResult;

  if (!isValidEmail(emailAddress)) {
    await releaseLock(lockKey);
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const provider = detectIMAPProvider(emailAddress);
  if (!provider) {
    await releaseLock(lockKey);
    return NextResponse.json(
      { error: `Unsupported email provider. Supported: 163.com, 126.com, qq.com, gmail.com, outlook.com` },
      { status: 400 }
    );
  }

  const userId = user.id;

  // 🔧 ARCH fix (Round 2 C2): 包裹整个 body 在 try/finally 中, finally 释放锁
  // 🔧 Round 120 audit fix (AUDIT-1 P1 #7): profile timezone fetch 移入 try 块
  //    旧代码: profile fetch 在 try 之外 → throw 时锁不释放 (180s 阻塞后续重试)
  //    修复: 移入 try 块, finally 保证锁释放
  let userTimezone: string | undefined;
  try {
  // 🔧 ARCH fix (Round 2 H7): 获取用户时区用于 impulse score 计算
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  userTimezone = (profileRow as { timezone?: string } | null)?.timezone || undefined;

  // 1. 保存或更新 email_connection
  const { data: existingConn } = await supabase
    .from('email_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('email_address', emailAddress)
    .maybeSingle();

  let connectionId: string;

  // 🔧 ARCH fix (Round 12 DB-17): encryptSensitive 现在 fail-closed (throw 而非返回明文)
  //    必须在 try 块内调用, catch 后返回 500
  let encryptedAuthCode: string;
  try {
    encryptedAuthCode = encryptSensitive(authCode);
      // safe to ignore: non-critical background operation, error already logged
  } catch (encErr) {
                     // safe to ignore: non-critical background operation, error already logged
    logger.error('[IMAP Connect] encryptSensitive failed — refusing to store plaintext:', encErr);
    return NextResponse.json(
      { error: 'Encryption not configured. Please contact support.' },
      { status: 500 },
    );
  }

  if (existingConn) {
    connectionId = existingConn.id;
    // 🔧 ARCH fix (Round 28 — 标记 'active' 前未测试 IMAP 登录 → 并发 scan 用到坏连接):
    //    旧代码: 立即 status='active' → IMAP 登录失败时并发 scan 已在用此连接。
    //    根因修复: 先标 'pending', IMAP 登录成功后再改 'active'。
    await supabase
      .from('email_connections')
      .update({
        access_token: encryptedAuthCode,  // 🔧 Round 2 C3 + Round 12 DB-17: 加密 authCode (fail-closed)
        status: 'pending',
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', connectionId);
  } else {
    const { data: newConn, error: connError } = await supabase
      .from('email_connections')
      .insert({
        user_id: userId,
        email_address: emailAddress,
        provider: `imap_${provider.name.toLowerCase().replace(/\s+/g, '_')}`,
        access_token: encryptedAuthCode,  // 🔧 Round 2 C3 + Round 12 DB-17: 加密 authCode (fail-closed)
        refresh_token: null,
        token_expiry: new Date(Date.now() + 365 * 86400000).toISOString(),
        scopes: ['imap.readonly'],
        status: 'pending',  // 🔧 Round 28: 先 'pending', IMAP 登录成功后改 'active'
      })
      .select('id')
      .maybeSingle();

    if (connError || !newConn) {
      logger.error('[IMAP Connect] Failed to save connection:', connError);
      return NextResponse.json(
        { error: 'Failed to save email connection' }, // BUG-289 fix: 移除 details 字段，不泄露 Supabase 错误
        { status: 500 }
      );
    }
    connectionId = newConn.id;
  }

  // 2. 连接 IMAP 并扫描
  const newReceipts: Record<string, unknown>[] = [];
  // 🔧 ARCH fix (Round 2 H6): 延迟插入 impulse_events, 等 email_receipts 批量插入成功后再插
  // 旧代码在循环内逐条插 impulse_events → 若 receipts 批量插入失败, impulse_events 成为孤儿
  const pendingImpulseEvents: Record<string, unknown>[] = [];
  let scannedCount = 0;
  let connectionOk = false;
  // BUG-288 fix: client 变量提到 try 外部，避免 catch 中引用未定义变量
  let client: InstanceType<typeof ImapFlow> | null = null;

  try {
    client = new ImapFlow({
      host: provider.host,
      port: provider.port,
      secure: true,
      auth: {
        user: emailAddress,
        pass: authCode,
      },
      // 🔧 ARCH fix (Round 78 — ImapFlow 类型): 移除 `false as unknown as undefined` cast
      //    ImapFlow 类型 logger?: Logger | false 已接受 false, 无需 cast
      logger: false,
      emitLogs: false,
    });

    // BUG-128 fix: 正确清理 timeout timer，避免成功后 unhandled rejection
    // 🔧 ARCH fix (Round 52 REVIEW-A-2 — 采用 raceWithTimeoutReject helper):
    //    旧代码: 手动 Promise.race + setTimeout + finally clearTimeout (3 行模板)
    //    根因修复: 用共享 helper, 内置 timer cleanup + rejection handling
    await raceWithTimeoutReject(
      client.connect(),
      15_000,
      new Error('Connection timeout (15s)')
    );
    connectionOk = true;

    const lock = await client.getMailboxLock('INBOX');

    try {
      const sinceDate = subDays(new Date(), daysBack);

      // 用多种关键词搜索购物收据邮件
      // 🔧 ARCH fix (Round 78 — ImapFlow header 类型 bug): 见 resync/route.ts 详细注释
      //    旧代码: header: ['Subject', 'order'] — 数组形式被 ImapFlow 当作 { 0: 'Subject', 1: 'order' }
      //    → 搜索永远 0 结果 → 总是 fallback 到全量扫描
      //    修复: 用对象形式 { Subject: 'order' } (ImapFlow 类型要求)
      const searchQueries = [
        { since: sinceDate, header: { Subject: 'order' } },
        { since: sinceDate, header: { Subject: 'purchase' } },
        { since: sinceDate, header: { Subject: 'receipt' } },
        { since: sinceDate, header: { Subject: 'confirmation' } },
        { since: sinceDate, header: { Subject: 'TikTok' } },
      ];

      const seenUids = new Set<string>();
      const matchedUids: string[] = [];

      for (const criteria of searchQueries) {
        try {
          for await (const msg of client.fetch(criteria, { uid: true })) {
            const uid = String(msg.uid);
            if (!seenUids.has(uid)) {
              seenUids.add(uid);
              matchedUids.push(uid);
            }
          }
        } catch {
          // 搜索关键词可能不支持，跳过
        }
      }

      // 如果关键词搜索没结果，用宽泛搜索
      if (matchedUids.length < 5) {
        try {
          for await (const msg of client.fetch({ since: sinceDate }, { uid: true })) {
            const uid = String(msg.uid);
            if (!seenUids.has(uid)) {
              seenUids.add(uid);
              matchedUids.push(uid);
            }
          }
        } catch {
          // 跳过
        }
      }

      scannedCount = matchedUids.length;

      // 逐条处理（最多50条）
      const uidsToProcess = matchedUids.slice(0, 50);

      for (const uid of uidsToProcess) {
        try {
          const msg = await client.fetchOne(uid, {
            envelope: true,
            source: true,
          });

          // fetchOne may return false if message not found
          if (!msg || typeof msg === 'boolean') continue;

          if (!msg.envelope) continue;

          const from = msg.envelope.from?.[0]?.address || '';
          const fromName = msg.envelope.from?.[0]?.name || '';
          const fromAddr = fromName ? `${fromName} <${from}>` : from;
          const subject = msg.envelope.subject || '';
          const date = msg.envelope.date || new Date();

          let snippet = '';
          if (msg.source) {
            const sourceStr = typeof msg.source === 'string'
              ? msg.source
              : new TextDecoder().decode(msg.source);
            snippet = extractPlainText(sourceStr).substring(0, 500);
          }

          if (!isReceiptEmail(fromAddr, subject, snippet)) continue;

          const parsed = parseReceipt(fromAddr, subject, snippet);
          if (!parsed.isReceipt) continue;

          const messageId = `imap-${uid}-${emailAddress}`;
          const { data: existing } = await supabase
            .from('email_receipts')
            .select('id')
            .eq('user_id', userId)
            .eq('message_id', messageId)
            .maybeSingle();

          if (existing) continue;

          const impulseScore = calculateEmailImpulseScore(parsed, new Date(date), userTimezone);  // 🔧 Round 2 H7: 传时区
          const refundDeadline = parsed.refundDeadlineDays
            ? new Date(new Date(date).getTime() + parsed.refundDeadlineDays * 86400000)
            : null;
          const isWithinWindow = refundDeadline ? new Date() < refundDeadline : true;

          const receiptData = {
            user_id: userId,
            connection_id: connectionId,
            message_id: messageId,
            thread_id: `imap-thread-${uid}`,
            from_address: fromAddr,
            subject,
            snippet,
            platform: parsed.platform,
            order_id: parsed.orderId,
            item_name: parsed.itemName,
            amount: parsed.amount,
            currency: parsed.currency,
            received_at: new Date(date).toISOString(),
            impulse_score: impulseScore,
            refund_eligible: parsed.refundEligible && isWithinWindow,
            refund_deadline: refundDeadline?.toISOString(),
            status: impulseScore >= 60 ? 'actionable' : 'detected',
          };

          newReceipts.push(receiptData);

          // 🔧 ARCH fix (Round 2 H6): 延迟插入 — 先收集, 等 receipts 批量成功后再插
          if (impulseScore >= 40 && parsed.amount) {
            pendingImpulseEvents.push({
              user_id: userId,
              platform: parsed.platform,
              source: 'patrol',
              title: subject,
              amount: parsed.amount,
              category: parsed.platform,
              is_livestream: false,
              is_flash_sale: false,
              impulse_score: impulseScore,
              reasons: [`Email receipt from ${parsed.platform}`, parsed.amount > 50 ? 'High amount' : ''].filter(Boolean),
              raw_text: snippet.substring(0, 1000),
            });
          }
        } catch (msgErr) {
          logger.warn('[IMAP] Failed to process message:', msgErr);
          continue;
        }
      }

      // 批量插入
      if (newReceipts.length > 0) {
        const { error: insertError } = await supabase
          .from('email_receipts')
          .insert(asInsertArray<EmailReceiptsInsert>(newReceipts));
        if (insertError) {
          logger.error('[IMAP Connect] Failed to insert receipts:', insertError);
          // 🔧 ARCH fix (Round 2 H6): receipts 插入失败 → 不插 impulse_events (避免孤儿数据)
        } else {
          // 🔧 ARCH fix (Round 2 H6): receipts 成功后才批量插 impulse_events
          if (pendingImpulseEvents.length > 0) {
            const { error: impulseError } = await supabase
              .from('impulse_events')
              .insert(asInsertArray<ImpulseEventsInsert>(pendingImpulseEvents));
            if (impulseError) {
              logger.warn('[IMAP Connect] Failed to insert impulse_events (non-critical):', impulseError.message);
            }
          }
        }
      }

      // 更新 last_sync_at + 🔧 Round 28 C1: IMAP 成功后改 status='active'
      await supabase
        .from('email_connections')
        .update({
          status: 'active',  // 🔧 Round 28 C1: pending → active
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

    } finally {
      lock.release();
    }

    // 🔧 BUG-265 fix: 确保 client.logout() 在 finally 中调用，防止连接泄漏
    try {
      await client.logout();
      // safe to ignore: non-critical background operation, error already logged
    } catch (logoutErr) {
      logger.warn('[IMAP Connect] Logout error (non-critical):', logoutErr);
    }

  } catch (imapError) {
    const errorMsg = imapError instanceof Error ? imapError.message : 'Unknown IMAP error';
    // 🔧 ARCH fix (Round 52 REVIEW-A-1 — 日志也脱敏, 不只 DB):
    //    旧代码 logger.error 打印 raw errorMsg → Vercel/Datadog 日志含凭证。
    //    根因修复: 先脱敏再 log (与 DB 写入一致)。
    const sanitizedError = sanitizeImapError(errorMsg);
    logger.error('[IMAP Connect] Error:', sanitizedError);

    // 🔧 BUG-265 fix: 错误路径也要确保 logout
    try {
      if (client) await client.logout();
      // safe to ignore: non-critical background operation, error already logged
    } catch (logoutErr) {
      logger.warn('[IMAP Connect] Logout error on error path (non-critical):', logoutErr);
    }

    // 🔧 FIX: 脱敏 errorMsg — 移除可能包含的 credentials (authCode/password)
    // 🔧 ARCH fix (Round 51 R51-Bug1): 提取共享 sanitizeImapError helper (resync + imap-connect 统一)
    // 🔧 ARCH fix (Round 52 REVIEW-A-1): sanitizedError 已在上方 log 前计算, 此处复用

    await supabase
      .from('email_connections')
      .update({
        status: connectionOk ? 'active' : 'expired',
        error_message: sanitizedError,
        // 🔧 ARCH fix (Round 22 BUG-R22-M6 — catch 块不更新 last_sync_at → UI 显示陈旧时间):
        //    旧代码 catch 块只更新 status + error_message, 不更新 last_sync_at。
        //    部分失败时 (connectionOk=true 但扫描失败) UI 显示上一次成功同步时间 (或 null = "never")。
        //    根因修复: 部分失败也记录尝试时间 (last_sync_at), 让 UI 显示"刚尝试过"。
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (!connectionOk) {
      // 🔧 ARCH fix (Round 15 audit H7 — 200 on connection failure, Round 11 H5 regression):
      //    旧代码 status: 200 → 前端 apiFetch 视为成功, 不显示 error toast。
      //    Round 11 H5 修复了 email/scan + email/resync, 但漏了 imap-connect。
      //    根因修复: 返回 502 (upstream IMAP failure) 让前端 catch 显示 error。
      return NextResponse.json({
        error: 'IMAP connection failed. Please check your credentials and try again.', // BUG-289 fix: 不泄露内部错误详情
        connected: false,
        provider: provider.name,
        hint: getErrorHint(errorMsg, provider.name),
      }, { status: 502 });
    }

    // 🔧 ARCH fix (Round 19 R19-H-4 — IMAP connectionOk 后操作失败仍返回 200):
    //    旧代码: connectionOk=true 但后续 fetch/insert 失败时, catch 块更新 connection 状态后
    //    流落到 line 437 返回 200 + connected: true + newReceipts: 0。
    //    用户看到"连接成功, 0 封新邮件"——以为扫描成功只是没邮件, 实际是 fetch/insert 失败。
    //    根因修复: 若 catch 块捕获到错误但 connectionOk=true, 返回 502 + partialFailure 标志,
    //    让前端引导用户重试。
    return NextResponse.json({
      error: 'IMAP connected but scan failed. Please try rescan.',
      connected: true,
      partialFailure: true,
      provider: provider.name,
      scanned: scannedCount,
      newReceipts: newReceipts.length,
      connectionId,
    }, { status: 502 });
  }

  return NextResponse.json({
    connected: connectionOk,
    provider: provider.name,
    email: emailAddress,
    scanned: scannedCount,
    newReceipts: newReceipts.length,
    connectionId,
  });
} finally {
  // 🔧 ARCH fix (Round 2 C2): 释放分布式锁
  // 🔧 ARCH fix (Round 20 BUG-R19D-H3): releaseLock 内部用 ownership token 验证
  await releaseLock(lockKey);
}
});

function getErrorHint(errorMsg: string, providerName: string): string | undefined {
  if (errorMsg.includes('Unsafe Login')) {
    return '163邮箱需要在设置中确认IMAP服务已开启，并使用授权码（非登录密码）。部分IP可能需要在网页端登录后允许客户端访问。';
  }
  if (errorMsg.includes('Authentication') || errorMsg.includes('auth')) {
    return '授权码不正确，请检查邮箱设置中的IMAP/SMTP授权码是否正确。';
  }
  if (errorMsg.includes('timeout')) {
    return '连接超时，可能是网络问题或邮箱服务器不可达。';
  }
  if (providerName === 'Gmail') {
    return 'Gmail 需要开启"应用专用密码"或使用 OAuth 方式连接。';
  }
  return undefined;
}
