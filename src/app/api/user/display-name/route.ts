/**
 * /api/user/display-name — 更新用户显示名
 *
 * POST — 更新 profiles.display_name + user_metadata.full_name
 *
 * 🔧 P2-3 fix: 用户名默认为邮箱前缀问题 — 让用户自定义显示名。
 *    - profiles.display_name: 服务端存储 (供后端 MCP/health_event 使用)
 *    - user_metadata.full_name: 客户端立即生效 (profile-tab.tsx 读取)
 *
 * 安全: 仅认证用户可更新自己的 display_name (RLS 保护)。
 *
 * 🔧 Round 113: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 3 of 4 returns — auth cookie refresh was lost).
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const displayNameSchema = z.object({
  displayName: z.string()
    .min(1, 'Display name must not be empty')
    .max(30, 'Display name must be 30 characters or fewer')
    .trim(),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const body = await validateBody(request, displayNameSchema);
  if (isValidationError(body)) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const displayName = body.displayName;

  // 1. Update profiles.display_name (server-side source of truth)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (profileError) {
    return NextResponse.json({ error: 'Failed to update display name' }, { status: 500 });
  }

  // 2. Update user_metadata.full_name (client-side immediate read)
  //    Note: supabase.auth.updateUser updates the JWT, needs mergeCookies for session refresh
  const { error: authError2 } = await supabase.auth.updateUser({
    data: { full_name: displayName },
  });

  if (authError2) {
    // Non-fatal: profile updated successfully, user_metadata update failed
    // Client will fall back to profiles.display_name on next load
    return NextResponse.json({
      success: true,
      displayName,
      warning: 'user_metadata update failed — client may show stale name until refresh',
    });
  }

  return NextResponse.json({ success: true, displayName });
});
