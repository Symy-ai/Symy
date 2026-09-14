/**
 * POST /api/user/locale — 更新用户语言偏好到 profiles 表
 *
 * 用于后端 MCP handler 生成对应语言的 health_event description。
 *
 * 🔧 ARCH fix (Round 2 H7): 同时支持 timezone 字段 (IANA 时区, 如 'Asia/Shanghai')。
 *    后端用 timezone 计算 impulse score 的小时数 (深夜冲动信号)。
 *
 * 🔧 Round 103: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 2 of 5 returns — auth cookie refresh was lost).
 *
 * 🔧 ARCH fix (2026-07-21): Replaced `as never` with typed `asUpdate` helper.
 *    Old: .update(updateData as never) — bypassed ALL type checking
 *    New: .update(asUpdate<ProfilesUpdate>(updateData)) — typed cast, catches schema changes
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { asUpdate } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type ProfilesUpdate = Database['public']['Tables']['profiles']['Update'];

const localeSchema = z.object({
  locale: z.enum(['en', 'zh']).optional(),
  timezone: z.string().regex(/^[A-Za-z_]+(\/[A-Za-z_-]+)*$/, 'Invalid timezone (must be IANA format, e.g., "Asia/Shanghai" or "UTC")').optional(),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const body = await validateBody(request, localeSchema);
  if (isValidationError(body)) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // 构建 update 对象 — 只更新提供的字段
  const updateData: ProfilesUpdate = {};
  if (body.locale !== undefined) updateData.locale = body.locale;
  if (body.timezone !== undefined) updateData.timezone = body.timezone;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update (provide locale and/or timezone)' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update(asUpdate<ProfilesUpdate>(updateData))
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...updateData });
});
