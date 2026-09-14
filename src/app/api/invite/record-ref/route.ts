/**
 * POST /api/invite/record-ref — 记录被邀请关系 (需求七)
 *
 * 🔧 需求七: 好友通过邀请链接注册后, 记录 ref 关系
 *    - 前端: 用户访问 ?ref=CODE → 存 localStorage → 登录后 POST 此接口
 *    - 后端: 查 referrer (by ref_code) → 插入 invitations (status=pending)
 *    - 防滥用: referee 已有 invitation → 跳过 (一个用户只能被邀请一次)
 *
 * 请求体: { refCode: string }
 * 响应: { success: boolean, recorded: boolean }
 *
 * 🔧 ARCH fix Round 74 (Finding 16): Migrated to withAuth HOF.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { createApiError } from '@/lib/api-error';
import { z } from 'zod';

const refSchema = z.object({
  refCode: z.string().trim().min(1).max(100),
});

export const POST = withAuth(async ({ supabase, user, request }) => {
  const body = await validateBody(request, refSchema);
  if (isValidationError(body)) return body;

  try {
    // 1. 查 referrer by ref_code
    const { data: referrer, error: referrerErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('ref_code', body.refCode)
      .maybeSingle();

    // ref_code 列不存在 → 优雅降级
    if (referrerErr && (referrerErr.message.includes('Could not find the column') || referrerErr.message.includes('does not exist') || referrerErr.code === '42703')) {
      logger.info('[Invite RecordRef] ref_code column not found — skipping');
      return NextResponse.json({ success: true, recorded: false, degraded: true });
    }

    if (referrerErr) {
      logger.warn('[Invite RecordRef] referrer query error:', referrerErr.message);
      return NextResponse.json({ success: true, recorded: false });
    }

    if (!referrer) {
      logger.info(`[Invite RecordRef] ref_code "${body.refCode}" not found`);
      return NextResponse.json({ success: true, recorded: false });
    }

    const referrerId = referrer.id as string;

    // 防滥用: referee == referrer (自己邀请自己)
    if (referrerId === user.id) {
      logger.info('[Invite RecordRef] Self-invitation, skipping');
      return NextResponse.json({ success: true, recorded: false });
    }

    // 2. 检查 referee 是否已有 invitation
    // 🔧 ARCH fix Round 75 (Finding 31): Check error from existing query (was silently discarded)
    const { data: existing, error: existingErr } = await supabase
      .from('invitations')
      .select('id, status')
      .eq('referee_user_id', user.id)
      .maybeSingle();

    if (existingErr) {
      // 表不存在 → 优雅降级 (migration 086 未应用)
      if (existingErr.message.includes('Could not find the table') || existingErr.message.includes('does not exist') || existingErr.code === '42P01') {
        logger.info('[Invite RecordRef] invitations table not found — skipping');
        return NextResponse.json({ success: true, recorded: false, degraded: true });
      }
      // 🔧 ARCH fix Round 75: Other DB errors = real failure, return 500 (not swallowed)
      logger.warn('[Invite RecordRef] existing query error:', existingErr.message);
      return createApiError(500, 'DB_ERROR', 'Failed to check existing invitation', existingErr, { route: 'POST /api/invite/record-ref' });
    }

    if (existing) {
      logger.info(`[Invite RecordRef] referee ${user.id} already has invitation (status=${existing.status})`);
      return NextResponse.json({ success: true, recorded: false });
    }

    // 3. 插入 pending invitation
    // 🔧 2026-07-15 (migration 111 兼容): 用 admin client — migration 111 REVOKE 了
    //    authenticated 对 invitations 的 INSERT 权限 (防止伪造 referrer)
    //    服务端 INSERT 是安全的 (referrerId 来自 query param, referee_user_id 来自 auth)
    const { createAdminClient } = await import('@/lib/supabase-admin');
    const { supabase: adminSupa } = createAdminClient();
    const insertClient = adminSupa || supabase;
    const { error: insertErr } = await insertClient
      .from('invitations')
      .insert({
        referrer_user_id: referrerId,
        referee_user_id: user.id,
        referee_email: user.email || null,
        status: 'pending',
        reward_amount: 50,
      });

    if (insertErr) {
      if (insertErr.message.includes('Could not find the table') || insertErr.message.includes('does not exist') || insertErr.code === '42P01') {
        logger.info('[Invite RecordRef] invitations table not found — skipping');
        return NextResponse.json({ success: true, recorded: false, degraded: true });
      }
      if (insertErr.code === '23505') {
        // Unique constraint = concurrent insert race, referee already invited — not an error
        logger.info('[Invite RecordRef] concurrent insert — referee already invited');
        return NextResponse.json({ success: true, recorded: false });
      }
      // 🔧 ARCH fix Round 75: Other insert errors = real failure, return 500 (not swallowed)
      logger.warn('[Invite RecordRef] insert error:', insertErr.message);
      return createApiError(500, 'DB_ERROR', 'Failed to record invitation', insertErr, { route: 'POST /api/invite/record-ref' });
    }

    logger.info(`[Invite RecordRef] Recorded: referrer=${referrerId}, referee=${user.id}`);
    return NextResponse.json({ success: true, recorded: true });
  } catch (err) {
    // 🔧 ARCH fix Round 75: Don't swallow unexpected errors — return 500 via createApiError
    logger.error('[Invite RecordRef] Unhandled error:', err);
    return createApiError(500, 'INTERNAL', 'Failed to record invitation', err, { route: 'POST /api/invite/record-ref' });
  }
});
