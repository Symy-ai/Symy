/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Handler: record_impulse — Record an induced shopping event.
 *
 * 🔧 ARCH fix (Round 2 C2 — idempotency):
 *    旧代码无 triggerId, 无锁, 无去重 → AI 重试 (超时/网络错误) 时双倍 vitality 伤害 + 重复 impulse_events。
 *    根因修复: 用 ctx.toolCallId 作为 triggerId (Letta 的 tool_call_id 是唯一的), 传入 createHealthEvent
 *    让 trigger_id unique index 生效。同时用 isToolCallInProgress + isDuplicateHealthEvent 双重去重。
 */

import { calculateImpulseDamage } from '@/lib/buddy-defaults';
import {
  MCPHandlerContext,
  MCPToolResult,
  applyBuddyStateDelta,
  getHealthFromVitality,
  logger,
  getUserLocale,
  isToolCallInProgress,
  releaseToolCallLock,
  isDuplicateHealthEvent,
} from './_shared';
import { impulseRecordedDesc, getHourlyRateFromArgs } from './descriptions';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';
// 🔧 P0-2 根因修复 (Round 88): sanitizeHealthDescription 不再需要
//    旧代码依赖 sanitizeHealthDescription 把 undefined 替换为 '?', 治标不治本
//    根因修复: health-impact.ts 确保 newVitality 一定有值 (fallback + SELECT 回填)
//              record_impulse.ts 用真实 newVitality 生成 description, 不再有 undefined
//    sanitizeDisplay (client side) 保留作为最后防线, 但不应再被触发

export async function handleRecordImpulse(ctx: MCPHandlerContext): Promise<MCPToolResult> {
  const { toolCallId: id, args, userId, supabase } = ctx;
  const argsLocale = args.locale as string | undefined;
  const locale = (argsLocale === 'zh' || argsLocale === 'en') ? argsLocale : await getUserLocale(userId);

  // 🔧 镜子哲学 fix: 获取用户时薪 — 用于生命翻译
  const hourlyRate = getHourlyRateFromArgs(args) || await getUserHourlyRate(userId);

  // 🔧 状态外置: 参数默认值 + 校验
  // amount: 必须 > 0 (AI 必须告诉用户花了多少钱)
  // platform: 默认 "unknown" (AI 不确定时用 unknown)
  // impulse_score: 默认 70 (中等诱导，AI 不确定时用 70)
  // 🔧 ARCH fix (Round 11 adversarial review C1): 参数校验提前到 dedup 之前,
  // 因为 dedupKey 需要确定的 amount/platform 才能保证幂等性。
  const rawAmount = Number(args.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {  // 🔧 M2 fix: Number.isFinite 防 NaN 绕过
    logger.warn(`[MCP] record_impulse: invalid amount=${args.amount} (must be a positive number), asking AI to retry`);
    return {
      toolCallId: id,
      name: 'record_impulse',
      success: false,
      result: {},
      message: `Failed: amount must be > 0 (received ${args.amount}). Read the purchase amount from the user's message and retry. Example: if user spent $89, call record_impulse(amount=89, platform="tiktok_shop", impulse_score=75).`,
    };
  }
  const amount = rawAmount;
  const platform = String(args.platform || 'unknown').toLowerCase();
  const impulseScore = Math.max(0, Math.min(100, Number(args.impulse_score ?? 70))); // 🔧 默认 70

  // 🔧 ARCH fix (Round 2 C2): 幂等去重 — 用 toolCallId 作为 triggerId
  // 🔧 ARCH fix (Round 11 adversarial review C1 — toolCallId 不具操作身份 → dedup 失效):
  //    旧代码 triggerId = `ri:${id}` (id 是 toolCallId, 每次 call 不同) →
  //    isDuplicateHealthEvent(userId, 'chat_mcp', triggerId) 查询 trigger_id=triggerId 永远不命中
  //    (因为 triggerId 是 per-call 唯一, 之前的事件有不同 triggerId)。
  //    且 isDuplicateHealthEvent 第 2 参 'chat_mcp' 应为 dedupKey (查询 trigger_id=dedupKey),
  //    传 'chat_mcp' 查的是 trigger_id='chat_mcp' (永不命中)。
  //    根因修复: 用确定性 dedupKey = ri:${userId}:${amount}:${platform} (同一购买 = 同一 key),
  //    既传给 isDuplicateHealthEvent (查询) 又传给 createHealthEvent (写入 trigger_id)。
  //    AI 重试同一操作 → 同一 dedupKey → dedup 命中 → 跳过。
  //    AI 不同操作 → 不同 dedupKey → 不误杀。
  const triggerId = `ri:${userId}:${amount}:${platform}:${Math.floor(Date.now() / 3600000)}`;
  const lockKey = `record_impulse:${triggerId}`;

  // 1. 内存锁防同一实例并发
  if (isToolCallInProgress(lockKey)) {
    logger.info(`[MCP] record_impulse: duplicate in-progress call ${id}, skipping`);
    return {
      toolCallId: id,
      name: 'record_impulse',
      success: true,
      result: {},
      message: 'Duplicate request — already being processed.',
    };
  }

  // 2. DB 去重检查 (防跨实例/AI 重试) — 修正: 传 triggerId 作为 dedupKey (查询 trigger_id=triggerId)
  if (await isDuplicateHealthEvent(userId, triggerId)) {
    logger.info(`[MCP] record_impulse: duplicate trigger_id ${triggerId}, skipping (idempotent)`);
    releaseToolCallLock(lockKey);
    return {
      toolCallId: id,
      name: 'record_impulse',
      success: true,
      result: {},
      message: 'Impulse already recorded (duplicate request).',
    };
  }

  try {

  // 🔧 ARCH fix (Round 30 AUDIT-6 HIGH-3): Cross-source double damage prevention
  //    旧代码: email scan creates 'impulse_damage' (trigger_source='email_receipt'),
  //    AI record_impulse creates 'impulse_confessed' (trigger_source='chat_mcp').
  //    Different trigger_source + trigger_id → both succeed → 1.7x vitality damage.
  //    根因修复: 检查是否有最近的 email_receipt 事件匹配相同 amount + platform,
  //    若有则跳过伤害 (仍记录 confession 事件, 但 vitality=0)
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: existingEmailEvent } = await supabase
    .from('health_events')
    .select('id, description, metadata')
    .eq('user_id', userId)
    .eq('trigger_source', 'email_receipt')
    .eq('event_type', 'impulse_damage')
    .gte('created_at', oneHourAgo)
    .limit(10);
  const hasEmailMatch = (existingEmailEvent || []).some((ev: { metadata?: Record<string, unknown>; description?: string }) => {
    const meta = ev.metadata as { amount?: number; platform?: string } | null;
    const metaAmount = meta?.amount;
    const metaPlatform = meta?.platform;
    // Match by amount (within $0.01) and platform (case-insensitive)
    const amountMatch = metaAmount !== undefined && Math.abs(Number(metaAmount) - amount) < 0.01;
    const platformMatch = metaPlatform !== undefined && String(metaPlatform).toLowerCase() === platform;
    return amountMatch && platformMatch;
  });
  if (hasEmailMatch) {
    logger.info(`[MCP] record_impulse: cross-source dedup — email_receipt event found for $${amount} on ${platform}, skipping damage (recording confession only)`);
    // Record the confession event with 0 damage (for AI context + audit trail)
    try {
      const { createHealthEvent } = await import('@/lib/health-impact');
      await createHealthEvent({
        userId,
        eventType: 'impulse_confessed',
        triggerSource: 'chat_mcp',
        triggerId,
        description: impulseRecordedDesc(locale, amount, platform, impulseScore, 0, undefined, hourlyRate),
        metadata: { amount, platform, impulseScore, crossSourceDedup: true },
        vitalityOverride: 0,
        tokenOverride: 0,
      });
      // safe to ignore: non-critical background operation, error already logged
    } catch (e) {
      logger.warn('[MCP] record_impulse (cross-source dedup): failed to create health_event (non-critical):', e);
    }
    releaseToolCallLock(lockKey);
    return {
      toolCallId: id,
      name: 'record_impulse',
      success: true,
      result: { amount, platform, impulseScore, vitalityPenalty: 0, note: 'Already recorded by email scan — no additional damage applied' },
      message: `Purchase already detected via email receipt scan ($${amount} on ${platform}). No additional vitality damage applied — the email scan already handled it.`,
    };
  }

  // Validate impulse score — score < 60 shouldn't cause damage
  if (impulseScore < 60) {
    // Still record the event but with 0 damage
    // 🔧 ARCH fix (Round 42 REVIEW-6): 跟踪 auditLogged flag (同 add_tokens 等)
    let auditLogged = true;
    try {
      const { createHealthEvent } = await import('@/lib/health-impact');
      await createHealthEvent({
        userId,
        eventType: 'impulse_confessed',
        triggerSource: 'chat_mcp',
        triggerId,  // 🔧 Round 2 C2: 传 triggerId 启用唯一约束
        description: impulseRecordedDesc(locale, amount, platform, impulseScore, 0, undefined, hourlyRate),
        metadata: { amount, platform, impulseScore },
        vitalityOverride: 0,
        tokenOverride: 0,
      });
    } catch (e) {
      logger.warn('[MCP] record_impulse (low score): failed to create health_event (non-critical):', e);
      auditLogged = false;
    }

    return {
      toolCallId: id,
      name: 'record_impulse',
      success: true,
      result: { amount, platform, impulseScore, vitalityPenalty: 0, note: 'Score below impulse threshold (60) — no damage applied', auditLogged },
      message: `Purchase recorded: $${amount} on ${platform} (score: ${impulseScore}). Not induced enough to damage companion vitality.`,
    };
  }

  // Use unified damage formula (via createHealthEvent — atomic RPC BUG-71)
  const calculatedDamage = calculateImpulseDamage(impulseScore, amount);

  // Execute via createHealthEvent, ensuring audit record + atomic vitality update
  // 🔧 ARCH fix (Round 42 REVIEW-B3 — high-score path 也跟踪 auditLogged):
  //    旧代码 (Round 42): 只给 low-score path 加了 auditLogged, high-score 的 3 个 return 都没有。
  //    fallback path (createHealthEvent 失败) 完全没审计 → use-mcp-notifications 不触发 toast。
  //    根因修复: 3 个 return 都加 auditLogged flag。
  // 🔧 P0-2 根因修复 (Round 88): description 不再在 createHealthEvent 之前生成 (那时 newVitality 未知)。
  //    旧代码: `description: impulseRecordedDesc(..., undefined, ...)` 硬编码 undefined →
  //            DB 存的 description 永远是 "clarity -8 → ?" → Book of seeing 显示 "?"
  //    根因修复策略 B (Round 88 最终版): 预读 buddy_state.vitality, 预计算 newVitality,
  //            生成正确 description 一次写入。不依赖 UPDATE (RLS + admin client 复杂)。
  //    注意: 预计算的 newVitality 可能和 RPC 实际计算的差 1-2 (竞态), 但不会是 '?'。
  //    RPC 内部 SELECT FOR UPDATE 保证 vitality 原子更新, description 只是文本近似值。
  let highScoreAuditLogged = true;

  // 🔧 P0-2 fix: 预读当前 vitality, 计算预估 newVitality
  let preCalculatedNewVitality: number | undefined;
  try {
    const { data: bsData } = await supabase
      .from('buddy_state')
      .select('vitality')
      .eq('user_id', userId)
      .maybeSingle();
    const vitality = (bsData as Record<string, unknown> | null)?.vitality;
    if (typeof vitality === 'number' && Number.isFinite(vitality)) {
      preCalculatedNewVitality = Math.max(0, Math.min(100, vitality + calculatedDamage));
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (preReadErr) {
                         // safe to ignore: non-critical background operation, error already logged
    logger.warn('[MCP] record_impulse: failed to pre-read vitality for description:', preReadErr);
  }

  // 用预估 newVitality 生成 description (一次写入, 不需要 UPDATE)
  const preDescription = impulseRecordedDesc(locale, amount, platform, impulseScore, calculatedDamage, preCalculatedNewVitality, hourlyRate);

  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    const healthResult = await createHealthEvent({
      userId,
      eventType: 'impulse_confessed', // User self-reported = impulse_confessed, enjoys 30% damage reduction
      triggerSource: 'chat_mcp',
      triggerId,  // 🔧 Round 2 C2: 传 triggerId 启用唯一约束
      description: preDescription,  // 🔧 P0-2 fix: 用预计算的 description (含真实 newVitality)
      metadata: { amount, platform, impulseScore },
    });

    // 🔧 Round 2 C2: 若是去重结果 (trigger_id 已存在), 不重复插 impulse_events
    if (healthResult.success && !healthResult.deduplicated) {
      // Also record to impulse_events table
      try {
        await supabase.from('impulse_events').insert({
          user_id: userId,
          platform,
          source: 'chat',
          amount,
          impulse_score: impulseScore,
          is_livestream: false,
          is_flash_sale: false,
          reasons: [`AI-detected impulse (score: ${impulseScore})`],
        });
      // safe to ignore: non-critical background operation, error already logged
      } catch (insertErr) {
                            // safe to ignore: non-critical background operation, error already logged
        logger.warn('[MCP] record_impulse: failed to insert impulse_event:', insertErr);
      }

      // 🔧 P0-2 根因修复 (Round 88 策略 B): description 已在 createHealthEvent 之前预计算
      //    不再需要 UPDATE — preDescription 已包含预估 newVitality, 直接用作 message
      //    healthResult.newVitality 是 RPC 返回的精确值 (用于 result.newVitality)
      const finalNewVitality = healthResult.newVitality ?? preCalculatedNewVitality ?? 0;

      return {
        toolCallId: id,
        name: 'record_impulse',
        success: true,
        result: {
          amount,
          platform,
          impulseScore,
          vitalityPenalty: healthResult.vitalityChange,
          newVitality: finalNewVitality,
          health: getHealthFromVitality(finalNewVitality),
          auditLogged: true,
        },
        message: preDescription,  // 用预计算的 description (含预估 newVitality)
      };
    } else if (healthResult.deduplicated) {
      // 去重 — 不重复应用伤害
      return {
        toolCallId: id,
        name: 'record_impulse',
        success: true,
        result: { amount, platform, impulseScore, challengePassed: true, auditLogged: true },
        message: `Impulse already recorded (duplicate). No additional damage applied.`,
      };
    }
    // healthResult.success === false 但未 deduplicated — 落入 fallback
    highScoreAuditLogged = false;
  } catch (e) {
    logger.warn('[MCP] record_impulse: createHealthEvent failed, falling back to atomic delta:', e);
    highScoreAuditLogged = false;
  }

  // Fallback: BUG-94 fix: use atomic delta instead of non-atomic upsert
  const result = await applyBuddyStateDelta(userId, {
    vitalityDelta: calculatedDamage,
    tokenDelta: -1,
  });

  // 🔧 P0-2 根因修复 (Round 88): fallback path 也用真实 vitality 生成 description
  //    result.vitality 应有值 (applyBuddyStateDelta 的 RPC/legacy 都返回 vitality)
  //    若仍缺失, 用 0 兜底 (不再用 '?', 让 UI 显示真实数字)
  const fallbackNewVitality = result.vitality ?? 0;
  const fallbackDescription = result.success
    ? impulseRecordedDesc(locale, amount, platform, impulseScore, calculatedDamage, fallbackNewVitality, hourlyRate)
    : `Failed to record impulse: ${result.error ?? 'unknown error'}`;

  return {
    toolCallId: id,
    name: 'record_impulse',
    success: result.success,
    result: {
      amount,
      platform,
      impulseScore,
      vitalityPenalty: calculatedDamage,
      newVitality: fallbackNewVitality,
      health: result.health ?? getHealthFromVitality(fallbackNewVitality),
      // 🔧 ARCH fix (Round 42 REVIEW-B3): fallback path 审计未落库 (createHealthEvent 失败)
      auditLogged: highScoreAuditLogged,
    },
    message: fallbackDescription,
  };
  } finally {
    releaseToolCallLock(lockKey);
  }
}
