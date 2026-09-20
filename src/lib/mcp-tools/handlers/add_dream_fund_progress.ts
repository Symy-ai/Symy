import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Handler: add_dream_fund_progress — Add saved money to a dream fund.
 *
 * Pure extraction from the original monolithic mcp-tools.ts — behavior unchanged.
 */

import {
  MCPHandlerContext,
  MCPToolResult,
  applyBuddyStateDelta,
  isDuplicateHealthEvent,
  isToolCallInProgress,
  releaseToolCallLock,
  logger,
  getUserLocale,
  DEFAULT_DREAM_FUNDS,
  SAVINGS_FUND_ID,
} from './_shared';
import { dreamFundProgressDesc, getHourlyRateFromArgs } from './descriptions';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';

// 🔧 E5 fix (wool v8 §十四.3): amount 上限对齐产品既有口径 $1M — 同
//    /api/buddy/dream-fund-progress 与 challenge create/complete 的 zod max。
//    LLM 幻觉金额 (如 1e308) 无上限直入 totalSaved 会污染核心指标。
const MAX_DREAM_FUND_AMOUNT = 1_000_000;

// 🔧 E5 fix: 分位精度归一 — String(amount) 浮点串 (0.1+0.2=0.30000000000000004 vs 0.3)
//    会让同额重复调用 dedup 失配 → 双倍入账; 先收敛到分 (cents) 再拼 key。
function amountDedupKey(amount: number): string {
  return String(Math.round(amount * 100) / 100);
}

export async function handleAddDreamFundProgress(ctx: MCPHandlerContext): Promise<MCPToolResult> {
  const { toolCallId: id, args, userId, supabase } = ctx;
  const argsLocale = args.locale as string | undefined;
  const locale = (argsLocale === 'zh' || argsLocale === 'en') ? argsLocale : await getUserLocale(userId);

  // 🔧 镜子哲学 fix: 获取用户时薪 — 用于生命翻译
  const hourlyRate = getHourlyRateFromArgs(args) || await getUserHourlyRate(userId);

  // 🔧 状态外置: fund_id 默认 "auto"（handler 自动选第一个未完成的 fund）
  let fundId = String(args.fund_id || 'auto');
  // 🔧 M2 fix: Number.isFinite 防 NaN 绕过
  const rawAmount = Number(args.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    logger.warn(`[MCP] add_dream_fund_progress: invalid amount=${args.amount} (must be a positive number), asking AI to retry`);
    return {
      toolCallId: id,
      name: 'add_dream_fund_progress',
      success: false,
      result: {},
      message: `Failed: amount must be > 0 (received ${args.amount}). Read the savings amount from the user's context and retry. Example: if user saved $89, call add_dream_fund_progress(fund_id="auto", amount=89).`,
    };
  }
  // 🔧 E5 fix: 幻觉金额上限 — 超限拒绝并日志, 引导 AI 用真实金额重试
  if (rawAmount > MAX_DREAM_FUND_AMOUNT) {
    logger.warn(`[MCP] add_dream_fund_progress: amount=${rawAmount} exceeds cap ${MAX_DREAM_FUND_AMOUNT} — hallucination guard, rejecting`);
    return {
      toolCallId: id,
      name: 'add_dream_fund_progress',
      success: false,
      result: {},
      message: `Failed: amount ${rawAmount} exceeds the maximum of $1,000,000. Do not invent amounts — read the actual savings figure from the user's context and retry with the real value.`,
    };
  }
  const amount = rawAmount;

  // 🔧 NEW-042 fix (Round 53): 查询 dream_funds 表 + 加 created_at tie-breaker
  //   旧问题: sort_order 冲突 → 排序不确定 → 金额加到错误的基金
  //   修复: 加 created_at 二级排序 + 如果所有基金都满了优先选 Savings
  const { data: tableFunds } = await supabase
    .from('dream_funds')
    .select('fund_id, name, target, current, emoji')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  type DreamFundRow = { fund_id: string; name: string; target: number; current: number; emoji: string };
  type DreamFundFE = { id: string; name: string; target: number; current: number; emoji: string };
  const tableFundsMapped: DreamFundFE[] = (tableFunds as DreamFundRow[] || []).map((f: DreamFundRow) => ({
    id: f.fund_id,
    name: f.name,
    target: f.target,
    current: f.current,
    emoji: f.emoji,
  }));
  // fallback: 如果表查询失败或空, 用 DEFAULT_DREAM_FUNDS (至少不会用 stale cache)
  const dreamFundsForCalc: DreamFundFE[] = tableFundsMapped.length > 0 ? tableFundsMapped : DEFAULT_DREAM_FUNDS;

  // Dynamic fund selection: if fundId not found, pick first incomplete fund
  let targetFundForCalc = dreamFundsForCalc.find(f => f.id === fundId);
  if (!targetFundForCalc) {
    // 🔧 NEW-042 fix (Round 53): 找第一个未满的基金; 如果都满了, 优先选 Savings 基金
    targetFundForCalc = dreamFundsForCalc.find(f => f.current < f.target)
      ?? dreamFundsForCalc.find(f => f.id === SAVINGS_FUND_ID)
      ?? dreamFundsForCalc[0];
    if (targetFundForCalc) {
      fundId = targetFundForCalc.id;
    }
  }

  // 内存级锁防止并发执行
  // 🔧 E5 fix: key 中的 amount 同样走分位归一 (与 dedupKey 同族, 防浮点串分叉)
  const lockKey = `dfp:${userId}:${fundId}:${amountDedupKey(amount)}`;
  if (isToolCallInProgress(lockKey)) {
    logger.info(`[MCP] add_dream_fund_progress: in-progress lock hit (key=${lockKey}) — skipping duplicate`);
    return {
      toolCallId: id,
      name: 'add_dream_fund_progress',
      success: true,
      result: { challengePassed: true, fundId, amountAdded: amount },
      message: `Dream fund progress already recorded: $${amount} to ${targetFundForCalc?.name || fundId}`,
    };
  }

  try {
  // 🔧 ARCH fix (Round 30 AUDIT-6 HIGH-2): 检查是否有 unsettled challenge with same amount
  //    旧代码: add_dream_fund_progress 和 /api/buddy/deposit 都能加 dream fund progress
  //    → AI 调 add_dream_fund_progress + 用户点 deposit = 2x 金额, 2x totalSaved, 2x bonus tokens
  //    根因修复: 检查是否有 deposit_status='unsettled' 且 amount 匹配的 challenge,
  //    若有则跳过 (用户会通过 deposit dialog 手动存入)
  const { data: unsettledChallenges } = await supabase
    .from('active_challenges')
    .select('id, amount, deposit_status')
    .eq('user_id', userId)
    .eq('status', 'passed')
    .eq('deposit_status', 'unsettled')
    .order('created_at', { ascending: false })
    .limit(5);
  const hasUnsettledMatch = (unsettledChallenges || []).some(
    (ch: { amount: number }) => Math.abs(Number(ch.amount) - amount) < 0.01
  );
  if (hasUnsettledMatch) {
    logger.info(`[MCP] add_dream_fund_progress: skipping — unsettled challenge with matching amount $${amount} found, user will deposit manually`);
    return {
      toolCallId: id,
      name: 'add_dream_fund_progress',
      success: true,
      result: { challengePassed: true, fundId, amountAdded: 0, skipped: true },
      message: `User has an unsettled challenge for $${amount}. They will deposit manually via the deposit dialog. Do not add dream fund progress — it would double-count.`,
    };
  }

  // DB 级幂等性检查 —— 防止跨实例/跨请求的重复写入
  // dedup key 包含 userId + fundId + amount
  // 🔧 HIGH-1 fix: isDuplicateHealthEvent now uses permanent window (no 60s limit)
  // 注意: 在 fundId 解析后检查，因为 'auto' 需要先解析成真实 fundId
  // 🔧 E5 fix: dedupKey (亦即 health_events.trigger_id 幂等锚点) 的 amount 走分位归一
  const dedupKey = `dfp:${userId}:${fundId}:${amountDedupKey(amount)}`;
  const descPrefix = `Added $${amount} to`;
  const isDup = await isDuplicateHealthEvent(userId, dedupKey, descPrefix);
  if (isDup) {
    logger.info(`[MCP] add_dream_fund_progress: deduplicated (key=${dedupKey}) — skipping duplicate execution`);
    return {
      toolCallId: id,
      name: 'add_dream_fund_progress',
      success: true,
      result: { challengePassed: true, fundId, amountAdded: amount },
      message: `Dream fund progress already recorded: $${amount} to ${targetFundForCalc?.name || fundId}`,
    };
  }

  // 🔧 E5 fix: target<=0 / current<0 是脏数据 — 直接除会得 Infinity/NaN
  //    误发 dream_builder 徽章并把 progress 展示污染成 Infinity。
  //    脏行按 0 进度处理; 除法溢出 (非有限) 同样回落 0, 不参与徽章判定。
  const rawEstimatedProgress = targetFundForCalc && targetFundForCalc.target > 0 && targetFundForCalc.current >= 0
    ? Math.round(((targetFundForCalc.current + amount) / targetFundForCalc.target) * 100)
    : 0;
  const estimatedProgress = Number.isFinite(rawEstimatedProgress) ? rawEstimatedProgress : 0;
  const fundName = targetFundForCalc?.name || fundId;

  // Check if dream_builder badge should be awarded
  const addBadges: string[] = [];
  if (targetFundForCalc && estimatedProgress >= 50) {
    addBadges.push('dream_builder');
  }

  // BUG-94 fix: atomic delta update
  const result = await applyBuddyStateDelta(userId, {
    dreamFundId: fundId,
    dreamFundAmount: amount,
    totalSavedDelta: amount,
    addBadges,
  });

  if (!result.success) {
    return { toolCallId: id, name: 'add_dream_fund_progress', success: false, result: {}, message: `Failed to update dream fund: ${result.error}` };
  }

  // Sync to dream_funds independent table
  // 🔧 Architecture refactor: 改为 await — 之前 fire-and-forget 在 Vercel serverless 上不可靠
  // buddy_state JSONB 是 source of truth，但 dream_funds 表用于独立查询，必须同步成功
  // 🔧 ARCH fix (Round 23 C3 — 用 stale pre-delta current 计算新值, 应用并发写入丢失):
  //    旧代码用 targetFundForCalc.current (RPC 调用前的旧值) 计算 newCurrent。
  //    若并发调用在 read 和 RPC 之间更新了 JSONB, newCurrent 是 stale 的。
  //    根因修复: 用 RPC 返回的 post-delta resultFund.current (同 complete_challenge.ts:428)。
  const resultDreamFundsForSync = result.dreamFunds ?? DEFAULT_DREAM_FUNDS;
  const resultFundForSync = (resultDreamFundsForSync.length > 0 ? resultDreamFundsForSync : DEFAULT_DREAM_FUNDS).find(f => f.id === fundId);
  try {
    if (resultFundForSync) {
      const { error: syncErr } = await supabase
        .from('dream_funds')
        .update({ current: resultFundForSync.current })
        .eq('user_id', userId)
        .eq('fund_id', fundId);
      if (syncErr) logger.warn('[MCP] dream_funds table sync failed (non-critical):', syncErr.message);
    }
  } catch (e) {
    // Non-critical: buddy_state JSONB is the source of truth for this request
    logger.warn('[MCP] dream_funds table sync error:', e);
  }

  // Get accurate progress from the result
  const resultDreamFunds = result.dreamFunds ?? DEFAULT_DREAM_FUNDS;
  const resultFund = (resultDreamFunds.length > 0 ? resultDreamFunds : DEFAULT_DREAM_FUNDS).find(f => f.id === fundId);
  const progress = resultFund ? Math.round((resultFund.current / resultFund.target) * 100) : estimatedProgress;
  const badgeAwarded = addBadges.length > 0 && (result.badges ?? []).includes('dream_builder');

  // BUG-88 fix: Create health_event audit record for dream fund progress
  // set triggerId = dedupKey for idempotency check
  // 🔧 Architecture refactor: createHealthEvent 改回 await
  // 之前 "fire and forget" 在 Vercel serverless 上不可靠 —— handler 返回后函数可能被 kill
  // 导致 Health Log 丢记录。现在 await 确保 audit 落库。
  let healthEventError: string | undefined;
  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    const healthResult = await createHealthEvent({
      userId,
      eventType: 'challenge_reward',
      triggerSource: 'chat_mcp',
      triggerId: dedupKey,
      description: dreamFundProgressDesc(locale, amount, resultFund?.name || fundName, progress, badgeAwarded, hourlyRate),
      metadata: { fundId, amount, fundName: resultFund?.name || fundName, progress, badgeAwarded, newTotalSaved: result.totalSaved },
      vitalityOverride: 0,
      tokenOverride: 0,
    });
    if (!healthResult.success) {
      healthEventError = healthResult.error || 'unknown error';
      logger.warn('[MCP] add_dream_fund_progress: createHealthEvent failed:', healthResult.error);
    } else {
      logger.info('[MCP] add_dream_fund_progress: createHealthEvent success, eventId:', healthResult.eventId);
    }
  } catch (e) {
    healthEventError = e instanceof Error ? e.message : String(e);
    logger.warn('[MCP] add_dream_fund_progress: createHealthEvent threw:', e);
  }

  const successMessage = `Added $${amount} to "${resultFund?.name || fundName}". Progress: ${progress}%.${badgeAwarded ? ' Badge unlocked: Dream Builder!' : ''}`;

  return {
    toolCallId: id,
    name: 'add_dream_fund_progress',
    success: true,
    result: {
      fundId,
      amountAdded: amount,
      fundName: resultFund?.name || fundName,
      newCurrent: resultFund?.current || 0,
      target: resultFund?.target || 0,
      progress,
      badgeAwarded,
      healthEventCreated: !healthEventError,
      // 🔧 ARCH fix (Round 42 REVIEW-6): 加 auditLogged alias (与 add_tokens 等一致, 供 use-mcp-notifications 统一检查)
      auditLogged: !healthEventError,
    },
    message: healthEventError
      ? `Failed: createHealthEvent error — ${healthEventError}. Dream fund updated successfully (+$${amount} to ${resultFund?.name || fundName}, ${progress}%). Please retry to ensure health log is updated.`
      : successMessage,
  };
  } finally {
    releaseToolCallLock(lockKey);
  }
}
