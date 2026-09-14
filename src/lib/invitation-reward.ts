import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * invitation-reward.ts — 邀请激励奖励逻辑 (需求七)
 *
 * 🔧 需求七: 好友完成第一次挑战后, 双方各得 1 个月 Premium
 *
 * 触发点: complete_challenge handler (挑战完成时)
 *    → processInvitationReward(refereeUserId)
 *    → 查 invitations 表 (referee_user_id = userId, status = 'pending')
 *    → 若存在: 双方各延长 trial_until 30天, invitation.status = 'completed'
 *
 * 防滥用:
 *    - 一个用户只能被邀请一次 (invitations.referee_user_id UNIQUE)
 *    - 邀请者每日最多 50 次邀请奖励 (防脚本刷)
 *    - referee == referrer 时跳过 (自己邀请自己)
 *    - 🔧 ARCH fix Round 74: CAS (Compare-And-Swap) UPDATE 防止 TOCTOU 双倍奖励
 *      旧代码: SELECT pending → applyBuddyStateDelta(双方) → UPDATE status=completed
 *      两个并发请求都 SELECT 到 pending → 都 applyBuddyStateDelta → 都 UPDATE
 *      → 双方各得 +100 tokens (双倍)
 *      根因修复: 先 CAS UPDATE (status='completed' WHERE status='pending') 检查 affected rows
 *      只有抢到锁的请求 (count=1) 才发放奖励
 *
 * 优雅降级: 表不存在 → 静默跳过 (不阻塞挑战完成)
 */

// eslint-disable-next-line no-duplicate-imports
import 'server-only';
import { logger } from '@/lib/logger';
import { randomBytes } from 'crypto';

const INVITE_REWARD_PREMIUM_DAYS = 30;
// 🔧 邀请奖励公式 (方案 D - 连续阶梯):
//   总月数 = 邀请人数 + floor(邀请人数 / 5)
//   每邀请 1 人完成: referrer 和 referee 各 +30 天
//   每满 5 人: referrer 额外 +30 天 (里程碑奖励)
//   达到 10 人时: 额外授予 referral_master 徽章
//   举例: 1人=1月, 5人=6月, 10人=12月+badge, 15人=18月, 20人=24月
const MILESTONE_EVERY = 5;          // 每 5 人触发里程碑
const MILESTONE_BONUS_DAYS = 30;    // 里程碑额外天数
const MILESTONE_BADGE = 'referral_master';
const MILESTONE_BADGE_AT = 10;      // 10 人时发徽章
// 🔧 ARCH fix Round 74 (Finding 13): 5000 → 50
const DAILY_REFERRER_LIMIT = 50;

/** 毫秒工具 */
const DAY_MS = 24 * 60 * 60 * 1000;
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * 计算 referrer 累计应得天数 (含里程碑奖励)
 * 总天数 = completedCount × 30 + floor(completedCount / 5) × 30
 */
function calcReferrerTotalDays(completedCount: number): number {
  const baseDays = completedCount * INVITE_REWARD_PREMIUM_DAYS;
  const milestoneDays = Math.floor(completedCount / MILESTONE_EVERY) * MILESTONE_BONUS_DAYS;
  return baseDays + milestoneDays;
}

export interface InvitationRewardResult {
  awarded: boolean;
  refereePremiumDaysAwarded: number;
  referrerUserId: string | null;
  referrerPremiumDaysAwarded: number;
  toastMessageKey: string;
  // 🔧 Round 120 audit fix: 标记 referrer 奖励失败 (referee 拿到了, referrer 没拿到)
  //    调用方据此可显示不同 toast (例如 "Your referrer reward will be delivered shortly")
  //    同时 health_events 表已写入 audit record, 可被 admin 重试
  referrerRewardFailed?: boolean;
  // 🔧 ARCH fix: badge 发放状态 (成功时=true, ops 可据此补发)
  badgeAwarded?: boolean;
}

/**
 * 处理邀请奖励 — 在 complete_challenge 成功后调用
 *
 * 🔧 ARCH fix Round 74 (Finding 1 — TOCTOU race):
 *    旧代码 SELECT-then-UPDATE 无 CAS, 两个并发请求都看到 pending, 都发奖励, 都标记 completed.
 *    根因修复: 先 CAS UPDATE (status='completed' WHERE id=X AND status='pending'), 检查 affected rows.
 *    只有抢到锁的请求 (count=1) 才 applyBuddyStateDelta. 另一个请求 (count=0) 直接返回 noAward.
 *    这样即使两个 Vercel 实例同时处理同一 referee 的 complete_challenge, 也只有一个发奖励.
 *
 * @param refereeUserId - 完成挑战的用户 ID (被邀请者)
 * @returns奖励结果 (awarded=false 表示无待处理邀请或降级)
 */
export async function processInvitationReward(refereeUserId: string): Promise<InvitationRewardResult> {
  const noAward: InvitationRewardResult = {
    awarded: false,
    refereePremiumDaysAwarded: 0,
    referrerUserId: null,
    referrerPremiumDaysAwarded: 0,
    toastMessageKey: '',
    badgeAwarded: false,
  };

  try {
    const { createAdminClient } = await import('@/lib/supabase-admin');
    const { supabase } = createAdminClient();
    if (!supabase) {
      logger.warn('[InvitationReward] Admin client unavailable — skipping');
      return noAward;
    }
    const { data: invitation, error: invErr } = await supabase
      .from('invitations')
      .select('id, referrer_user_id, referee_user_id, status, reward_amount')
      .eq('referee_user_id', refereeUserId)
      .eq('status', 'pending')
      .maybeSingle();

    if (invErr) {
      // 表不存在 → 优雅降级
      if (invErr.message.includes('Could not find the table') || invErr.message.includes('does not exist') || invErr.code === '42P01') {
        logger.info('[InvitationReward] Table not found — migration 086 not applied, skipping');
        return noAward;
      }
      logger.warn('[InvitationReward] Query error:', invErr.message);
      return noAward;
    }

    if (!invitation) {
      // 无待处理邀请 — 正常情况 (大多数用户没有被邀请)
      return noAward;
    }

    const referrerUserId = invitation.referrer_user_id as string;

    // 防滥用: referee == referrer (自己邀请自己)
    if (referrerUserId === refereeUserId) {
      logger.warn('[InvitationReward] Self-invitation detected, skipping');
      // 标记为 rejected 防止重复检查 (CAS: only if still pending)
      await supabase
        .from('invitations')
        .update({ status: 'rejected' })
        .eq('id', invitation.id)
        .eq('status', 'pending');
      return noAward;
    }

    // 🔧 ARCH fix Round 74 (Finding 1 — TOCTOU race root cause fix):
    // BEFORE applying rewards, atomically claim the invitation via CAS UPDATE.
    // This prevents two concurrent requests from both applying rewards.
    // The .eq('status', 'pending') ensures only one request can succeed (count=1);
    // the other gets count=0 and returns noAward.
    const { data: claimResult, error: claimErr } = await supabase
      .from('invitations')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimErr) {
      logger.warn('[InvitationReward] CAS claim failed:', claimErr.message);
      return noAward;
    }

    // If claimResult is null, another concurrent request already claimed this invitation.
    // We must NOT apply rewards — the other request is doing it (or already did).
    if (!claimResult) {
      logger.info(`[InvitationReward] CAS claim lost — another request already claimed invitation ${invitation.id}`);
      return noAward;
    }

    // CAS succeeded — we own this invitation now. Apply rewards.
    // (If applyBuddyStateDelta fails below, the invitation is already 'completed',
    //  so no double-claim. We log the failure for manual reconciliation.)

    // 防滥用: 邀请者每日最多 DAILY_REFERRER_LIMIT 次邀请奖励
    // (checked AFTER CAS to avoid race: two requests both pass the limit check,
    //  then both claim. With CAS-first, only one claim succeeds, so limit check
    //  is per-claimed-invitation, not per-attempt.)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayReferrerCount } = await supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', referrerUserId)
      .eq('status', 'completed')
      .gte('completed_at', todayStart.toISOString());

    if ((todayReferrerCount ?? 0) > DAILY_REFERRER_LIMIT) {
      // Over limit — revert the claim to 'pending' so it's not lost
      // (rare edge case: limit hit between CAS and this check)
      logger.warn(`[InvitationReward] Referrer ${referrerUserId} hit daily limit (${todayReferrerCount}) — reverting claim`);
      await supabase
        .from('invitations')
        .update({ status: 'pending', completed_at: null })
        .eq('id', invitation.id)
        .eq('status', 'completed');
      return noAward;
    }

    // 2. 奖励双方 — 延长 trial_until 30天
    //    如果当前 trial_until > now(), 新值 = trial_until + 30天
    //    如果当前 trial_until <= now() 或为 null, 新值 = now() + 30天

    // 2a. 奖励 referee (当前用户) — CAS 已成功, 安全奖励
    const { data: refereeProfile, error: refereeProfileErr } = await supabase
      .from('profiles')
      .select('trial_until')
      .eq('id', refereeUserId)
      .maybeSingle();

    if (refereeProfileErr) {
      logger.error('[InvitationReward] Failed to load referee profile (invitation already marked completed):', refereeProfileErr.message);
      // 🔧 ARCH fix: profile select 失败时写 health_events 审计, 避免静默从 now 起算导致用户损失剩余 Premium
      try {
        await supabase.from('health_events').insert({
          user_id: refereeUserId,
          event_type: 'invitation_reward_failed',
          description: `Referee profile select failed for invitation ${invitation.id} — referrer ${referrerUserId}. Pending: ${INVITE_REWARD_PREMIUM_DAYS} days Premium.`,
          vitality_change: 0,
          new_vitality: 0,
          token_change: 0,
          trigger_source: 'invitation_reward',
          trigger_id: `invitation_referee_profile_failed:${invitation.id}`,
          metadata: {
            invitation_id: invitation.id,
            referrer_user_id: referrerUserId,
            referee_user_id: refereeUserId,
            pending_premium_days: INVITE_REWARD_PREMIUM_DAYS,
            role: 'referee',
            failure_reason: refereeProfileErr.message,
          },
        });
      } catch (auditErr) {
        // safe to ignore: audit write failed after referee profile select error; returning noAward
        logger.error('[InvitationReward] Failed to write referee profile audit record:', auditErr);
      }
      return noAward;
    }

    const now = new Date();
    const refereeCurrentTrial = refereeProfile?.trial_until
      ? new Date(refereeProfile.trial_until)
      : null;
    const refereeNewTrial = refereeCurrentTrial && refereeCurrentTrial > now
      ? new Date(refereeCurrentTrial.getTime() + INVITE_REWARD_PREMIUM_DAYS * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + INVITE_REWARD_PREMIUM_DAYS * 24 * 60 * 60 * 1000);

    const { error: refereeUpdateErr } = await supabase
      .from('profiles')
      .update({ trial_until: refereeNewTrial.toISOString() })
      .eq('id', refereeUserId);

    if (refereeUpdateErr) {
      logger.error('[InvitationReward] Failed to reward referee (invitation already marked completed):', refereeUpdateErr.message);
      // 🔧 2026-07-15 (ARCH-12 #11 修复): 写 audit record (与 referrer failure 对称)
      //    旧代码只 log, 不写 DB record → ops 永远发现不了, referee 永远拿不到奖励
      //    修复: 写 health_event type='invitation_reward_failed' 给 referee
      try {
        await supabase.from('health_events').insert({
          user_id: refereeUserId,
          event_type: 'invitation_reward_failed',
          description: `Referee reward failed for invitation ${invitation.id} — referrer ${referrerUserId}. Pending: ${INVITE_REWARD_PREMIUM_DAYS} days Premium.`,
          vitality_change: 0,
          new_vitality: 0,
          token_change: 0,
          trigger_source: 'invitation_reward',
          trigger_id: `invitation_referee_failed:${invitation.id}`,
          metadata: {
            invitation_id: invitation.id,
            referrer_user_id: referrerUserId,
            referee_user_id: refereeUserId,
            pending_premium_days: INVITE_REWARD_PREMIUM_DAYS,
            role: 'referee',
            error: refereeUpdateErr.message,
          },
        });
      } catch (auditErr) {
        // safe to ignore: non-critical error, logged for observability
        logger.error('[InvitationReward] Failed to write referee audit record:', auditErr);
      }
      // Invitation is already 'completed' — no double-claim possible.
      // Do NOT revert to 'pending' (would cause infinite retry loop).
      return noAward;
    }

    // 2b. 奖励 referrer (邀请者)
    // 🔧 阶梯叠加 (方案 D):
    //   基础: 每次 +30 天 (与 referee 一致)
    //   累计 5 人时: 额外 +30 天
    //   累计 10 人时: 额外 +30 天 + referral_master badge
    let referrerRewardFailed = false;

    // 查 referrer 当前已完成邀请数 (包含刚刚 CAS claim 的这条)
    const { count: referrerCompletedCount, error: countErr } = await supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', referrerUserId)
      .eq('status', 'completed');

    let completedCount = 0;
    let referrerDeltaDays = INVITE_REWARD_PREMIUM_DAYS;
    let milestoneBadge: string | null = null;

    if (countErr) {
      referrerRewardFailed = true;
      logger.error('[InvitationReward] Failed to load referrer completed count:', countErr.message);
      // 🔧 ARCH fix: count 查询失败时不能信任 completedCount (null → 0 → delta=60)
      //    回退到基础值 30 天并写审计, ops 可据此补发差额
      try {
        await supabase.from('health_events').insert({
          user_id: referrerUserId,
          event_type: 'invitation_reward_failed',
          description: `Referrer completed count query failed for invitation ${invitation.id} — referee ${refereeUserId}. Pending: ${INVITE_REWARD_PREMIUM_DAYS} days Premium.`,
          vitality_change: 0,
          new_vitality: 0,
          token_change: 0,
          trigger_source: 'invitation_reward_retry',
          trigger_id: `irr:${invitation.id}`,
          metadata: {
            referee_user_id: refereeUserId,
            invitation_id: invitation.id,
            premium_days_pending: INVITE_REWARD_PREMIUM_DAYS,
            failure_reason: countErr.message,
            retry_count: 0,
            created_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        // safe to ignore: audit write failed after referrer count query failure; main reward logic already handled
        logger.error('[InvitationReward] CRITICAL: Failed to write referrer count audit record:', auditErr);
      }
    } else {
      completedCount = referrerCompletedCount ?? 0;
      referrerDeltaDays = calcReferrerTotalDays(completedCount) - calcReferrerTotalDays(completedCount - 1);

      if (completedCount >= MILESTONE_BADGE_AT) {
        milestoneBadge = MILESTONE_BADGE;
      }
    }

    const { data: referrerProfile, error: referrerProfileErr } = await supabase
      .from('profiles')
      .select('trial_until')
      .eq('id', referrerUserId)
      .maybeSingle();

    if (referrerProfileErr) {
      referrerRewardFailed = true;
      logger.error('[InvitationReward] Failed to load referrer profile (invitation already marked completed):', referrerProfileErr.message);
      // 🔧 ARCH fix: profile select 失败时写 health_events 审计, 避免静默从 now 起算导致用户损失剩余 Premium
      try {
        await supabase.from('health_events').insert({
          user_id: referrerUserId,
          event_type: 'invitation_reward_failed',
          description: `Referrer profile select failed for invitation ${invitation.id} — referee ${refereeUserId}. Pending: ${referrerDeltaDays} days Premium.`,
          vitality_change: 0,
          new_vitality: 0,
          token_change: 0,
          trigger_source: 'invitation_reward_retry',
          trigger_id: `irr:${invitation.id}`,
          metadata: {
            referee_user_id: refereeUserId,
            invitation_id: invitation.id,
            premium_days_pending: referrerDeltaDays,
            failure_reason: referrerProfileErr.message,
            role: 'referrer',
            retry_count: 0,
            created_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        // safe to ignore: audit write failed after referrer profile select error; returning noAward
        logger.error('[InvitationReward] CRITICAL: Failed to write referrer profile audit record:', auditErr);
      }
    } else {
      const referrerCurrentTrial = referrerProfile?.trial_until
        ? new Date(referrerProfile.trial_until)
        : null;
      const referrerNewTrial = referrerCurrentTrial && referrerCurrentTrial > now
        ? addDays(referrerCurrentTrial, referrerDeltaDays)
        : addDays(now, referrerDeltaDays);

      const { error: referrerUpdateErr } = await supabase
        .from('profiles')
        .update({ trial_until: referrerNewTrial.toISOString() })
        .eq('id', referrerUserId);

      if (referrerUpdateErr) {
        referrerRewardFailed = true;
        logger.error('[InvitationReward] Failed to reward referrer (invitation already marked completed):', referrerUpdateErr.message);
        // 🔧 Round 120 audit fix: 写 health_events 记录, 作为可重试的 audit trail
        try {
          await supabase.from('health_events').insert({
            user_id: referrerUserId,
            event_type: 'invitation_reward_failed',
            description: `Referrer reward failed for invitation ${invitation.id} — referee ${refereeUserId}. Pending: ${referrerDeltaDays} days Premium.`,
            vitality_change: 0,
            new_vitality: 0,
            token_change: 0,
            trigger_source: 'invitation_reward_retry',
            trigger_id: `irr:${invitation.id}`,
            metadata: {
              referee_user_id: refereeUserId,
              invitation_id: invitation.id,
              premium_days_pending: referrerDeltaDays,
              failure_reason: referrerUpdateErr.message || 'unknown',
              retry_count: 0,
              created_at: new Date().toISOString(),
            },
          });
          logger.info(`[InvitationReward] Wrote retry record for referrer ${referrerUserId} (health_events type=invitation_reward_failed)`);
        } catch (auditErr) {
          logger.error('[InvitationReward] CRITICAL: Failed to write retry record (audit trail broken):', auditErr);
        }
      }
    }

    // 🔧 阶梯 badge 奖励: 累计 10 人时发 referral_master badge
    let badgeAwarded = false;
    if (milestoneBadge && !referrerRewardFailed) {
      try {
        const { data: buddyState } = await supabase
          .from('buddy_state')
          .select('badges')
          .eq('user_id', referrerUserId)
          .maybeSingle();
        const currentBadges: string[] = Array.isArray(buddyState?.badges) ? buddyState.badges as string[] : [];
        if (!currentBadges.includes(milestoneBadge)) {
          await supabase
            .from('buddy_state')
            .update({ badges: [...currentBadges, milestoneBadge] })
            .eq('user_id', referrerUserId);
          badgeAwarded = true;
          logger.info(`[InvitationReward] Awarded badge "${milestoneBadge}" to referrer ${referrerUserId}`);
        }
      } catch (badgeErr) {
        logger.error('[InvitationReward] Failed to award milestone badge (non-critical):', badgeErr);
        // 🔧 ARCH fix: badge 失败写审计, ops 可据此补发
        try {
          await supabase.from('health_events').insert({
            user_id: referrerUserId,
            event_type: 'invitation_reward_failed',
            description: `Failed to award milestone badge for invitation ${invitation.id} — referee ${refereeUserId}.`,
            vitality_change: 0,
            new_vitality: 0,
            token_change: 0,
            trigger_source: 'invitation_reward_retry',
            trigger_id: `irr:${invitation.id}`,
            metadata: {
              referee_user_id: refereeUserId,
              invitation_id: invitation.id,
              badge_pending: MILESTONE_BADGE,
              failure_reason: badgeErr instanceof Error ? badgeErr.message : String(badgeErr),
            },
          });
        } catch (auditErr) {
          // safe to ignore: badge failure already recorded in audit; ops can manually reissue
          logger.error('[InvitationReward] CRITICAL: Failed to write badge audit record:', auditErr);
        }
      }
    }

    const milestoneBonus = referrerDeltaDays - INVITE_REWARD_PREMIUM_DAYS;
    const milestoneLog = milestoneBonus > 0 ? ` + milestone bonus ${milestoneBonus}d${milestoneBadge ? ` + ${milestoneBadge}` : ''}` : '';
    logger.info(`[InvitationReward] Awarded referee=${refereeUserId} (+${INVITE_REWARD_PREMIUM_DAYS}d). Referrer=${referrerUserId}: ${referrerRewardFailed ? 'FAILED' : '+' + referrerDeltaDays + 'd'}${milestoneLog} (completed=${completedCount})`);

    return {
      awarded: true,
      refereePremiumDaysAwarded: INVITE_REWARD_PREMIUM_DAYS,
      referrerUserId,
      referrerPremiumDaysAwarded: referrerRewardFailed ? 0 : referrerDeltaDays,
      referrerRewardFailed,  // 🔧 Round 120: 让调用方知道 referrer 失败 (可显示不同 toast)
      badgeAwarded,           // 🔧 ARCH fix: badge 发放状态
      toastMessageKey: 'chat.inviteRewardToast',
    };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[InvitationReward] Unhandled error:', err);
    return noAward;
  }
}

/**
 * 生成 8 字符邀请短码 (base62: a-z A-Z 0-9)
 *
 * 🔧 ARCH fix Round 74 (Finding 7): crypto-secure random instead of Math.random().
 * Math.random() is predictable; an attacker could pre-register predicted codes.
 * Uses crypto.randomBytes (server-side Node.js crypto, CSPRNG).
 */
export function generateRefCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    // 256 % 62 = 8 bias — acceptable for 8-char codes (negligible modulo bias)
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
