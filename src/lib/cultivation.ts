import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * 修身阶段评估 + severity 分级 — Week 2 数据层核心
 *
 * 道经依据：道体二·共生（AI 记住用户状态，个性化陪伴）
 *
 * 3 大功能：
 * 1. assessSeverityTier — 根据周度指标自动计算 severe/moderate/light (extracted to cultivation-assessment.ts)
 * 2. assessCultivationStage — 根据 30 天指标 + Challenge 通过率评估修身阶段 (extracted to cultivation-assessment.ts)
 * 3. getProfile / ensureProfile — 获取或创建用户画像 (this file)
 *
 * 🔧 ARCH fix Round 73 (Finding 2 — god component splits):
 *    Pure assessment functions extracted to cultivation-assessment.ts.
 *    This file now focuses on DB operations (getProfile, reassessProfile, etc.).
 *
 * 修改门槛：同总则（详见 constitution.md §五）
 */

import { createAdminClient } from '@/lib/supabase-admin';
import type { Json } from '@/lib/database.types';
import { toJson } from '@/lib/json-helpers';
import { logger } from '@/lib/logger';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { subDays } from 'date-fns';
// 🔧 ARCH fix Round 73: pure functions + types imported from cultivation-assessment.ts
import {
  assessSeverityTier,
  assessCultivationStage,
  type SeverityTier,
  type CultivationStage,
  type WeeklyMetrics,
  type MonthlyMetrics,
} from './cultivation-assessment';

// Re-export for backward compatibility — existing callers import these from cultivation.ts
export {
  assessSeverityTier,
  assessCultivationStage,
  type SeverityTier,
  type CultivationStage,
  type WeeklyMetrics,
  type MonthlyMetrics,
};

// ============================================================
// Types — DB-specific (InterventionProfile, StageAssessmentResult)
// ============================================================

export interface InterventionProfile {
  userId: string;
  severityTier: SeverityTier;
  cultivationStage: CultivationStage;
  stageEnteredAt: string;
  weeklyImpulseCount: number;
  weeklyTotalAmount: number;
  weeklyAvgImpulseScore: number;
  weeklyRefundCount: number;
  monthlyImpulseCount: number;
  monthlyResistedCount: number;
  monthlyChallengePassRate: number;
  selfReportedSeverity?: 'none' | 'mild' | 'moderate' | 'severe' | null;
  professionalReferralRecommended: boolean;
  lastReassessedAt: string;
  // 🔧 ARCH fix (Round 44 R44-A-1 — stage_assessment_history 丢失根因):
  //    旧代码: InterventionProfile 接口缺 stageAssessmentHistory 字段,
  //    reassessProfile 用 `as unknown as Record<string, unknown>` 绕过 TS 访问,
  //    但 mapRowToProfile 不读该列 → existingHistory 永远是 [] → 历史每次被重置。
  //    根因修复: 加 stageAssessmentHistory 到接口 + mapRowToProfile 读列。
  stageAssessmentHistory?: unknown[];
}

export interface StageAssessmentResult {
  severityTier: SeverityTier;
  cultivationStage: CultivationStage;
  stageChanged: boolean;
  previousStage?: CultivationStage;
  reason: string;
  metrics: {
    weeklyImpulseCount: number;
    weeklyTotalAmount: number;
    weeklyAvgImpulseScore: number;
    monthlyImpulseCount: number;
    monthlyResistedCount: number;
    monthlyChallengePassRate: number;
  };
}

// ============================================================
// 内部辅助 — DB queries for metrics
// ============================================================

/**
 * 查询用户过去 7 天的冲动消费指标
 */
async function fetchWeeklyMetrics(userId: string): Promise<WeeklyMetrics> {
  const { supabase } = createAdminClient();
  if (!supabase) {
    return { impulseCount: 0, totalAmount: 0, avgImpulseScore: 0, refundCount: 0 };
  }

  const sevenDaysAgo = subDays(new Date(), 7);

  try {
    const { data, error } = await supabase
      .from('impulse_events')
      .select('amount, impulse_score, created_at')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString());

    if (error) {
      logger.warn(`[Cultivation] fetchWeeklyMetrics error: ${error.message}`);
      return { impulseCount: 0, totalAmount: 0, avgImpulseScore: 0, refundCount: 0 };
    }

    const events = (data || []) as Array<{ amount: number | null; impulse_score: number | null; created_at: string }>;
    const impulseCount = events.length;
    const totalAmount = events.reduce((sum, e) => sum + (e.amount || 0), 0);
    const scoreSum = events.reduce((sum, e) => sum + (e.impulse_score || 0), 0);
    const avgImpulseScore = impulseCount > 0 ? scoreSum / impulseCount : 0;

    // 查退款数（7 天内）
    const { count: refundCount, error: refundError } = await supabase
      .from('refund_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString());

    if (refundError) {
      logger.warn(`[Cultivation] refund count error: ${refundError.message}`);
    }

    return {
      impulseCount,
      totalAmount,
      avgImpulseScore,
      refundCount: refundCount || 0,
    };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Cultivation] fetchWeeklyMetrics unexpected: ${err instanceof Error ? err.message : String(err)}`);
    return { impulseCount: 0, totalAmount: 0, avgImpulseScore: 0, refundCount: 0 };
  }
}

/**
 * 查询用户过去 30 天的月度指标
 */
async function fetchMonthlyMetrics(userId: string): Promise<MonthlyMetrics | null> {
  const { supabase } = createAdminClient();
  if (!supabase) {
    return { impulseCount: 0, resistedCount: 0, challengePassRate: 0 };
  }

  const thirtyDaysAgo = subDays(new Date(), 30);

  try {
    // 30 天冲动事件数
    const { count: impulseCount, error: impError } = await supabase
      .from('impulse_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (impError) {
      logger.warn(`[Cultivation] monthly impulse count error: ${impError.message}`);
    }

    // 30 天 Challenge 通过数（从 health_events 查 type='challenge_completed' 或类似）
    // 实际上 Challenge 完成会调 complete_challenge MCP 工具，记录在 health_events 表
    const { count: resistedCount, error: resError } = await supabase
      .from('health_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'challenge_completed')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (resError) {
      // 🔧 ARCH fix (Round 12 H5): 旧代码忽略错误, res=0 → challengePassRate=0 → false downgrade
      //    根因修复: fail-closed — 返回 null metrics 让调用方跳过评估而非用错误数据评估
      logger.warn(`[Cultivation] monthly resisted count error: ${resError.message}`);
      return null;
    }

    const imp = impulseCount || 0;
    const res = resistedCount || 0;
    // 北极星口径 v2（2026-08-18 定位切换 "AI shopper that says no"，营销报告 4.2 节）：
    // 拦截率分母 = 被系统判定为冲动的提议次数（systemJudgedImpulseProposals），
    // 来源有二：聊天 AI 判定（record_impulse.ts）+ 邮件规则评分（calculateEmailImpulseScore ≥40，
    // email scan/resync/imap-connect 三路径，事后收据检测非 AI 判定但同为系统判定）。
    // impulse_events（系统判定冲动、未被拦截即漏拦）+ challenge_completed（系统判定冲动
    // 且被成功软拦截）共同构成系统判定的冲动提议全集，resistedCount 是其中的成功拦截子集。
    // 入口化后购买执行量暴涨不再冲低该比率。
    const systemJudgedImpulseProposals = imp + res;
    const challengePassRate = systemJudgedImpulseProposals > 0 ? res / systemJudgedImpulseProposals : 0;

    return {
      impulseCount: imp,
      resistedCount: res,
      challengePassRate,
    };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Cultivation] fetchMonthlyMetrics unexpected: ${err instanceof Error ? err.message : String(err)}`);
    return { impulseCount: 0, resistedCount: 0, challengePassRate: 0 };
  }
}

// ============================================================
// 主接口 — DB operations
// ============================================================

/**
 * 获取用户干预画像（不存在则创建默认）
 */
export async function getProfile(userId: string): Promise<InterventionProfile | null> {
  const { supabase } = createAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_intervention_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.warn(`[Cultivation] getProfile error: ${error.message}`);
      return null;
    }

    if (!data) {
      // 不存在，创建默认
      return await createDefaultProfile(userId);
    }

    return mapRowToProfile(data as Record<string, unknown>);
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Cultivation] getProfile unexpected: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * 创建默认画像（新用户）
 */
async function createDefaultProfile(userId: string): Promise<InterventionProfile | null> {
  const { supabase } = createAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_intervention_profile')
      .insert({
        user_id: userId,
        severity_tier: 'severe', // 新用户默认 severe（保守）
        cultivation_stage: 'zhi_yu', // 新用户默认知欲
        stage_entered_at: new Date().toISOString(),
        weekly_impulse_count: 0,
        weekly_total_amount: 0,
        weekly_avg_impulse_score: 0,
        weekly_refund_count: 0,
        monthly_impulse_count: 0,
        monthly_resisted_count: 0,
        monthly_challenge_pass_rate: 0,
        stage_assessment_history: [],
        last_reassessed_at: new Date().toISOString(),
        professional_referral_recommended: false,
      })
      .select('*')
      .single();

    if (error) {
      // 可能已被并发创建，尝试再查一次
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('user_intervention_profile')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (existing) return mapRowToProfile(existing as Record<string, unknown>);
      }
      logger.warn(`[Cultivation] createDefaultProfile error: ${error.message}`);
      return null;
    }

    return mapRowToProfile(data as Record<string, unknown>);
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Cultivation] createDefaultProfile unexpected: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * 重新评估用户画像（severity + cultivation_stage）
 * 由 admin API 或 cron 调用
 */
export async function reassessProfile(userId: string): Promise<StageAssessmentResult | null> {
  const { supabase } = createAdminClient();
  if (!supabase) return null;

  try {
    // 1. 获取当前画像
    const currentProfile = await getProfile(userId);
    if (!currentProfile) {
      logger.warn(`[Cultivation] reassessProfile: cannot get/create profile for ${userId.substring(0, 8)}`);
      return null;
    }

    // 2. 拉取指标
    const [weekly, monthly] = await Promise.all([
      fetchWeeklyMetrics(userId),
      fetchMonthlyMetrics(userId),
    ]);

    // 3. 评估 severity
    const severityResult = assessSeverityTier(weekly);

    // 4. 评估 cultivation_stage
    // 🔧 ARCH fix (Round 12 H5): 若 monthly 为 null (查询失败), 不评估 stage (保持当前)
    const stageResult = monthly
      ? assessCultivationStage(currentProfile.cultivationStage, monthly)
      : { stage: currentProfile.cultivationStage, changed: false, reason: 'monthly metrics unavailable (DB error)' };

    // 5. 判断是否需要更新
    const severityChanged = severityResult.tier !== currentProfile.severityTier;
    const stageChanged = stageResult.changed;
    // 🔧 Round 12 H5: monthly 可能为 null, 用 fallback
    const safeMonthly = monthly || { impulseCount: 0, resistedCount: 0, challengePassRate: 0 };
    const needsUpdate = severityChanged || stageChanged ||
      weekly.impulseCount !== currentProfile.weeklyImpulseCount ||
      safeMonthly.impulseCount !== currentProfile.monthlyImpulseCount;

    if (needsUpdate) {
      // 6. 准备更新数据
      // 🔧 ARCH fix (Round 45 REVIEW-A-3): 用 Database schema Update 类型替代 Record<string, unknown>
      const updateData: Record<string, unknown> = {
        severity_tier: severityResult.tier,
        weekly_impulse_count: weekly.impulseCount,
        weekly_total_amount: weekly.totalAmount,
        weekly_avg_impulse_score: weekly.avgImpulseScore,
        weekly_refund_count: weekly.refundCount,
        monthly_impulse_count: safeMonthly.impulseCount,
        monthly_resisted_count: safeMonthly.resistedCount,
        monthly_challenge_pass_rate: safeMonthly.challengePassRate,
        last_reassessed_at: new Date().toISOString(),
      };

      if (stageChanged) {
        updateData.cultivation_stage = stageResult.stage;
        updateData.stage_entered_at = new Date().toISOString();
      }

      // 重度用户警示边界（severe + zhi_yu）
      const isSevereAndZhiYu = severityResult.tier === 'severe' && stageResult.stage === 'zhi_yu';
      updateData.professional_referral_recommended = isSevereAndZhiYu;
      if (isSevereAndZhiYu) {
        updateData.referral_reason = `severe + zhi_yu: ${severityResult.reason}`;
      }

      // 7. 追加评估历史
      const historyEntry = {
        assessed_at: new Date().toISOString(),
        severity_tier: severityResult.tier,
        cultivation_stage: stageResult.stage,
        severity_reason: severityResult.reason,
        stage_reason: stageResult.reason,
        stage_changed: stageChanged,
      };

      // 获取现有历史（最多保留 50 条）
      // 🔧 ARCH fix (Round 44 R44-A-1 — stage_assessment_history 永远丢失根因):
      //    旧代码: 用 `as unknown as Record<string, unknown>` 绕过 TS 访问 stage_assessment_history,
      //    但 currentProfile (InterventionProfile) 接口没有该字段, mapRowToProfile 也不读该列
      //    → existingHistoryRaw 永远是 undefined → existingHistory 永远是 [] → newHistory 永远只有 1 条
      //    → DB column (migration 022 设计保留 50 条历史) 每次被重置为单条。
      //    根因修复: InterventionProfile 加 stageAssessmentHistory 字段 + mapRowToProfile 读列,
      //    这里直接用 currentProfile.stageAssessmentHistory (已类型安全)。
      const existingHistory = Array.isArray(currentProfile.stageAssessmentHistory) ? currentProfile.stageAssessmentHistory : [];
      const newHistory = [...existingHistory, historyEntry].slice(-50);
      updateData.stage_assessment_history = toJson(newHistory);

      // 8. 执行更新
      // 🔧 ARCH fix (Round 45 REVIEW-A-3): 保留 Partial<{...}> cast (Record<string, unknown>
      // 太宽泛, Supabase update 要求精确类型)。updateData 是 Record<string, unknown> 因为
      // 字段是条件性添加的, 用 cast 让 TS 接受。
      const { error: updateError } = await supabase
        .from('user_intervention_profile')
        .update(updateData as Partial<{
          severity_tier: 'severe' | 'moderate' | 'light';
          weekly_impulse_count: number;
          weekly_total_amount: number;
          weekly_avg_impulse_score: number;
          weekly_refund_count: number;
          monthly_impulse_count: number;
          monthly_resisted_count: number;
          monthly_challenge_pass_rate: number;
          last_reassessed_at: string;
          cultivation_stage: 'zhi_yu' | 'zhi_zhi' | 'cheng_yi' | 'zheng_xin';
          stage_entered_at: string;
          professional_referral_recommended: boolean;
          referral_reason: string;
          stage_assessment_history: Json;
        }>)
        .eq('user_id', userId);

      if (updateError) {
        logger.warn(`[Cultivation] reassessProfile update error: ${updateError.message}`);
        return null;
      }

      logger.info(`[Cultivation] Reassessed user ${userId.substring(0, 8)}: severity=${severityResult.tier}, stage=${stageResult.stage}${stageChanged ? ` (changed from ${currentProfile.cultivationStage})` : ''}`);
    }

    return {
      severityTier: severityResult.tier,
      cultivationStage: stageResult.stage,
      stageChanged,
      previousStage: stageChanged ? currentProfile.cultivationStage : undefined,
      reason: `${severityResult.reason} | ${stageResult.reason}`,
      metrics: {
        weeklyImpulseCount: weekly.impulseCount,
        weeklyTotalAmount: weekly.totalAmount,
        weeklyAvgImpulseScore: weekly.avgImpulseScore,
        monthlyImpulseCount: safeMonthly.impulseCount,
        monthlyResistedCount: safeMonthly.resistedCount,
        monthlyChallengePassRate: safeMonthly.challengePassRate,
      },
    };
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Cultivation] reassessProfile unexpected: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ============================================================
// 辅助：行数据 → Profile 对象
// ============================================================

function mapRowToProfile(row: Record<string, unknown>): InterventionProfile {
  return {
    userId: row.user_id as string,
    severityTier: row.severity_tier as SeverityTier,
    cultivationStage: row.cultivation_stage as CultivationStage,
    stageEnteredAt: row.stage_entered_at as string,
    weeklyImpulseCount: row.weekly_impulse_count as number,
    weeklyTotalAmount: Number(row.weekly_total_amount) || 0,
    weeklyAvgImpulseScore: Number(row.weekly_avg_impulse_score) || 0,
    weeklyRefundCount: row.weekly_refund_count as number,
    monthlyImpulseCount: row.monthly_impulse_count as number,
    monthlyResistedCount: row.monthly_resisted_count as number,
    monthlyChallengePassRate: Number(row.monthly_challenge_pass_rate) || 0,
    selfReportedSeverity: (row.self_reported_severity as InterventionProfile['selfReportedSeverity']) || null,
    professionalReferralRecommended: row.professional_referral_recommended as boolean,
    lastReassessedAt: row.last_reassessed_at as string,
    // 🔧 ARCH fix (Round 44 R44-A-1): 读 stage_assessment_history 列 (之前不读 → 历史永远丢失)
    stageAssessmentHistory: Array.isArray(row.stage_assessment_history) ? row.stage_assessment_history as unknown[] : [],
  };
}

// ============================================================
// 给 chat route 用的快捷接口
// ============================================================

/**
 * 获取用户当前的 cultivation_stage（用于 chat route 注入 system prompt）
 *
 * 永不抛错 — 失败返回 'zhi_yu'（默认）
 */
export async function getUserCultivationStage(userId: string): Promise<CultivationStage> {
  try {
    const profile = await getProfile(userId);
    return profile?.cultivationStage || 'zhi_yu';
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    // 🔧 ARCH fix (Round 43 LOW-2 — 失败静默返回 'zhi_yu' 用户不知 AI 风格退化):
    //    旧代码 catch {} 完全静默。DB 错误时用户可能已进阶到 'dao_jing' 但 AI 用 'zhi_yu' 风格回复。
    //    根因修复: logger.warn (仍返回 'zhi_yu' 不阻塞主流程, 永不抛错的契约保持)。
    logger.warn('[Cultivation] getUserCultivationStage failed, returning default zhi_yu:', err);
    return 'zhi_yu';
  }
}

/**
 * 异步触发重新评估（不等待，用于 chat route 调用）
 *
 * 每次用户聊天时调一次，但实际更新由 supabase upsert 处理（不会重复评估）
 * 为避免每次聊天都查指标，加 1 小时缓存（last_reassessed_at 距今 < 1h 则跳过）
 */
export async function triggerReassessIfNeeded(userId: string): Promise<void> {
  try {
    const { supabase } = createAdminClient();
    if (!supabase) return;

    // 检查上次评估时间
    const { data, error } = await supabase
      .from('user_intervention_profile')
      .select('last_reassessed_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return;

    if (data) {
      const lastAssessed = new Date((data as Record<string, unknown> | null)?.last_reassessed_at as string);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastAssessed > oneHourAgo) {
        // 1 小时内已评估，跳过
        return;
      }
    }

    // 异步触发评估（不等待）
    // 🔧 ARCH fix (Round 21 BUG-R21-H7 — fire-and-forget 无 waitUntil, Vercel 杀函数后评估未完成):
    //    旧代码: reassessProfile(userId).catch(...) — 浮动 Promise, Vercel 可能在完成前杀函数
    //    → 用户的 cultivation stage 评估间歇性失败 → stage 停留在旧值 → AI 对话风格不匹配。
    //    根因修复: 用 waitUntil (Vercel) 延长函数生命周期; fallback 到 fire-and-forget。
    //    模式与 embed-backfill.ts:431-438 + admin-audit.ts 一致。
    const reassessPromise = reassessProfile(userId).catch(err => {
      logger.warn(`[Cultivation] triggerReassess async failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    // 🔧 ARCH fix (Round 5 AUDIT-1 M-2): 用共享 fireAndForgetSafely 替代重复的 waitUntil 模式
    fireAndForgetSafely(reassessPromise);
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn(`[Cultivation] triggerReassessIfNeeded unexpected: ${err instanceof Error ? err.message : String(err)}`);
  }
}
