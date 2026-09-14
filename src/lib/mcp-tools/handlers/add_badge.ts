import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Handler: add_badge — Award a badge to the user.
 *
 * 🔧 ARCH fix (Round 11 C3 — add_badge 无幂等保护):
 *    旧代码无 isToolCallInProgress / isDuplicateHealthEvent / triggerId → AI 重试 (网络抖动)
 *    会创建多条 challenge_reward health_event, "Badge unlocked: X" 在 Health Log 出现 2-5 次。
 *    其他 5 个 handler (record_impulse / add_tokens / add_vitality / complete_challenge /
 *    add_dream_fund_progress) 都有标准 3 层幂等, 唯独 add_badge 缺失。
 *    根因修复: 复制 add_tokens.ts 的幂等模式, triggerId = `ab:${toolCallId}:${badgeId}`。
 */

import {
  MCPHandlerContext,
  MCPToolResult,
  applyBuddyStateDelta,
  getBuddyStateForRead,
  logger,
  getUserLocale,
  isToolCallInProgress,
  releaseToolCallLock,
  isDuplicateHealthEvent,
} from './_shared';
// 🔧 Bug 28 fix: 用多语言 description 函数替代硬编码英文
import { badgeUnlockedDesc } from './descriptions';

export async function handleAddBadge(ctx: MCPHandlerContext): Promise<MCPToolResult> {
  const { toolCallId: id, args, userId, supabase } = ctx;
  const argsLocale = args.locale as string | undefined;
  // 🔧 Bug 28 fix: 用 locale (而非 _locale) 传给 badgeUnlockedDesc
  const locale = (argsLocale === 'zh' || argsLocale === 'en') ? argsLocale : await getUserLocale(userId);

  const badgeId = String(args.badge_id || '');

  const badgeNames: Record<string, string> = {
    impulse_shield: 'Impulse Shield',
    first_save: 'First Save',
    streak_7: '7-Day Streak',
    boss_slayer: 'Boss Slayer',
    rational_lawyer: 'Rational Lawyer',
    dream_builder: 'Dream Builder',
  };

  // 🔧 ARCH fix (Round 11 C3): 幂等去重 — triggerId 包含 badgeId 防同一 badge 重复奖励
  // 🔧 ARCH fix (Round 11 adversarial review C1): 用确定性 dedupKey 替代 toolCallId
  //    dedupKey = ab:${userId}:${badgeId} (同一 badge = 同一 key, AI 重试同一 badge 命中)
  // 🔧 Round 28 C2: 用 1 小时时间桶 (同 add_tokens)
  const triggerId = `ab:${userId}:${badgeId}:${Math.floor(Date.now() / 3600000)}`;
  const lockKey = `add_badge:${triggerId}`;

  // 1. 内存锁防同一实例并发
  if (isToolCallInProgress(lockKey)) {
    logger.info(`[MCP] add_badge: duplicate in-progress call ${id}, skipping`);
    return {
      toolCallId: id,
      name: 'add_badge',
      success: true,
      result: {},
      message: 'Duplicate request — already being processed.',
    };
  }

  try {
  // Pre-read badges to check if already owned (non-critical for display, RPC handles dedup)
  const currentForDisplay = await getBuddyStateForRead(supabase, userId);
  const existingBadges = (currentForDisplay?.badges as string[]) || [];
  const alreadyHadBadge = existingBadges.includes(badgeId);

  if (alreadyHadBadge) {
    return {
      toolCallId: id,
      name: 'add_badge',
      success: true,
      result: { badgeId, badgeName: badgeNames[badgeId] || badgeId, alreadyHad: true },
      message: `User already has badge: ${badgeId}`,
    };
  }

  // 2. DB 去重检查 (防跨实例/AI 重试) — 修正: 传 triggerId 作为 dedupKey
  if (await isDuplicateHealthEvent(userId, triggerId)) {
    logger.info(`[MCP] add_badge: duplicate trigger_id ${triggerId}, skipping (idempotent)`);
    return {
      toolCallId: id,
      name: 'add_badge',
      success: true,
      result: { badgeId, badgeName: badgeNames[badgeId] || badgeId, alreadyAwarded: true },
      message: `Badge already awarded (duplicate request).`,
    };
  }

  // BUG-94 fix: atomic update — RPC handles dedup internally
  const result = await applyBuddyStateDelta(userId, {
    addBadges: [badgeId],
  });

  if (!result.success) {
    return { toolCallId: id, name: 'add_badge', success: false, result: {}, message: `Failed to award badge: ${result.error}` };
  }

  // Create health_event audit record (badge award also recorded)
  // 🔧 Round 11 C3: 传 triggerId 启用唯一约束, 防止 AI 重试时重复插审计记录
  // 🔧 ARCH fix (Round 41 MEDIUM-3): 跟踪 auditLogged flag (同 add_tokens)
  let auditLogged = true;
  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    await createHealthEvent({
      userId,
      eventType: 'challenge_reward',
      triggerSource: 'chat_mcp',
      triggerId,
      description: badgeUnlockedDesc(locale, badgeNames[badgeId] || badgeId),
      metadata: { badgeId, badgeName: badgeNames[badgeId] || badgeId },
      vitalityOverride: 0,
      tokenOverride: 0,
    });
  } catch (e) {
    logger.warn('[MCP] add_badge: failed to create health_event (non-critical):', e);
    auditLogged = false;
  }

  return {
    toolCallId: id,
    name: 'add_badge',
    success: true,
    result: { badgeId, badgeName: badgeNames[badgeId] || badgeId, alreadyHad: false, auditLogged },
    message: `Badge unlocked: ${badgeNames[badgeId] || badgeId}!`,
  };
  } finally {
    releaseToolCallLock(lockKey);
  }
}

