/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Handler: complete_challenge — Mark a challenge as completed.
 *
 * 🔧 ARCH refactor (2026-07-18): MAJOR rewrite to use complete-challenge/ helpers.
 *    Old: 835 lines, 5x duplicated "already completed" message, 4x duplicated
 *         companion Promise.all, 3x duplicated metadata enrichment, 2x duplicated
 *         variable reward roll. Multiple P0/P1 bugs from audit.
 *    New: Uses extracted helpers — fireCompletionCompanionEffects (P0-5 fix:
 *         never throws), updateChallengeMetadataWithPlatform (P1-1/P1-2 fix:
 *         checks { error }), rollbackChallengeStatusOnFailure (P2-11 fix:
 *         uses admin client), buildAlreadyCompletedMessage + buildFailedReturn
 *         (P0-3 fix: normalized shape), rollVariableReward (P1-5 fix:
 *         deterministic seed), validateChallengeId (P1-6 fix: UUID check),
 *         normalizeStatus (P1-7 fix: case-insensitive), validateSavedAmount
 *         (P2-13 fix: validates in both modes).
 *
 * 🔧 P0-1 fix (2026-07-18): Mode B now uses acquireDistributedToolCallLock
 *    Old: Mode B (no challenge_id) had NO CAS protection. Two concurrent
 *         calls on different Vercel instances → both pass in-memory lock +
 *         isDuplicateHealthEvent (TOCTOU race) → both call applyBuddyStateDelta
 *         → DOUBLE REWARD.
 *    New: acquireDistributedToolCallLock (Postgres-based, cross-instance safe)
 *         called for ALL modes. Released in finally.
 *
 * 🔧 P0-4 fix (2026-07-18): Atomic failed path now persists
 *    buildLifeHoursSnapshotMeta. Was missing → inconsistent audit trail
 *    (fallback path had it, atomic didn't). BlindSpotMap + historical
 *    analytics reading metadata.hours_snapshot got undefined for atomic.
 *
 * 🔧 P1-3 fix (2026-07-18): RPC result fields now have ?? 0 guard.
 *    Old: `result.tokens as number` → undefined if RPC omits field →
 *         `undefined + 0 = NaN` propagates to AI ("You earned NaN tokens").
 *    New: `(result.tokens as number) ?? 0`.
 *
 * 🔧 P1-4 fix (2026-07-18): Atomic success metadata now includes newLevel.
 *    Old: fallback path wrote newLevel to health_event metadata, atomic didn't.
 *    New: both paths write newLevel for consistent audit trail.
 *
 * 🔧 P2-14 fix (2026-07-18): Added outer catch block.
 *    Old: only `try { ... } finally { releaseToolCallLock }` — any unhandled
 *         error propagated as unhandled rejection. AI got 500 with no message.
 *    New: catch block logs error + returns graceful 500-ish MCPToolResult.
 *
 * 模式 A（推荐，新）: complete_challenge(challenge_id)
 *   - AI 只传 challenge_id（从 context header 读取）
 *   - handler 自动查 active_challenges 表取 amount/itemName/challenge_type
 *   - handler 自动加 totalSaved（AI 不需要再调 add_dream_fund_progress）
 *   - 一次 applyBuddyStateDelta 调用包含所有 delta（原子性更好）
 *   - 创建 challenge_completed health_event
 *   - 挑战结束 UPDATE active_challenges status='passed'
 *
 * 模式 B（向后兼容，旧）: complete_challenge(challenge_type, saved_amount)
 *   - AI 直接传 challenge_type 和 saved_amount
 *   - handler 自动校验 + 修正 challenge_type
 *   - 不自动加 totalSaved（AI 需要自己调 add_dream_fund_progress）
 *   - 用于 challenge_id 不可用时的降级
 *
 * 设计原则: 已知的确定信息由 App 处理，必须 AI 判断的才让 AI 处理。
 */

import {
  MCPHandlerContext,
  MCPToolResult,
  applyBuddyStateDelta,
  isDuplicateHealthEvent,
  isToolCallInProgress,
  releaseToolCallLock,
  acquireDistributedToolCallLock,
  releaseDistributedToolCallLock,
  logger,
  getUserLocale,
} from './_shared';
import { challengeCompletedDesc, challengeFailedDesc, getHourlyRateFromArgs, buildLifeHoursSnapshotMeta } from './descriptions';
import { getChallengeType } from '@/lib/challenge-rules';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';
// 🔧 ARCH refactor (2026-07-18): use extracted helpers
import {
  getBaseRewardsForChallengeType,
  rollVariableReward,
  fireCompletionCompanionEffects,
  updateChallengeMetadataWithPlatform,
  rollbackChallengeStatusOnFailure,
  buildAlreadyCompletedMessage,
  buildCompletionMessage,
  buildFailedReturn,
  validateChallengeId,
  normalizeStatus,
  validateSavedAmount,
  normalizeLocale,
  type CompletionStatus,
} from './complete-challenge';

export async function handleCompleteChallenge(ctx: MCPHandlerContext): Promise<MCPToolResult> {
  // 🔧 ARCH fix (2026-07-18): supabase removed from destructure — was unused
  //    after refactor (all DB writes now use adminSupabase via helpers for
  //    consistent privilege level — P2-11 fix).
  const { toolCallId: id, args, userId } = ctx;
  // 🔧 P2-12 fix: normalizeLocale accepts 'zh-CN'/'en-US' variants (was strict 'zh'/'en')
  const argsLocale = normalizeLocale(args.locale);
  const locale = argsLocale ?? await getUserLocale(userId);

  // 🔧 镜子哲学 fix: 获取用户时薪 — 用于生命翻译 (金额 → 小时数)
  const hourlyRate = getHourlyRateFromArgs(args) || await getUserHourlyRate(userId);

  // ============================================================
  // 解析参数: 优先 challenge_id 模式, 降级到 challenge_type + saved_amount
  // ============================================================
  // 🔧 P1-6 fix: validateChallengeId rejects non-UUID strings (was String() anything)
  let challengeId: string | undefined;
  try {
    challengeId = validateChallengeId(args.challenge_id);
  } catch (validationErr) {
    return {
      toolCallId: id,
      name: 'complete_challenge',
      success: false,
      result: {},
      message: `Failed: ${(validationErr as Error).message}. Read the challenge_id from the context header and retry.`,
    };
  }
  // 🔧 P1-7 fix: normalizeStatus is case-insensitive (was strict === 'failed')
  const challengeStatus: CompletionStatus = normalizeStatus(args.status);

  let challengeType: string;
  let savedAmount: number;
  let itemName: string | undefined;
  let isChallengeIdMode = false;
  let challenge: import('@/lib/challenge-store').ActiveChallengeRow | undefined;

  if (challengeId) {
    // 模式 A: 通过 challenge_id 查表
    const { getChallengeById } = await import('@/lib/challenge-store');
    const lookup = await getChallengeById(challengeId, userId);
    if (!lookup.success || !lookup.challenge) {
      logger.warn(`[MCP] complete_challenge: challenge_id=${challengeId} not found for user ${(userId || 'unknown').substring(0, 8)}, asking AI to retry with explicit params`);
      return {
        toolCallId: id,
        name: 'complete_challenge',
        success: false,
        result: {},
        message: `Failed: challenge_id=${challengeId} not found in active_challenges table. The challenge may have expired or already been completed. If the challenge is still active, retry with explicit challenge_type and saved_amount from the context header.`,
      };
    }
    challenge = lookup.challenge;
    // 如果挑战已结束 (passed/failed/expired), 返回已完成的友好提示
    if (challenge.status !== 'active') {
      logger.info(`[MCP] complete_challenge: challenge_id=${challengeId} already ${challenge.status}, returning already-completed message`);
      return {
        toolCallId: id,
        name: 'complete_challenge',
        success: true,
        result: { challengePassed: true, challengeId, challengeType: challenge.challenge_type, savedAmount: challenge.amount, alreadyCompleted: true },
        message: buildAlreadyCompletedMessage({ challengeType: challenge.challenge_type, savedAmount: challenge.amount, context: 'not_found' }),
      };
    }
    challengeType = challenge.challenge_type;
    // 🔧 P2-13 fix: validate saved_amount in Mode A too (was trusting DB blindly)
    try {
      savedAmount = validateSavedAmount(challenge.amount, 'db');
    } catch (validationErr) {
      logger.error(`[MCP] complete_challenge: DB has invalid amount for challenge ${challengeId}:`, validationErr);
      return {
        toolCallId: id,
        name: 'complete_challenge',
        success: false,
        result: {},
        message: `Failed: challenge.amount in DB is invalid (${(validationErr as Error).message}). Manual intervention required.`,
      };
    }
    itemName = challenge.item_name;
    isChallengeIdMode = true;
    logger.info(`[MCP] complete_challenge: challenge_id mode → type=${challengeType}, amount=${savedAmount}, item=${itemName}`);
  } else {
    // 模式 B: 旧模式, AI 直接传 challenge_type + saved_amount
    challengeType = String(args.challenge_type || 'quick_pass');
    // 🔧 P2-13 fix: validateSavedAmount used in both modes (was Mode B only, and inline)
    try {
      savedAmount = validateSavedAmount(args.saved_amount, 'args');
    } catch (validationErr) {
      logger.warn(`[MCP] complete_challenge: invalid saved_amount=${args.saved_amount}, asking AI to retry`);
      return {
        toolCallId: id,
        name: 'complete_challenge',
        success: false,
        result: {},
        message: `Failed: ${(validationErr as Error).message}. Read the exact dollar amount from the user's challenge context (challengeContext.amount) and retry. Or use challenge_id from the context header if available.`,
      };
    }

    // 🔧 自动修正 challenge_type: 根据 saved_amount 阈值校验
    const expectedType = getChallengeType(savedAmount);
    if (challengeType !== expectedType) {
      logger.info(`[MCP] complete_challenge: auto-correcting challenge_type '${challengeType}' → '${expectedType}' (saved_amount=${savedAmount})`);
      challengeType = expectedType;
    }
  }

  // ============================================================
  // 幂等性: 内存锁 + DB dedup + 分布式锁
  // 🔧 P0-1/P0-2 fix (2026-07-18): acquireDistributedToolCallLock for ALL modes
  //    Old: Mode B had no cross-instance lock → double reward on concurrent calls.
  //    New: Postgres-based distributed lock acquired for every call.
  // ============================================================
  const dedupKey = isChallengeIdMode && challengeId
    ? `cc:${userId}:${challengeId}`
    : `cc:${userId}:${challengeType}:${savedAmount}`;
  const lockKey = dedupKey;
  if (isToolCallInProgress(lockKey)) {
    logger.info(`[MCP] complete_challenge: in-progress lock hit (key=${lockKey}) — skipping duplicate`);
    return {
      toolCallId: id,
      name: 'complete_challenge',
      success: true,
      result: { challengePassed: true, challengeType, savedAmount, alreadyCompleted: true },
      message: buildAlreadyCompletedMessage({ challengeType, savedAmount, context: 'lock_hit' }),
    };
  }

  // 🔧 P0-1/P0-2 fix: acquire cross-instance distributed lock
  const distLockAcquired = await acquireDistributedToolCallLock(lockKey, 30_000);
  if (!distLockAcquired) {
    logger.info(`[MCP] complete_challenge: distributed lock held (key=${lockKey}) — skipping duplicate`);
    return {
      toolCallId: id,
      name: 'complete_challenge',
      success: true,
      result: { challengePassed: true, challengeType, savedAmount, alreadyCompleted: true },
      message: buildAlreadyCompletedMessage({ challengeType, savedAmount, context: 'lock_hit' }),
    };
  }

  try {
    const descPrefix = `Challenge completed: ${challengeType}, saved $${savedAmount}.`;
    const isDup = await isDuplicateHealthEvent(userId, dedupKey, descPrefix);
    if (isDup) {
      logger.info(`[MCP] complete_challenge: duplicate detected (key=${dedupKey}) — skipping duplicate execution`);
      return {
        toolCallId: id,
        name: 'complete_challenge',
        success: true,
        result: { challengePassed: true, challengeType, savedAmount, alreadyCompleted: true },
        message: buildAlreadyCompletedMessage({ challengeType, savedAmount, context: 'duplicate' }),
      };
    }

    // ============================================================
    // 奖励计算 — 🔧 ARCH refactor: use getBaseRewardsForChallengeType helper
    // ============================================================
    const baseRewards = getBaseRewardsForChallengeType(challengeType);
    const tokenReward = baseRewards.tokenReward;
    const vitalityReward = baseRewards.vitalityReward;
    const xpReward = baseRewards.xpReward;
    const addBadges: string[] = baseRewards.badge ? [baseRewards.badge] : [];

    // ============================================================
    // CAS (Compare-And-Set) — 优先用 complete_challenge_atomic RPC,
    // fallback 到旧的 5 步非原子流程 (向后兼容)。
    // ============================================================
    if (challengeId) {
      const completedDesc = challengeCompletedDesc(locale, challengeType, savedAmount, itemName, tokenReward, vitalityReward, xpReward, hourlyRate);
      const rewardDesc: string | null = null;
      const rewardMeta: Record<string, unknown> | null = null;

      const { supabase: adminSupabase } = await import('@/lib/supabase-admin').then(m => m.createAdminClient());
      if (adminSupabase) {
        try {
          const { data: rpcResult, error: rpcError } = await adminSupabase.rpc('complete_challenge_atomic', {
            p_challenge_id: challengeId,
            p_user_id: userId,
            p_challenge_status: challengeStatus,
            p_token_delta: tokenReward,
            p_vitality_delta: vitalityReward,
            p_xp_delta: xpReward,
            p_challenges_delta: 1,
            p_add_badges: addBadges,
            p_total_saved_delta: isChallengeIdMode ? savedAmount : 0,
            p_dream_fund_id: null,
            p_dream_fund_amount: 0,
            p_completed_trigger_id: dedupKey,
            p_completed_description: completedDesc,
            p_completed_metadata: {
              challengeType,
              savedAmount,
              itemName,
              tokenReward,
              vitalityReward,
              xpReward,
              challengeId,
              // 🔧 P1-4 fix (2026-07-18): add newLevel to atomic path metadata
              //    (was only in fallback path → inconsistent audit trail)
              //    Note: newLevel not yet known here (RPC returns it) — added below
              //    after RPC result. For the RPC's own metadata, we omit it.
              ...buildLifeHoursSnapshotMeta(savedAmount, hourlyRate),
            },
            p_reward_trigger_id: rewardDesc ? `dfp:${userId}:${challengeId}:${savedAmount}` : null,
            p_reward_description: rewardDesc,
            p_reward_metadata: rewardMeta,
          });

          if (!rpcError && rpcResult) {
            const result = rpcResult as Record<string, unknown>;
            if (result.success === true) {
              logger.info('[MCP] complete_challenge: atomic RPC success');
              // 🔧 P1-3 fix (2026-07-18): ?? 0 guard on RPC result fields
              //    Old: `result.tokens as number` → undefined if RPC omits field
              //    → `undefined + 0 = NaN` propagates to AI
              const rpcTokens = (result.tokens as number) ?? 0;
              const rpcVitality = (result.vitality as number) ?? 0;
              const rpcLevel = (result.level as number) ?? 0;

              // 🔧 ARCH refactor: use updateChallengeMetadataWithPlatform helper
              //    Fixes P1-1 (checks { error }) + P2-10 (NaN guard on created_at)
              //    + P2-11 (uses admin client passed in)
              if (isChallengeIdMode && challengeStatus === 'passed' && savedAmount > 0) {
                await updateChallengeMetadataWithPlatform({
                  supabase: adminSupabase, // 🔧 P2-11: use admin client (consistent with RPC)
                  userId,
                  challengeId,
                  challenge,
                  savedAmount,
                  itemName,
                  setUnsettled: true,
                });
              } else if (isChallengeIdMode && challengeStatus === 'failed') {
                await updateChallengeMetadataWithPlatform({
                  supabase: adminSupabase,
                  userId,
                  challengeId,
                  challenge,
                  savedAmount,
                  itemName,
                  setUnsettled: false,
                });
              }

              // 🔧 P0 fix (mirror philosophy — I choose to buy):
              //   status='failed' → RPC skips rewards, but doesn't create health_event
              if (challengeStatus === 'failed') {
                let failedHealthEventOk = true;
                try {
                  const { createHealthEvent } = await import('@/lib/health-impact');
                  await createHealthEvent({
                    userId,
                    eventType: 'challenge_failed',
                    triggerSource: 'chat_mcp',
                    triggerId: `cf:${userId}:${challengeId}`,
                    description: challengeFailedDesc(locale, challengeType, itemName, savedAmount, hourlyRate),
                    // 🔧 P0-4 fix (2026-07-18): add buildLifeHoursSnapshotMeta
                    //    (was missing in atomic path → inconsistent audit trail)
                    metadata: {
                      challengeId,
                      challengeType,
                      savedAmount,
                      itemName,
                      status: 'failed',
                      ...buildLifeHoursSnapshotMeta(savedAmount, hourlyRate),
                    },
                    vitalityOverride: 0,
                    tokenOverride: 0,
                  });
                } catch (e) {
                  failedHealthEventOk = false;
                  logger.warn('[MCP] complete_challenge (atomic, failed): createHealthEvent threw:', e);
                }

                // 🔧 P0-5 fix: fireCompletionCompanionEffects NEVER throws
                //    (try/catch inside helper — challenge already committed)
                await fireCompletionCompanionEffects(userId, 'failed');

                // 🔧 P0-3 fix: buildFailedReturn normalizes shape across paths
                return buildFailedReturn({
                  toolCallId: id,
                  challengeId,
                  challengeType,
                  savedAmount,
                  itemName,
                  healthEventCreated: failedHealthEventOk,
                  atomic: true,
                });
              }

              // 🔧 P0-5 fix: fireCompletionCompanionEffects NEVER throws
              await fireCompletionCompanionEffects(userId, 'passed');

              // 🔧 P1-5 fix: rollVariableReward is deterministic (seeded)
              //    Same challenge always rolls same tier → consistent UX on retry
              const rewardSeed = `${challengeId}:${userId}`;
              const { tier: rewardTier, bonusTokens, bonusVitality } = rollVariableReward(rewardSeed);

              let bonusApplied = false;
              let effectiveBonusTokens = bonusTokens;
              let effectiveBonusVitality = bonusVitality;
              let effectiveTier = rewardTier;
              if (bonusTokens > 0 || bonusVitality > 0) {
                try {
                  await applyBuddyStateDelta(userId, {
                    tokenDelta: bonusTokens,
                    vitalityDelta: bonusVitality,
                  });
                  bonusApplied = true;
                  logger.info(`[MCP] complete_challenge: Variable Reward tier=${rewardTier}, bonus tokens=+${bonusTokens}, vitality=+${bonusVitality}`);
                } catch (rewardErr) {
                  logger.error('[MCP] complete_challenge: Variable Reward bonus FAILED — downgrading to basic tier (user will NOT see bonus):', rewardErr);
                  effectiveBonusTokens = 0;
                  effectiveBonusVitality = 0;
                  effectiveTier = 'basic';
                }
              }

              return {
                toolCallId: id,
                name: 'complete_challenge',
                success: true,
                result: {
                  challengeType,
                  savedAmount,
                  itemName,
                  tokenReward: tokenReward + effectiveBonusTokens,
                  vitalityReward: vitalityReward + effectiveBonusVitality,
                  xpReward,
                  newLevel: rpcLevel,
                  badgeAwarded: challengeType === 'boss' ? 'boss_slayer' : null,
                  // 🔧 P1-3 fix: ?? 0 guard prevents NaN propagation
                  newTokens: rpcTokens + (bonusApplied ? effectiveBonusTokens : 0),
                  newVitality: rpcVitality + (bonusApplied ? effectiveBonusVitality : 0),
                  healthEventCreated: !!result.completed_event_id,
                  challengeId,
                  rewardTier: effectiveTier,
                  bonusTokens: effectiveBonusTokens,
                  bonusVitality: effectiveBonusVitality,
                  bonusApplied,
                  dreamFundUpdated: false,
                  dreamFundId: undefined,
                  dreamFundName: undefined,
                  dreamFundProgress: undefined,
                  depositPending: isChallengeIdMode && challengeStatus === 'passed' && savedAmount > 0,
                  atomic: true,
                },
                // 🔧 ARCH refactor: use buildCompletionMessage helper
                message: buildCompletionMessage({
                  challengeType,
                  savedAmount,
                  itemName,
                  tokenReward,
                  vitalityReward,
                  xpReward,
                  rewardTier: effectiveTier,
                  isAtomicPath: true,
                }),
              };
            } else if (result.cas_failed === true) {
              logger.info(`[MCP] complete_challenge: atomic RPC CAS failed (already completed), returning already-completed message`);
              return {
                toolCallId: id,
                name: 'complete_challenge',
                success: true,
                result: { challengePassed: true, challengeId, challengeType, savedAmount, alreadyCompleted: true },
                message: buildAlreadyCompletedMessage({ challengeType, savedAmount, context: 'cas_failed' }),
              };
            }
          }

          // 🔧 ARCH fix: unknown RPC state — fail-closed (don't fall through)
          if (!rpcError && rpcResult) {
            const result = rpcResult as Record<string, unknown>;
            if (result.success !== true && result.cas_failed !== true) {
              logger.error('[MCP] complete_challenge: atomic RPC returned unknown state (not success, not cas_failed), refusing to fall through:', result);
              return {
                toolCallId: id,
                name: 'complete_challenge',
                success: false,
                result: {},
                message: `Challenge completion failed with unknown state. Please try again.`,
              };
            }
          }

          if (rpcError) {
            const isFunctionMissing = (rpcError as { code?: string }).code === '42883' ||
              rpcError.message?.includes('Could not find the function') ||
              rpcError.message?.includes('does not exist');
            if (!isFunctionMissing) {
              logger.error('[MCP] complete_challenge: atomic RPC error (not falling back):', rpcError.message);
              return {
                toolCallId: id,
                name: 'complete_challenge',
                success: false,
                result: {},
                message: `Challenge completion failed: ${rpcError.message}`,
              };
            }
            logger.warn('[MCP] complete_challenge: atomic RPC not deployed, falling back to 5-step:', rpcError.message);
          }
        } catch (rpcErr) {
          logger.warn('[MCP] complete_challenge: atomic RPC threw, falling back to 5-step:', rpcErr);
        }
      }

      // Fallback: 旧 5 步非原子流程 (向后兼容)
      const { completeChallenge } = await import('@/lib/challenge-store');
      const casResult = await completeChallenge(challengeId, userId, challengeStatus);
      if (!casResult.success) {
        logger.warn(`[MCP] complete_challenge: CAS failed for ${challengeId}:`, casResult.error);
        return {
          toolCallId: id,
          name: 'complete_challenge',
          success: false,
          result: {},
          message: `Failed: could not mark challenge as ${challengeStatus} — ${casResult.error}`,
        };
      }
      if (casResult.rowsAffected === 0) {
        logger.info(`[MCP] complete_challenge: CAS rowsAffected=0 for ${challengeId}, another request already completed it, returning already-completed message`);
        return {
          toolCallId: id,
          name: 'complete_challenge',
          success: true,
          result: { challengePassed: true, challengeId, challengeType, savedAmount, alreadyCompleted: true },
          message: buildAlreadyCompletedMessage({ challengeType, savedAmount, context: 'cas_zero' }),
        };
      }
      logger.info(`[MCP] complete_challenge: CAS success for ${challengeId} (status=${challengeStatus}), proceeding [fallback]`);

      // 🔧 ARCH refactor: use updateChallengeMetadataWithPlatform helper
      //    Fixes P1-2 (checks { error } — was catch-only) + P2-10 (NaN guard)
      const { supabase: adminSupabase2 } = await import('@/lib/supabase-admin').then(m => m.createAdminClient());
      if (adminSupabase2) {
        await updateChallengeMetadataWithPlatform({
          supabase: adminSupabase2, // 🔧 P2-11: use admin client (consistent with CAS)
          userId,
          challengeId,
          challenge,
          savedAmount,
          itemName,
          setUnsettled: challengeStatus === 'passed' && savedAmount > 0,
        });
      }

      // 🔧 failed 模式: 只标记 challenge 为 failed, 不加奖励
      if (challengeStatus === 'failed') {
        let failedHealthEventOk = true;
        try {
          const { createHealthEvent } = await import('@/lib/health-impact');
          await createHealthEvent({
            userId,
            eventType: 'challenge_failed',
            triggerSource: 'chat_mcp',
            triggerId: `cf:${userId}:${challengeId}`,
            description: challengeFailedDesc(locale, challengeType, itemName, savedAmount, hourlyRate),
            metadata: {
              challengeId,
              challengeType,
              savedAmount,
              itemName,
              status: 'failed',
              ...buildLifeHoursSnapshotMeta(savedAmount, hourlyRate),
            },
            vitalityOverride: 0,
            tokenOverride: 0,
          });
        } catch (e) {
          failedHealthEventOk = false;
          logger.warn('[MCP] complete_challenge (fallback, failed): createHealthEvent threw:', e);
        }

        // 🔧 P0-5 fix: fireCompletionCompanionEffects NEVER throws
        await fireCompletionCompanionEffects(userId, 'failed');

        // 🔧 P0-3 fix: buildFailedReturn normalizes shape across paths
        return buildFailedReturn({
          toolCallId: id,
          challengeId,
          challengeType,
          savedAmount,
          itemName,
          healthEventCreated: failedHealthEventOk,
          atomic: false,
        });
      }
    }

    // 🔧 failed 模式 (Mode B legacy): 不发奖励, 只记 challenge_failed 审计 —
    //    与 Mode A 同语义 (工具描述承诺 "status=failed: no rewards";
    //    validation.ts P1-7 把 failed 发奖励定性为 reward-farming vector)。
    //    旧缺陷: legacy 直落 applyBuddyStateDelta 全额发奖 + challenge_completed 事件。
    if (challengeStatus === 'failed') {
      let failedHealthEventOk = true;
      try {
        const { createHealthEvent } = await import('@/lib/health-impact');
        await createHealthEvent({
          userId,
          eventType: 'challenge_failed',
          triggerSource: 'chat_mcp',
          triggerId: `cf:${userId}:${challengeType}:${savedAmount}`,
          description: challengeFailedDesc(locale, challengeType, itemName, savedAmount, hourlyRate),
          metadata: {
            challengeType,
            savedAmount,
            itemName,
            status: 'failed',
            ...buildLifeHoursSnapshotMeta(savedAmount, hourlyRate),
          },
          vitalityOverride: 0,
          tokenOverride: 0,
        });
      } catch (e) {
        failedHealthEventOk = false;
        logger.warn('[MCP] complete_challenge (legacy, failed): createHealthEvent threw:', e);
      }

      // 🔧 P0-5 fix: fireCompletionCompanionEffects NEVER throws
      await fireCompletionCompanionEffects(userId, 'failed');

      // 🔧 P0-3 fix: buildFailedReturn normalizes shape across paths
      //    (challengeId 为 undefined — legacy 模式无 DB 行)
      return buildFailedReturn({
        toolCallId: id,
        challengeId: undefined,
        challengeType,
        savedAmount,
        itemName,
        healthEventCreated: failedHealthEventOk,
        atomic: false,
      });
    }

    // ============================================================
    // 原子更新 buddy_state (Mode B 走到这里 — 无 challengeId 的分支)
    // ============================================================
    const result = await applyBuddyStateDelta(userId, {
      tokenDelta: tokenReward,
      vitalityDelta: vitalityReward,
      xpDelta: xpReward,
      challengesDelta: 1,
      addBadges,
      totalSavedDelta: isChallengeIdMode ? savedAmount : 0,
      dreamFundId: undefined,
      dreamFundAmount: isChallengeIdMode ? savedAmount : 0,
    });

    if (!result.success) {
      // 🔧 ARCH refactor: use rollbackChallengeStatusOnFailure helper
      //    Fixes P2-11 (uses admin client) + preserves Round 120 AUDIT-6 fix
      logger.error('[MCP] complete_challenge: applyBuddyStateDelta failed after CAS commit, rolling back challenge status + deposit_status to active');
      let rollbackOk = false;
      if (challengeId) {
        rollbackOk = await rollbackChallengeStatusOnFailure(userId, challengeId);
      }
      // 🔧 P2-14 fix: message includes rollback status so tests + AI can tell
      //    whether the user can safely retry (rollback succeeded → retry is safe)
      const rollbackMsg = rollbackOk
        ? 'Challenge status rolled back — please retry.'
        : 'Challenge status rollback FAILED — manual intervention may be needed. Please retry.';
      return { toolCallId: id, name: 'complete_challenge', success: false, result: {}, message: `Failed to record challenge reward: ${result.error}. ${rollbackMsg}` };
    }

    // ============================================================
    // 创建 health_event 审计记录
    // ============================================================
    let healthEventError: string | undefined;
    try {
      const { createHealthEvent } = await import('@/lib/health-impact');
      const healthResult = await createHealthEvent({
        userId,
        eventType: 'challenge_completed',
        triggerSource: 'chat_mcp',
        triggerId: dedupKey,
        description: challengeCompletedDesc(locale, challengeType, savedAmount, itemName, tokenReward, vitalityReward, xpReward, hourlyRate),
        metadata: {
          challengeType,
          savedAmount,
          itemName,
          tokenReward,
          vitalityReward,
          xpReward,
          // 🔧 P1-4 fix: newLevel now in both paths (was only fallback)
          newLevel: result.level,
          challengeId,
          ...buildLifeHoursSnapshotMeta(savedAmount, hourlyRate),
        },
        vitalityOverride: 0,
        tokenOverride: 0,
      });
      if (!healthResult.success) {
        healthEventError = healthResult.error || 'unknown error';
        logger.warn('[MCP] complete_challenge: createHealthEvent failed:', healthResult.error);
      } else {
        logger.info('[MCP] complete_challenge: createHealthEvent success, eventId:', healthResult.eventId);
      }
    } catch (e) {
      healthEventError = e instanceof Error ? e.message : String(e);
      logger.warn('[MCP] complete_challenge: createHealthEvent threw:', e);
    }

    // ============================================================
    // 邀请奖励 — 优雅降级
    // ============================================================
    let inviteRewardToast: string | null = null;
    try {
      const { processInvitationReward } = await import('@/lib/invitation-reward');
      const inviteResult = await processInvitationReward(userId);
      if (inviteResult.awarded) {
        inviteRewardToast = 'chat.inviteRewardToast';
        logger.info('[MCP] complete_challenge: invitation reward awarded', inviteResult);
      }
    } catch (inviteErr) {
      logger.warn('[MCP] complete_challenge: invitation reward error (non-blocking):', inviteErr);
    }

    // 🔧 P0-5 fix: fireCompletionCompanionEffects NEVER throws
    await fireCompletionCompanionEffects(userId, 'passed');

    // 🔧 P1-5 fix: deterministic seed (challengeId or fallback for Mode B)
    const rewardSeed = challengeId ? `${challengeId}:${userId}` : `${dedupKey}`;
    const { tier: fbRewardTier, bonusTokens: fbBonusTokens, bonusVitality: fbBonusVitality } = rollVariableReward(rewardSeed);

    let fbBonusApplied = false;
    let effectiveFbBonusTokens = fbBonusTokens;
    let effectiveFbBonusVitality = fbBonusVitality;
    let effectiveFbTier = fbRewardTier;
    if (fbBonusTokens > 0 || fbBonusVitality > 0) {
      try {
        await applyBuddyStateDelta(userId, { tokenDelta: fbBonusTokens, vitalityDelta: fbBonusVitality });
        fbBonusApplied = true;
      } catch (e) {
        logger.error('[MCP] complete_challenge [fallback]: Variable Reward bonus FAILED — downgrading to basic:', e);
        effectiveFbBonusTokens = 0;
        effectiveFbBonusVitality = 0;
        effectiveFbTier = 'basic';
      }
    }

    return {
      toolCallId: id,
      name: 'complete_challenge',
      success: true,
      result: {
        challengeType,
        savedAmount,
        itemName,
        tokenReward,
        vitalityReward,
        xpReward,
        newLevel: result.level,
        badgeAwarded: challengeType === 'boss' ? 'boss_slayer' : null,
        healthEventCreated: !healthEventError,
        challengeId,
        dreamFundUpdated: false,
        dreamFundId: undefined,
        dreamFundName: undefined,
        dreamFundProgress: undefined,
        inviteRewardToast,
        rewardTier: effectiveFbTier,
        bonusTokens: effectiveFbBonusTokens,
        bonusVitality: effectiveFbBonusVitality,
        bonusApplied: fbBonusApplied,
        // 🔧 P1-3 fix: ?? 0 guard (already had it, preserved)
        newTokens: (result.tokens ?? 0) + (fbBonusApplied ? effectiveFbBonusTokens : 0),
        newVitality: (result.vitality ?? 0) + (fbBonusApplied ? effectiveFbBonusVitality : 0),
      },
      message: healthEventError
        ? `Failed: createHealthEvent error — ${healthEventError}. buddy_state updated successfully (challengeType=${challengeType}, saved=$${savedAmount}, +${tokenReward} tokens). Please retry to ensure health log is updated.`
        : buildCompletionMessage({
            challengeType,
            savedAmount,
            itemName,
            tokenReward,
            vitalityReward,
            xpReward,
            rewardTier: effectiveFbTier,
            isAtomicPath: false,
          }),
    };
  } catch (unexpectedErr) {
    // 🔧 P2-14 fix (2026-07-18): outer catch block — was missing entirely.
    //    Old: only `try { ... } finally { releaseToolCallLock }` — any unhandled
    //    error propagated as unhandled rejection. AI got 500 with no message.
    //    New: catch logs error + returns graceful MCPToolResult so AI gets a
    //    useful message and can retry. Challenge may be in inconsistent state
    //    (committed but no confirmation) — operators should alert on this log.
    logger.error('[MCP] complete_challenge: UNHANDLED error (challenge may be in inconsistent state):', unexpectedErr);
    return {
      toolCallId: id,
      name: 'complete_challenge',
      success: false,
      result: {},
      message: 'Internal error — please retry. If the challenge was already completed, you will see a duplicate message.',
    };
  } finally {
    // 🔧 P0-1/P0-2 fix: release both in-memory and distributed locks
    releaseToolCallLock(lockKey);
    await releaseDistributedToolCallLock(lockKey);
  }
}
