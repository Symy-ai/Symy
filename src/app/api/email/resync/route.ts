/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * 重新同步邮箱收据（用已存的 IMAP 凭证）
 * POST /api/email/resync
 * Body: { daysBack?: number }
 *
 * 从 email_connections 读取已存的 IMAP 凭证，
 * 重新连接邮箱扫描购物收据，不需要前端重新传密码。
 * 使用用户的 cookie auth（RLS 安全），不需要 SERVICE_ROLE_KEY。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { detectIMAPProvider } from '@/lib/email/imap-config';
import { parseReceipt, isReceiptEmail } from '@/lib/email/receipt-parser';
import { calculateEmailImpulseScore, extractPlainText } from '@/lib/email/impulse-score';
import { sanitizeImapError } from '@/lib/email/sanitize-error';
import { raceWithTimeoutReject } from '@/lib/race-timeout';
import { ImapFlow } from 'imapflow';
import { logger } from '@/lib/logger';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { subDays } from 'date-fns';
import { decryptSensitive } from '@/lib/crypto-helpers';
import { asInsertArray } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];
type ImpulseEventsInsert = Database['public']['Tables']['impulse_events']['Insert'];

// ============================================================
// Serverless-safe resync deduplication (replaces in-memory Map)
// Prevents concurrent resyncs from the same user.
// Now works across Vercel instances.
// ============================================================
// 🔧 ARCH fix (Round 19 R19-H-7 — IMAP resync 锁 TTL 60s 短于扫描耗时):
//    旧代码: RESYNC_LOCK_TTL_MS = 60_000, 但 IMAP 扫描可能超过 60s。
//    根因修复: 锁 TTL 180s + maxDuration 180s (与 scan 路由一致)。
const RESYNC_LOCK_TTL_MS = 180_000; // 180s (50 msgs × 2s + 余量)

// 🔧 ARCH fix (Round 19 R19-H-7): Vercel maxDuration 上限
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const { supabase, user, error: authError, mergeCookies } =
    await createAuthenticatedClient(request);

  if (authError || !user || !supabase) {
    return mergeCookies(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    );
  }

  // 🔧 TECH-DEBT-A fix: Serverless-safe dedup (replaces in-memory Map)
  // 🔧 ARCH fix (Round 20 BUG-R19D-H3): acquireLock 内部生成 ownership token
  const lockKey = `email-resync:${user.id}`;
  const locked = await acquireLock(lockKey, RESYNC_LOCK_TTL_MS, true);
  if (!locked) {
    return mergeCookies(
      NextResponse.json(
        { error: 'Resync already in progress. Please wait.', receipts: [], scanned: 0, newReceipts: 0 },
        { status: 429 },
      )
    );
  }
  // 🔧 ARCH fix (Round 44 R44-A-8): 在 try 之前声明, 防 TDZ
  let connectionIdForCatch: string | null = null;
  try {
    // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代 .catch(() => ({})) — 接受空 body, 但验证字段
    //    BUG-114 fix: clamp daysBack (1-90) 防 DoS
    const resyncSchema = z.object({
      daysBack: z.number().int().min(1).max(90).default(7),
    }).passthrough();
    let body;
    try {
      body = resyncSchema.parse(await request.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return mergeCookies(NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 }));
      }
      body = { daysBack: 7 };
    }
    const { daysBack } = body;
  const userId = user.id;

  // 🔧 ARCH fix (Round 2 H7): 获取用户时区用于 impulse score 计算
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const userTimezone = (profileRow as { timezone?: string } | null)?.timezone || undefined;

  // 🔧 SEC-3 fix: 只选择需要的列
  const { data: connections, error: connError } = await supabase
    .from('email_connections')
    .select('id, user_id, email_address, provider, access_token, refresh_token, token_expiry, scopes, status, last_sync_at, last_history_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (connError || !connections?.length) {
    // 🔧 ARCH fix (Round 11 H5): 200 → 400, 让前端识别需要重新连接邮箱
    return mergeCookies(
      NextResponse.json(
        { error: 'No active email connection found. Please connect an email first.', receipts: [], scanned: 0, newReceipts: 0 },
        { status: 400 },
      )
    );
  }

  const connection = connections[0];
  // 🔧 ARCH fix (Round 44 R44-A-8): 赋值 connectionId (外层已声明 let)
  connectionIdForCatch = connection?.id || null;
  const isIMAP = connection.provider?.startsWith('imap_');

  if (!isIMAP) {
    // For OAuth connections, redirect to /api/email/scan
    return mergeCookies(
      NextResponse.json(
        { error: 'OAuth connections should use /api/email/scan instead', receipts: [], scanned: 0, newReceipts: 0 },
        { status: 400 },
      )
    );
  }

  const emailAddress = connection.email_address;
  // 🔧 Round 2 C3: 解密 IMAP authCode (若已加密); 未加密的旧数据直接返回 (向后兼容)
  const rawAuthCode = connection.access_token;
  const authCode = rawAuthCode ? decryptSensitive(rawAuthCode) : null;

  if (!emailAddress || !authCode) {
    // 🔧 ARCH fix (Round 11 H5): 200 → 500 (decryption failed 是服务端 key rotation 问题, 不是用户错)
    return mergeCookies(
      NextResponse.json(
        { error: 'Stored IMAP credentials incomplete or decryption failed (key may have been rotated). Please reconnect.', receipts: [], scanned: 0, newReceipts: 0 },
        { status: 500 },
      )
    );
  }

  const provider = detectIMAPProvider(emailAddress);
  if (!provider) {
    return mergeCookies(
      NextResponse.json(
        { error: `Unsupported email provider: ${emailAddress}`, receipts: [], scanned: 0, newReceipts: 0 },
        { status: 400 },
      )
    );
  }

  // 2. 连接 IMAP 并扫描
  const newReceipts: Record<string, unknown>[] = [];
  // BUG FIX: Collect impulse_events separately, insert only after receipts are confirmed saved.
  // This prevents duplicate impulse_events when concurrent scans process the same emails.
  const pendingImpulseEvents: Record<string, unknown>[] = [];
  let scannedCount = 0;
  let connectionOk = false;

  // BUG-288 fix: client 变量提到 try 外部
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
      // 🔧 ARCH fix (Round 78 — ImapFlow header 类型 bug):
      //    旧代码: header: ['Subject', 'order'] — 数组形式
      //    ImapFlow search compiler 用 Object.keys 遍历, 数组形式被当作 { 0: 'Subject', 1: 'order' }
      //    → 搜索 header "0" 值 "Subject" (永远不匹配) → 5 个关键词搜索全是死代码
      //    → 系统总是 fallback 到全量日期扫描 (性能差 + 隐私风险)
      //    修复: 用对象形式 { Subject: 'order' } (ImapFlow 类型要求的格式)
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

      // 🔧 ARCH fix (Round 31 — N+1 query: 逐条 SELECT email_receipts 检查存在性):
      //    同 scan/route.ts Round 26 R25-16 fix, 批量查询所有 message_id, 用 Set 快速过滤。
      //    注: message_id 在循环内生成 (imap-{uid}-{emailAddress}), 此处先构造再批量查。
      //    但 uid → message_id 映射在循环内, 所以先循环收集所有 message_id, 再批量查。
      //    实际上 N+1 在此路径影响较小 (IMAP fetchOne 本身就是 N 次), 但减少 DB 往返仍有价值。
      //    采用方案: 循环内不查 DB, 改为 batch insert + ON CONFLICT DO NOTHING (利用 UNIQUE 约束)。
      //    简化: 仍逐条检查但用 in-memory Set (从 batch 查询获取)。
      //    最小变更: 保持循环结构, 但把逐条 SELECT 改为循环前批量 SELECT。
      //    由于 message_id 在循环内生成, 我们先收集所有可能的 message_id:
      const allPossibleMsgIds = uidsToProcess.map((uid: string) => `imap-${uid}-${emailAddress}`);
      const { data: existingReceipts } = await supabase
        .from('email_receipts')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', allPossibleMsgIds);
      const existingMsgIds = new Set(
        ((existingReceipts || []) as Array<{ message_id: string }>).map(r => r.message_id)
      );

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

          // 🔧 Round 31: 用 Set 快速检查, 替代逐条 SELECT (N+1 → 1 query)
          if (existingMsgIds.has(messageId)) continue;

          const impulseScore = calculateEmailImpulseScore(parsed, new Date(date), userTimezone);  // 🔧 Round 2 H7: 传时区
          const refundDeadline = parsed.refundDeadlineDays
            ? new Date(new Date(date).getTime() + parsed.refundDeadlineDays * 86400000)
            : null;
          const isWithinWindow = refundDeadline ? new Date() < refundDeadline : true;

          const receiptData = {
            user_id: userId,
            connection_id: connection.id,
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

          // BUG FIX: Defer impulse_events insertion to after receipt batch insert.
          // Previously, impulse_events were inserted inside the loop (one-by-one),
          // which caused duplicates when concurrent scans processed the same emails.
          // Now we collect them and insert only after receipts are confirmed saved.
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
              // 🔧 ARCH fix (Round 31): 关联 message_id 以便 batch insert 后能匹配 receipt_id
              _message_id: messageId,
            });
          }
        } catch (msgErr) {
          logger.warn('[Resync] Failed to process message:', msgErr);
          continue;
        }
      }

      // 批量插入
      if (newReceipts.length > 0) {
        const { error: insertError } = await supabase
          .from('email_receipts')
          .insert(asInsertArray<EmailReceiptsInsert>(newReceipts));
        if (insertError) {
          logger.error('[Resync] Failed to insert receipts:', insertError);
          // BUG FIX: Skip health impact when batch insert fails.
          // If the insert failed (e.g., concurrent scan already inserted these receipts),
          // processing health impact would create duplicate health events and double
          // vitality damage. Only process health impact for receipts that were actually
          // inserted into the database.
        } else {
          // ====== Insert impulse_events (only after receipts confirmed saved) ======
          if (pendingImpulseEvents.length > 0) {
            try {
              // 🔧 ARCH fix (Round 31): 查询已插入 receipts 的 id, 关联到 impulse_events.receipt_id
              const msgIds = pendingImpulseEvents.map(e => e._message_id).filter(Boolean) as string[];
              const { data: insertedReceipts } = await supabase
                .from('email_receipts')
                .select('id, message_id')
                .eq('user_id', userId)
                .in('message_id', msgIds);
              const receiptIdMap = new Map(
                ((insertedReceipts || []) as Array<{ id: string; message_id: string }>).map(r => [r.message_id, r.id])
              );
              const eventsToInsert = pendingImpulseEvents.map(e => {
                const msgId = e._message_id as string | undefined;
                const { _message_id: _unused, ...eventData } = e;
                return {
                  ...eventData,
                  receipt_id: msgId ? (receiptIdMap.get(msgId) || null) : null,
                } as Record<string, unknown>;
              });
              const { error: eventsError } = await supabase
                .from('impulse_events')
                .insert(asInsertArray<ImpulseEventsInsert>(eventsToInsert));
              if (eventsError) {
                logger.error('[Resync] Failed to insert impulse_events:', eventsError);
              }
      // safe to ignore: non-critical background operation, error already logged
            } catch (eventsErr) {
              logger.error('[Resync] Impulse events insert error (non-critical):', eventsErr);
            }
          }

          // ====== Health Impact: Impulse purchases damage companion vitality ======
          // Only process when receipts were actually inserted (no insert error)
          try {
            const { processReceiptsHealthImpact } = await import('@/lib/health-impact');
            const impulseReceipts = newReceipts
              .filter((r: Record<string, unknown>) => Number(r.impulse_score) >= 60 && r.amount)
              .map((r: Record<string, unknown>) => ({
                receiptId: r.message_id as string,
                platform: r.platform as string,
                amount: Number(r.amount),
                impulseScore: Number(r.impulse_score),
                itemName: r.item_name as string | undefined,
              }));

            if (impulseReceipts.length > 0) {
              const healthResults = await processReceiptsHealthImpact(userId, impulseReceipts);
              logger.info(`[Resync] Health impact: ${healthResults.length} impulse events processed`);
            }
      // safe to ignore: non-critical background operation, error already logged
          } catch (healthErr) {
            logger.error('[Resync] Health impact error (non-critical):', healthErr);
          }
        }
      }

      // 更新 last_sync_at
      await supabase
        .from('email_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

    } finally {
      lock.release();
    }

    // 🔧 BUG-267 fix: 确保 client.logout() 在 finally 中调用，防止连接泄漏
    try {
      if (client) await client.logout();
      // safe to ignore: non-critical background operation, error already logged
    } catch (logoutErr) {
      logger.warn('[Resync] Logout error (non-critical):', logoutErr);
    }

  } catch (imapError) {
    const errorMsg = imapError instanceof Error ? imapError.message : 'Unknown IMAP error';
    // 🔧 ARCH fix (Round 52 REVIEW-A-1 — 日志也脱敏, 不只 DB):
    const sanitizedErrorMsg = sanitizeImapError(errorMsg);
    logger.error('[Resync] Error:', sanitizedErrorMsg);

    // 🔧 BUG-267 fix: 错误路径也要确保 logout
    try {
      if (client) await client.logout();
      // safe to ignore: non-critical background operation, error already logged
    } catch (logoutErr) {
      logger.warn('[Resync] Logout error on error path (non-critical):', logoutErr);
    }

    // 更新连接状态为 expired（凭证可能失效）
    // 🔧 ARCH fix (Round 44 R44-A-8): 用 connectionIdForCatch 防 TDZ (connection 可能未初始化)
    // 🔧 ARCH fix (Round 51 R51-Bug1): 脱敏 errorMsg (imap-connect 已脱敏, resync 漏了 → 安全漏洞)
    // 🔧 ARCH fix (Round 52 REVIEW-A-1): 复用上方计算的 sanitizedErrorMsg
    if (connectionIdForCatch) {
      await supabase
        .from('email_connections')
        .update({
          status: connectionOk ? 'active' : 'expired',
          error_message: sanitizedErrorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionIdForCatch);
    }

    if (!connectionOk) {
      // 🔧 ARCH fix (Round 11 H5): 200 → 502 (upstream IMAP failure)
      return mergeCookies(
        NextResponse.json({
          error: 'IMAP reconnection failed. Please reconnect your email.', // BUG-289 fix: 不泄露内部错误详情
          connected: false,
          receipts: [],
          scanned: 0,
          newReceipts: 0,
        }, { status: 502 })
      );
    }

    // 🔧 ARCH fix (Round 19 R19-H-4 — IMAP connectionOk 后操作失败仍返回 200):
    //    旧代码: connectionOk=true 但后续 fetch/insert 失败时, catch 块更新 connection 状态后
    //    流落到 line 418 返回 200 + connected: true + newReceipts: 0。
    //    用户看到"连接成功, 0 封新邮件"——以为扫描成功只是没邮件, 实际是 fetch/insert 失败。
    //    根因修复: 若 catch 块捕获到错误但 connectionOk=true, 返回 502 + partialFailure 标志,
    //    让前端引导用户重试。
    if (errorMsg) {
      return mergeCookies(
        NextResponse.json({
          error: 'IMAP connected but scan failed. Please try rescan.',
          connected: true,
          partialFailure: true,
          scanned: scannedCount,
          newReceipts: newReceipts.length,
          receipts: [],
        }, { status: 502 })
      );
    }
  }

  return mergeCookies(
    NextResponse.json({
      connected: connectionOk,
      provider: provider.name,
      email: emailAddress,
      scanned: scannedCount,
      newReceipts: newReceipts.length,
      receipts: newReceipts.map((r) => ({
        platform: r.platform,
        item_name: r.item_name,
        amount: r.amount,
        subject: r.subject,
        impulse_score: r.impulse_score,
      })),
    })
  );
  } finally {
    // Always release the resync lock when done (releaseLock 内部用 ownership token 验证)
    await releaseLock(lockKey);
  }
}
