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
  const requestId = Math.random().toString(36).substring(2, 10);
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
  } catch (err) {
    logger.error('[Export] profiles fetch_failed', { section: 'profiles', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] buddy_state fetch_failed', { section: 'buddy_state', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] dream_funds fetch_failed', { section: 'dream_funds', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] active_challenges fetch_failed', { section: 'active_challenges', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] chat_messages fetch_failed', { section: 'chat_messages', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] health_events fetch_failed', { section: 'health_events', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] impulse_events fetch_failed', { section: 'impulse_events', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] user_embeddings fetch_failed', { section: 'user_embeddings', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] email_receipts fetch_failed', { section: 'email_receipts', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] invitations fetch_failed', { section: 'invitations', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] butterfly_sessions fetch_failed', { section: 'butterfly_sessions', requestId, userId, error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    logger.error('[Export] challenge_participants fetch_failed', { section: 'challenge_participants', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.challenge_participants = { error: 'fetch_failed' };
  }

  // 🔧 R571 fix: GDPR 数据可携带权补全 — 旧代码仅导 12 表, 用户数据表实有 25 张
  //    补 12 表: user_inventory / shopping_facts / refund_requests / heal_sessions /
  //    daily_reflections / daily_reflection_votes / inward_daily_reflection /
  //    inward_reflection_resonates / inward_why_wall / user_intervention_profile /
  //    premium_waitlist / push_notification_log
  //    push_subscriptions 单独处理 (设备凭据列过滤)

  // 13. user_inventory
  try {
    const { data, error } = await supabase
      .from('user_inventory')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] user_inventory query error:', error.message);
    exportData.user_inventory = data || [];
  } catch (err) {
    logger.error('[Export] user_inventory fetch_failed', { section: 'user_inventory', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.user_inventory = { error: 'fetch_failed' };
  }

  // 14. shopping_facts
  try {
    const { data, error } = await supabase
      .from('shopping_facts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] shopping_facts query error:', error.message);
    exportData.shopping_facts = data || [];
  } catch (err) {
    logger.error('[Export] shopping_facts fetch_failed', { section: 'shopping_facts', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.shopping_facts = { error: 'fetch_failed' };
  }

  // 15. refund_requests
  try {
    const { data, error } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] refund_requests query error:', error.message);
    exportData.refund_requests = data || [];
  } catch (err) {
    logger.error('[Export] refund_requests fetch_failed', { section: 'refund_requests', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.refund_requests = { error: 'fetch_failed' };
  }

  // 16. heal_sessions
  try {
    const { data, error } = await supabase
      .from('heal_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] heal_sessions query error:', error.message);
    exportData.heal_sessions = data || [];
  } catch (err) {
    logger.error('[Export] heal_sessions fetch_failed', { section: 'heal_sessions', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.heal_sessions = { error: 'fetch_failed' };
  }

  // 17. daily_reflections
  try {
    const { data, error } = await supabase
      .from('daily_reflections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] daily_reflections query error:', error.message);
    exportData.daily_reflections = data || [];
  } catch (err) {
    logger.error('[Export] daily_reflections fetch_failed', { section: 'daily_reflections', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.daily_reflections = { error: 'fetch_failed' };
  }

  // 18. daily_reflection_votes
  try {
    const { data, error } = await supabase
      .from('daily_reflection_votes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] daily_reflection_votes query error:', error.message);
    exportData.daily_reflection_votes = data || [];
  } catch (err) {
    logger.error('[Export] daily_reflection_votes fetch_failed', { section: 'daily_reflection_votes', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.daily_reflection_votes = { error: 'fetch_failed' };
  }

  // 19. inward_daily_reflection
  try {
    const { data, error } = await supabase
      .from('inward_daily_reflection')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] inward_daily_reflection query error:', error.message);
    exportData.inward_daily_reflection = data || [];
  } catch (err) {
    logger.error('[Export] inward_daily_reflection fetch_failed', { section: 'inward_daily_reflection', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.inward_daily_reflection = { error: 'fetch_failed' };
  }

  // 20. inward_reflection_resonates
  try {
    const { data, error } = await supabase
      .from('inward_reflection_resonates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] inward_reflection_resonates query error:', error.message);
    exportData.inward_reflection_resonates = data || [];
  } catch (err) {
    logger.error('[Export] inward_reflection_resonates fetch_failed', { section: 'inward_reflection_resonates', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.inward_reflection_resonates = { error: 'fetch_failed' };
  }

  // 21. inward_why_wall
  try {
    const { data, error } = await supabase
      .from('inward_why_wall')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] inward_why_wall query error:', error.message);
    exportData.inward_why_wall = data || [];
  } catch (err) {
    logger.error('[Export] inward_why_wall fetch_failed', { section: 'inward_why_wall', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.inward_why_wall = { error: 'fetch_failed' };
  }

  // 22. user_intervention_profile
  try {
    const { data, error } = await supabase
      .from('user_intervention_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) logger.warn('[Export] user_intervention_profile query error:', error.message);
    exportData.user_intervention_profile = data || null;
  } catch (err) {
    logger.error('[Export] user_intervention_profile fetch_failed', { section: 'user_intervention_profile', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.user_intervention_profile = { error: 'fetch_failed' };
  }

  // 23. premium_waitlist
  try {
    const { data, error } = await supabase
      .from('premium_waitlist')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] premium_waitlist query error:', error.message);
    exportData.premium_waitlist = data || [];
  } catch (err) {
    logger.error('[Export] premium_waitlist fetch_failed', { section: 'premium_waitlist', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.premium_waitlist = { error: 'fetch_failed' };
  }

  // 24. push_notification_log
  try {
    const { data, error } = await supabase
      .from('push_notification_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] push_notification_log query error:', error.message);
    exportData.push_notification_log = data || [];
  } catch (err) {
    logger.error('[Export] push_notification_log fetch_failed', { section: 'push_notification_log', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.push_notification_log = { error: 'fetch_failed' };
  }

  // 25. push_subscriptions — 设备凭据列过滤 (endpoint/p256dh_key/auth_key 是
  //     Web Push 密钥材料, 导出文件属用户自留文件但无必要携带; 只导偏好与时间戳)
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, preferences, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) logger.warn('[Export] push_subscriptions query error:', error.message);
    exportData.push_subscriptions = data || [];
  } catch (err) {
    logger.error('[Export] push_subscriptions fetch_failed', { section: 'push_subscriptions', requestId, userId, error: err instanceof Error ? err.message : String(err) });
    exportData.push_subscriptions = { error: 'fetch_failed' };
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
