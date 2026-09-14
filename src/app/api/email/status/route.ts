/**
 * 获取邮箱连接状态
 * GET /api/email/status
 *
 * 🔧 Round 104: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with complex mergeCookies fallback in catch block — withAuth handles
 *    this automatically).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase, user }) => {
  const { data: connections, error } = await supabase
    .from('email_connections')
    .select('id, user_id, email_address, provider, status, last_sync_at, last_history_id, created_at, updated_at, token_expiry')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch email status' }, { status: 500 });
  }

  // 🔧 2026-07-15 (deep audit #15): Check error on count queries (was silently dropping)
  const { count: receiptCount, error: receiptCountErr } = await supabase
    .from('email_receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (receiptCountErr) {
    return NextResponse.json({ error: 'Failed to fetch receipt counts' }, { status: 500 });
  }

  const { count: actionableCount, error: actionableCountErr } = await supabase
    .from('email_receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['detected', 'actionable']);

  if (actionableCountErr) {
    return NextResponse.json({ error: 'Failed to fetch actionable counts' }, { status: 500 });
  }

  return NextResponse.json({
    connections: connections || [],
    totalReceipts: receiptCount || 0,
    actionableReceipts: actionableCount || 0,
  });
});
