import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Handler: add_vitality — Directly adjust companion vitality (0-100).
 *
 * 🔧 ARCH fix (Round 2 C3 — idempotency):
 *    旧代码无 triggerId, 无锁, 无去重 → AI 重试时双倍 vitality 伤害/奖励。
 *    根因修复: 用 ctx.toolCallId 作为 triggerId, 加内存锁 + DB 去重。
 */

import {
  MCPHandlerContext,
  MCPToolResult,
  applyBuddyStateDelta,
  logger,
  getUserLocale,
  isToolCallInProgress,
  releaseToolCallLock,
  isDuplicateHealthEvent,
} from './_shared';
import { vitalityAdjustedDesc } from './descriptions';

export async function handleAddVitality(ctx: MCPHandlerContext): Promise<MCPToolResult> {
  const { toolCallId: id, args, userId } = ctx;
  const argsLocale = args.locale as string | undefined;
  const locale = (argsLocale === 'zh' || argsLocale === 'en') ? argsLocale : await getUserLocale(userId);

  // 参数解析提前 (dedupKey 需要 amount/reason)
  // 🔧 ARCH fix (Round 69 BUG-AUDIT-69-3): 用 Number.isFinite 防 NaN 绕过 validation。
  //    旧代码: const amount = Number(args.amount || 0); — "abc" → NaN, Math.abs(NaN) > 100 为 false,
  //    validation 通过, NaN 传到 applyBuddyStateDelta → RPC 收到 null (JSON.stringify(NaN)="null")。
  //    根因修复: 与 record_impulse / add_tokens / add_dream_fund_progress 一致, 用 Number.isFinite 校验。
  const rawAmount = Number(args.amount || 0);
  if (!Number.isFinite(rawAmount)) {
    return {
      toolCallId: id,
      name: 'add_vitality',
      success: false,
      result: {},
      message: `Invalid vitality amount: ${args.amount}. Must be a finite number between -100 and +100.`,
    };
  }
  const amount = rawAmount;
  const reason = String(args.reason || '');

  // BUG-R4-4 fix: Validate amount range (vitality is 0-100, so delta shouldn't exceed ±100)
  if (Math.abs(amount) > 100) {
    return {
      toolCallId: id,
      name: 'add_vitality',
      success: false,
      result: {},
      message: `Invalid vitality amount: ${amount}. Must be between -100 and +100.`,
    };
  }

  // 🔧 ARCH fix (Round 2 C3): 幂等去重
  // 🔧 ARCH fix (Round 11 adversarial review C1): 用确定性 dedupKey 替代 toolCallId
  //    dedupKey = av:${userId}:${amount}:${reason} (同一调整 = 同一 key)
  // 🔧 Round 28 C2: 用 1 小时时间桶 (同 add_tokens)
  const triggerId = `av:${userId}:${amount}:${reason}:${Math.floor(Date.now() / 3600000)}`;
  const lockKey = `add_vitality:${triggerId}`;

  if (isToolCallInProgress(lockKey)) {
    logger.info(`[MCP] add_vitality: duplicate in-progress call ${id}, skipping`);
    return { toolCallId: id, name: 'add_vitality', success: true, result: {}, message: 'Duplicate request — already being processed.' };
  }

  // 🔧 Round 11 review C1: 传 triggerId 作为 dedupKey (查询 trigger_id=triggerId), 不再传 'chat_mcp'
  if (await isDuplicateHealthEvent(userId, triggerId)) {
    logger.info(`[MCP] add_vitality: duplicate trigger_id ${triggerId}, skipping (idempotent)`);
    releaseToolCallLock(lockKey);
    return { toolCallId: id, name: 'add_vitality', success: true, result: {}, message: 'Vitality already adjusted (duplicate request).' };
  }

  try {
  // 🔧 ARCH fix (Round 2 M7): 若 delta 为 0, 直接返回 (避免无意义的 DB 写入)
  if (amount === 0) {
    return {
      toolCallId: id,
      name: 'add_vitality',
      success: true,
      result: { vitalityChange: 0, newVitality: undefined, reason, note: 'No change (amount=0)' },
      message: `Vitality unchanged (amount=0). Reason: ${reason}`,
    };
  }

  // BUG-94 fix: atomic delta update
  const result = await applyBuddyStateDelta(userId, {
    vitalityDelta: amount,
  });

  // Create health_event audit record (BUG-84 fix: audit-only)
  // 🔧 Round 2 C3: 传 triggerId 启用唯一约束
  // 🔧 ARCH fix (Round 41 MEDIUM-3): 跟踪 auditLogged flag (同 add_tokens)
  let auditLogged = true;
  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    await createHealthEvent({
      userId,
      eventType: 'manual_adjustment',
      triggerSource: 'chat_mcp',
      triggerId,
      description: vitalityAdjustedDesc(locale, amount, result.vitality, reason),
      metadata: { amount, reason, newVitality: result.vitality },
      vitalityOverride: 0,  // audit-only: applyBuddyStateDelta already applied
    });
  } catch (e) {
    logger.warn('[MCP] add_vitality: failed to create health_event (non-critical):', e);
    auditLogged = false;
  }

  return {
    toolCallId: id,
    name: 'add_vitality',
    success: result.success,
    result: { vitalityChange: amount, newVitality: result.vitality, reason, auditLogged },
    message: result.success
      ? `Vitality ${amount > 0 ? '+' : ''}${amount} → ${result.vitality}. Reason: ${reason}`
      : `Failed to update vitality: ${result.error || 'unknown error'}`,
  };
  } finally {
    releaseToolCallLock(lockKey);
  }
}
