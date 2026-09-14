/**
 * 断开邮箱连接（删除 OAuth tokens）
 * DELETE /api/email/disconnect?connectionId=xxx
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export const DELETE = withAuth(async ({ request, supabase, user }) => {
  const connectionId = request.nextUrl.searchParams.get('connectionId');

  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 });
  }

  const { error } = await supabase
    .from('email_connections')
    .delete()
    .eq('id', connectionId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
