/**
 * GET /api/user/export-data — GDPR Article 15: 数据导出
 *
 * 🔧 2026-07-15 (ARCH-13 #3 修复): GDPR 合规 — 用户可获取自己的所有数据
 *
 * 导出内容:
 * 1. profiles (用户基本信息)
 * 2. buddy_state (游戏状态)
 * 3. dream_funds (梦想基金)
 * 4. active_challenges (挑战记录)
 * 5. chat_messages (聊天历史)
 * 6. health_events (健康事件日志)
 * 7. impulse_events (冲动消费记录)
 * 8. user_embeddings (RAG embedding 元数据, 不含 vector)
 * 9. email_receipts (邮件收据)
 * 10. invitations (邀请记录)
 * 11. butterfly_sessions (蝴蝶效应会话)
 * 12. challenge_participants (社区挑战参与)
 *
 * 返回: JSON 格式的完整用户数据
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = withAuth(async ({ supabase, user }) => {
  const userId = user.id;
  const exportData: Record<string, unknown> = {
    exportInfo: {
      userId,
      exportedAt: new Date().toISOString(),
      format: 'JSON',
      note: 'GDPR Article 15 — Right of Access. This file contains all your data stored in Symy.',
    },
  };

  // 1. profiles
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) logger.warn('[Export] profiles query error:', error.message);
    exportData.profiles = data || null;
  } catch (_err) {
    exportData.profiles = { error: 'fetch_failed' };
  }

  // 2. buddy_state
  try {
    const { data, error } = await supabase
      .from('buddy_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) logger.warn('[Export] buddy_state query error:', error.message);
    exportData.buddy_state = data || null;
  } catch (_err) {
    exportData.buddy_state = { error: 'fetch_failed' };
  }

  // 3. dream_funds
  try {
    const { data, error } = await supabase
      .from('dream_funds')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    if (error) logger.warn('[Export] dream_funds query error:', error.message);
    exportData.dream_funds = data || [];
  } catch (_err) {
    exportData.dream_funds = { error: 'fetch_failed' };
  }

  // 4. active_challenges
  try {
    const { data, error } = await supabase
      .from('active_challenges')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] active_challenges query error:', error.message);
    exportData.active_challenges = data || [];
  } catch (_err) {
    exportData.active_challenges = { error: 'fetch_failed' };
  }

  // 5. chat_messages
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) logger.warn('[Export] chat_messages query error:', error.message);
    exportData.chat_messages = data || [];
  } catch (_err) {
    exportData.chat_messages = { error: 'fetch_failed' };
  }

  // 6. health_events
  try {
    const { data, error } = await supabase
      .from('health_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) logger.warn('[Export] health_events query error:', error.message);
    exportData.health_events = data || [];
  } catch (_err) {
    exportData.health_events = { error: 'fetch_failed' };
  }

  // 7. impulse_events
  try {
    const { data, error } = await supabase
      .from('impulse_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) logger.warn('[Export] impulse_events query error:', error.message);
    exportData.impulse_events = data || [];
  } catch (_err) {
    exportData.impulse_events = { error: 'fetch_failed' };
  }

  // 8. user_embeddings (metadata only, no vector)
  try {
    const { data, error } = await supabase
      .from('user_embeddings')
      .select('id, source_type, source_id, content, metadata, embedded_at')
      .eq('user_id', userId)
      .order('embedded_at', { ascending: false })
      .limit(500);
    if (error) logger.warn('[Export] user_embeddings query error:', error.message);
    exportData.user_embeddings = data || [];
  } catch (_err) {
    exportData.user_embeddings = { error: 'fetch_failed' };
  }

  // 9. email_receipts
  try {
    const { data, error } = await supabase
      .from('email_receipts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) logger.warn('[Export] email_receipts query error:', error.message);
    exportData.email_receipts = data || [];
  } catch (_err) {
    exportData.email_receipts = { error: 'fetch_failed' };
  }

  // 10. invitations (as referrer)
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('referrer_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] invitations query error:', error.message);
    exportData.invitations = data || [];
  } catch (_err) {
    exportData.invitations = { error: 'fetch_failed' };
  }

  // 11. butterfly_sessions
  try {
    const { data, error } = await supabase
      .from('butterfly_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] butterfly_sessions query error:', error.message);
    exportData.butterfly_sessions = data || [];
  } catch (_err) {
    exportData.butterfly_sessions = { error: 'fetch_failed' };
  }

  // 12. challenge_participants
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] challenge_participants query error:', error.message);
    exportData.challenge_participants = data || [];
  } catch (_err) {
    exportData.challenge_participants = { error: 'fetch_failed' };
  }

  logger.info(`[Export] Data export completed for user ${userId.substring(0, 8)}`);

  // Return as downloadable JSON file
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="symy-data-export-${userId.substring(0, 8)}-${Date.now()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
