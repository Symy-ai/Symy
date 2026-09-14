/**
 * GET /api/invite/link — 获取用户的邀请链接 (需求七)
 *
 * 🔧 需求七: Profile 页面"邀请好友"入口
 *    - 首次访问时生成 8 字符 ref_code (存入 profiles.ref_code)
 *    - 返回 { refCode, inviteLink, stats: { totalInvited, completed } }
 *
 * 优雅降级: ref_code 列不存在 → 返回 fallback (用 user.id 作为 ref)
 *
 * 🔧 ARCH fix Round 74 (Finding 16): Migrated to withAuth HOF.
 * 🔧 ARCH fix Round 74 (Finding 6): ref_code UPDATE 后 re-read 验证实际存储值.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { generateRefCode } from '@/lib/invitation-reward';

const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || VERCEL_URL;

function getAppBaseUrl(): string {
  if (!APP_BASE_URL) {
    throw new Error('NEXT_PUBLIC_APP_URL or VERCEL_URL is required.');
  }
  return APP_BASE_URL;
}

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    // 1. 查 profiles.ref_code
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('ref_code')
      .eq('id', user.id)
      .maybeSingle();

    let refCode = profile?.ref_code as string | null;

    // 列不存在 → 优雅降级 (用 user.id 前 8 字符)
    if (profileErr && (profileErr.message.includes('Could not find the column') || profileErr.message.includes('does not exist') || profileErr.code === '42703')) {
      logger.info('[Invite Link] ref_code column not found — using user.id fallback');
      refCode = user.id.substring(0, 8);
      return NextResponse.json({
        refCode,
        inviteLink: `${getAppBaseUrl()}/?ref=${refCode}`,
        stats: { totalInvited: 0, completed: 0 },
        degraded: true,
      });
    }

    if (profileErr) {
      logger.warn('[Invite Link] profile fetch error:', profileErr.message);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    // 2. 若无 ref_code → 生成并更新 (重试 3 次防碰撞)
    // 🔧 ARCH fix Round 74 (Finding 6): UPDATE 后 re-read 验证实际存储值.
    // 🔧 2026-07-15 (migration 111 兼容): 用 admin client — ref_code 不在 authenticated GRANT 列表
    if (!refCode) {
      const { createAdminClient } = await import('@/lib/supabase-admin');
      const { supabase: adminSupa } = createAdminClient();
      const writeClient = adminSupa || supabase;
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = generateRefCode();
        const { error: updateErr } = await writeClient
          .from('profiles')
          .update({ ref_code: candidate })
          .eq('id', user.id)
          .is('ref_code', null);
        if (!updateErr) {
          // 🔧 ARCH fix Round 74: Re-read to verify the UPDATE actually took effect.
          const { data: reRead, error: reReadErr } = await supabase
            .from('profiles')
            .select('ref_code')
            .eq('id', user.id)
            .maybeSingle();
          if (!reReadErr && reRead?.ref_code) {
            refCode = reRead.ref_code as string;
            break;
          }
          logger.info(`[Invite Link] UPDATE succeeded but re-read missing ref_code on attempt ${attempt + 1}, retrying`);
          continue;
        }
        if (updateErr.code === '23505') {
          logger.info(`[Invite Link] ref_code collision on attempt ${attempt + 1}, retrying`);
          continue;
        }
        logger.warn('[Invite Link] Failed to set ref_code:', updateErr.message);
        break;
      }
    }

    if (!refCode) {
      refCode = user.id.substring(0, 8);
    }

    // 3. 查邀请统计
    let stats = { totalInvited: 0, completed: 0 };
    try {
      const { data: invitations, error: invErr } = await supabase
        .from('invitations')
        .select('status')
        .eq('referrer_user_id', user.id);
      if (!invErr && invitations) {
        stats = {
          totalInvited: invitations.length,
          completed: invitations.filter(i => i.status === 'completed').length,
        };
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      logger.info('[Invite Link] invitations table not found, stats=0');
    }

    return NextResponse.json({
      refCode,
      inviteLink: `${getAppBaseUrl()}/?ref=${refCode}`,
      stats,
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Invite Link] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
