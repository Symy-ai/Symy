import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Handler: add_tokens — Award tokens to the user.
 *
 * 🔧 ARCH fix (Round 2 C3 — idempotency):
 *    旧代码无 triggerId, 无锁, 无去重 → AI 重试时双倍奖励。
 *    根因修复: 用 ctx.toolCallId 作为 triggerId, 加内存锁 + DB 去重。
 */

import {
  MCPHandlerContext,
  MCPToolResult,
  applyBuddyStateDelta,
  logger,
  getUserLocale,
  DEFAULT_LEVEL,
  isToolCallInProgress,
  releaseToolCallLock,
  isDuplicateHealthEvent,
} from './_shared';
import { tokensAwardedDesc } from './descriptions';

export async function handleAddTokens(ctx: MCPHandlerContext): Promise<MCPToolResult> {
  const { toolCallId: id, args, userId } = ctx;
  const argsLocale = args.locale as string | undefined;
  const locale = (argsLocale === 'zh' || argsLocale === 'en') ? argsLocale : await getUserLocale(userId);

  // 🔧 状态外置: 参数默认值 + 校验 (提前到 dedup 之前, 因 dedupKey 需确定的 amount/reason)
  // amount: 推荐 1-20, 默认 3 (pleasure 场景)
  // reason: 默认 "pleasure" (AI 不确定时用 pleasure)
  // 🔧 M2 fix: Number.isFinite 防 NaN 绕过
  const rawAmount = Number(args.amount ?? 3);
  if (!Number.isFinite(rawAmount) || rawAmount < 1) {
    logger.warn(`[MCP] add_tokens: invalid amount=${args.amount}, using default 3`);
  }
  const amount = Math.max(1, Math.min(50, Number.isFinite(rawAmount) ? rawAmount : 3)); // 🔧 默认 3, 限制 1-50
  const reason = String(args.reason || 'pleasure');
  const vitalityBoost = reason === 'survival' ? 2 : reason === 'growth' ? 5 : 3;
  const xpGain = reason === 'growth' ? 20 : reason === 'pleasure' ? 15 : 10;

  // 🔧 ARCH fix (Round 2 C3): 幂等去重
  // 🔧 ARCH fix (Round 28 audit C2 — triggerId 含 toolCallId → dedup 永不匹配):
  //    Round 21 加 toolCallId (假设 Letta 重试用相同 request id — 未验证, 可能错误)。
  //    Round 28 审计发现: Letta SDK 可能每次重试生成新 id → dedup 永不匹配 → 双倍奖励。
  //    根因修复: 用 1 小时时间桶 (同小时内相同操作 dedup, 不同小时允许)。
  //    - Letta 重试通常在几秒内 → 同小时 → dedup 命中
  //    - 用户两次不同奖励 (如 1 小时后再次 +5 tokens) → 不同小时 → 不误杀
  const triggerId = `at:${userId}:${amount}:${reason}:${Math.floor(Date.now() / 3600000)}`;
  const lockKey = `add_tokens:${triggerId}`;

  if (isToolCallInProgress(lockKey)) {
    logger.info(`[MCP] add_tokens: duplicate in-progress call ${id}, skipping`);
    return { toolCallId: id, name: 'add_tokens', success: true, result: {}, message: 'Duplicate request — already being processed.' };
  }

  // 🔧 Round 11 review C1: 传 triggerId 作为 dedupKey (查询 trigger_id=triggerId), 不再传 'chat_mcp'
  if (await isDuplicateHealthEvent(userId, triggerId)) {
    logger.info(`[MCP] add_tokens: duplicate trigger_id ${triggerId}, skipping (idempotent)`);
    releaseToolCallLock(lockKey);
    return { toolCallId: id, name: 'add_tokens', success: true, result: {}, message: 'Tokens already awarded (duplicate request).' };
  }

  try {
  // BUG-94 fix: atomic delta update — no more read→calc→write
  const result = await applyBuddyStateDelta(userId, {
    tokenDelta: amount,
    vitalityDelta: vitalityBoost,
    xpDelta: xpGain,
  });

  if (!result.success) {
    return { toolCallId: id, name: 'add_tokens', success: false, result: {}, message: `Failed to update buddy state: ${result.error}` };
  }

  const newLevel = result.level ?? DEFAULT_LEVEL;

  // Create health_event audit record (BUG-84 fix: audit-only, no longer modifies buddy_state)
  // 🔧 Round 2 C3: 传 triggerId 启用唯一约束
  // 🔧 ARCH fix (Round 41 MEDIUM-3 — audit log 失败静默, 用户不知 Health Log 缺记录):
  //    旧代码: catch + logger.warn, 但 return success: true 不含 auditLogged flag。
  //    根因修复: 跟踪 auditLogged, false 时 result 含 auditLogged: false, 前端可显示次要 toast。
  let auditLogged = true;
  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    await createHealthEvent({
      userId,
      eventType: 'challenge_reward',
      triggerSource: 'chat_mcp',
      triggerId,
      description: tokensAwardedDesc(locale, amount, reason, vitalityBoost, xpGain),
      metadata: { amount, reason, vitalityBoost, xpGain, newTokens: result.tokens, newVitality: result.vitality },
      vitalityOverride: 0,  // audit-only: applyBuddyStateDelta already applied the change
      tokenOverride: 0,     // audit-only: double-write would cause BUG-84
    });
  } catch (e) {
    logger.warn('[MCP] add_tokens: failed to create health_event (non-critical):', e);
    auditLogged = false;
  }

  return {
    toolCallId: id,
    name: 'add_tokens',
    success: true,
    result: {
      tokensAdded: amount,
      vitalityBoost,
      newTokens: result.tokens,
      newVitality: result.vitality,
      xpGain,
      newLevel,
      auditLogged,
    },
    message: `Awarded ${amount} tokens (${reason}). Vitality +${vitalityBoost}. XP +${xpGain}.`,
  };
  } finally {
    releaseToolCallLock(lockKey);
  }
}
