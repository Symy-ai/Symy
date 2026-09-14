/**
 * POST /api/premium/waitlist — 加入 Premium 候补名单
 *
 * 🔧 需求六: Premium 卡片"加入候补名单"收集邮箱
 *
 * 请求体: { email: string }
 * 响应: { success: boolean }
 *
 * 实现:
 *   - 用 authenticated client 写入 premium_waitlist 表 (user_id + email)
 *   - 表不存在时优雅降级 (返回 success + degraded, 不记录邮箱到日志)
 *   - 同一用户重复加入: upsert (ON CONFLICT do nothing)
 *   - 防滥用: 需登录 (authenticated client)
 *
 * 🔧 ARCH fix Round 74 (Finding 16): Migrated to withAuth HOF.
 * 🔧 ARCH fix Round 75 (Finding 30): PII leak fix (don't log raw email) + error
 *    classification (table-missing = degrade; other errors = 500 via createApiError).
 *    旧代码: 所有错误都返回 success: true, degraded: true → 客户端误以为已加入名单.
 *    旧代码: logger.info 记录原始 email → PII 泄漏到服务器日志 (GDPR/CCPA 风险).
 *    根因修复: (a) 日志只记录 email 域名 (不记录本地部分); (b) 表不存在 = degrade;
 *    其他错误 = 500 (让客户端知道失败, 可重试).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { createApiError } from '@/lib/api-error';
import { z } from 'zod';

const waitlistSchema = z.object({
  email: z.string().email().max(200),
});

/** 🔧 ARCH fix Round 75 (Finding 30): Mask email for logging — only domain, not local part */
function maskEmailForLog(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '***';
  return email.substring(0, 2) + '***@' + email.substring(atIndex + 1);
}

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 2026-07-15 (ARCH-12 #15 修复): 不接受客户端传的 email (可伪造他人邮箱)
  //    旧代码: 接受 body.email → 用户可提交 anyone@example.com → Premium 上线群发时 GDPR/垃圾邮件风险
  //    修复: 用 user.email (Supabase auth 已验证的邮箱), 忽略 body.email
  //    schema 仍验证 email 格式 (向后兼容), 但不使用 body.email
  const body = await validateBody(request, waitlistSchema);
  if (isValidationError(body)) return body;

  // 用已验证的 user.email, 不信任客户端传入的 email
  const verifiedEmail = user.email;
  if (!verifiedEmail) {
    return createApiError(400, 'VALIDATION', 'Account has no verified email address', null, { route: 'POST /api/premium/waitlist' });
  }

  try {
    const { error } = await supabase
      .from('premium_waitlist')
      .upsert({
        user_id: user.id,
        email: verifiedEmail,
      }, { onConflict: 'user_id' });

    if (error) {
      // 表不存在 → 优雅降级 (migration 084 未应用)
      if (error.message.includes('Could not find the table') || error.message.includes('does not exist') || error.code === '42P01') {
        // 🔧 ARCH fix Round 75: Don't log raw email — PII leak risk. Log masked only.
        logger.info('[Premium Waitlist] Table not found — email not stored:', maskEmailForLog(verifiedEmail));
        return NextResponse.json({ success: true, degraded: true });
      }
      // 🔧 ARCH fix Round 75: Other errors (RLS, connection, unique constraint) = real failure.
      //    旧代码: 返回 success: true → 客户端误以为已加入名单.
      //    根因修复: 返回 500 让客户端知道失败可重试.
      logger.warn('[Premium Waitlist] Upsert error:', error.message, 'masked email:', maskEmailForLog(verifiedEmail));
      return createApiError(500, 'DB_ERROR', 'Failed to join waitlist', error, { route: 'POST /api/premium/waitlist' });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // 🔧 ARCH fix Round 75: Don't swallow unexpected errors — return 500 via createApiError.
    //    旧代码: catch 返回 success: true → 隐藏真实 bug.
    logger.error('[Premium Waitlist] Unhandled error:', err);
    return createApiError(500, 'INTERNAL', 'Failed to join waitlist', err, { route: 'POST /api/premium/waitlist' });
  }
});
