import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * Cultivation Assessment — Pure functions for severity tier + cultivation stage
 *
 * 🔧 ARCH fix Round 73 (Finding 2 — god component splits): Extracted from cultivation.ts
 *    These are pure functions (no DB, no side effects) — easy to test in isolation.
 *    cultivation.ts now focuses on DB operations (getProfile, reassessProfile, etc.)
 *
 * 道经依据：道体二·共生（AI 记住用户状态，个性化陪伴）
 */

// ============================================================
// Types — shared between assessment (pure) and repository (DB)
// ============================================================

export type SeverityTier = 'severe' | 'moderate' | 'light';

export type CultivationStage = 'zhi_yu' | 'zhi_zhi' | 'cheng_yi' | 'zheng_xin';

export interface WeeklyMetrics {
  impulseCount: number;
  totalAmount: number;
  avgImpulseScore: number;
  refundCount: number;
}

export interface MonthlyMetrics {
  impulseCount: number;
  resistedCount: number;
  /**
   * 北极星口径 v2（2026-08-18 定位切换）：拦截率 = resistedCount / (impulseCount + resistedCount)。
   * 分母是「被系统判定为冲动的提议次数」，来源有二：聊天 AI 判定（record_impulse.ts）+
   * 邮件规则评分（calculateEmailImpulseScore ≥40，email scan/resync/imap-connect 三路径）。
   * impulse_events = 被判定冲动且未被拦截；challenge_completed = 被判定冲动且被成功软拦截。
   * 不是"挑战总数"。字段名 challengePassRate 为兼容 DB 列 monthly_challenge_pass_rate 保留，
   * 语义即拦截率（interception rate）。详见 marketing report 4.2 / cultivation.ts fetchMonthlyMetrics。
   */
  challengePassRate: number;
}

// ============================================================
// severity_tier 评估（西方维度，定强度）
// ============================================================

/**
 * 根据 7 天指标自动计算 severity_tier
 *
 * 评分公式（0-100，越高越严重）：
 * - weekly_impulse_count * 4 (次数权重，5 次 = 20 分)
 * - weekly_total_amount / 10 (金额，$100 = 10 分)
 * - weekly_avg_impulse_score * 0.3 (冲动评分均值)
 *
 * severe: score >= 40
 * moderate: 20 <= score < 40
 * light: score < 20
 */
export function assessSeverityTier(metrics: WeeklyMetrics): { tier: SeverityTier; score: number; reason: string } {
  const score =
    metrics.impulseCount * 4 +
    metrics.totalAmount / 10 +
    metrics.avgImpulseScore * 0.3;

  let tier: SeverityTier;
  let reason: string;

  if (score >= 40) {
    tier = 'severe';
    reason = `score=${score.toFixed(1)} (impulseCount=${metrics.impulseCount}, amount=$${metrics.totalAmount.toFixed(0)}, avgScore=${metrics.avgImpulseScore.toFixed(0)})`;
  } else if (score >= 20) {
    tier = 'moderate';
    reason = `score=${score.toFixed(1)} (impulseCount=${metrics.impulseCount}, amount=$${metrics.totalAmount.toFixed(0)}, avgScore=${metrics.avgImpulseScore.toFixed(0)})`;
  } else {
    tier = 'light';
    reason = `score=${score.toFixed(1)} (impulseCount=${metrics.impulseCount}, amount=$${metrics.totalAmount.toFixed(0)}, avgScore=${metrics.avgImpulseScore.toFixed(0)})`;
  }

  return { tier, score, reason };
}

// ============================================================
// cultivation_stage 评估（东方维度，定风格）
// ============================================================

/**
 * 根据 30 天指标评估修身阶段
 *
 * 升级条件：
 * - zhi_yu → zhi_zhi: monthly_impulse_count < 15 (开始有觉察)
 * - zhi_zhi → cheng_yi: monthly_challenge_pass_rate > 0.6 + monthly_impulse_count < 10
 * - cheng_yi → zheng_xin: monthly_challenge_pass_rate > 0.8 + monthly_impulse_count < 3 + 30 天稳定
 *
 * 降级条件：
 * - 任何阶段: 30 天冲动 > 15 → 降回 zhi_yu
 * - cheng_yi/zheng_xin: 30 天冲动 > 5 → 降回 zhi_zhi
 */
export function assessCultivationStage(
  currentStage: CultivationStage,
  monthly: MonthlyMetrics,
): { stage: CultivationStage; changed: boolean; reason: string } {
  const { impulseCount, challengePassRate } = monthly;

  // 降级检查（优先）
  if (impulseCount > 15) {
    if (currentStage !== 'zhi_yu') {
      return {
        stage: 'zhi_yu',
        changed: true,
        reason: `downgrade: monthly_impulse_count=${impulseCount} > 15`,
      };
    }
    return {
      stage: 'zhi_yu',
      changed: false,
      reason: `maintain: monthly_impulse_count=${impulseCount} > 15`,
    };
  }

  if (impulseCount > 5 && (currentStage === 'cheng_yi' || currentStage === 'zheng_xin')) {
    return {
      stage: 'zhi_zhi',
      changed: true,
      reason: `downgrade: monthly_impulse_count=${impulseCount} > 5, current=${currentStage}`,
    };
  }

  // 升级检查
  // cheng_yi → zheng_xin
  if (currentStage === 'cheng_yi') {
    if (impulseCount < 3 && challengePassRate > 0.8) {
      return {
        stage: 'zheng_xin',
        changed: true,
        reason: `upgrade: impulseCount=${impulseCount} < 3, passRate=${(challengePassRate * 100).toFixed(0)}% > 80%`,
      };
    }
    return {
      stage: 'cheng_yi',
      changed: false,
      reason: `maintain: impulseCount=${impulseCount}, passRate=${(challengePassRate * 100).toFixed(0)}%`,
    };
  }

  // zhi_zhi → cheng_yi
  if (currentStage === 'zhi_zhi') {
    if (impulseCount < 10 && challengePassRate > 0.6) {
      return {
        stage: 'cheng_yi',
        changed: true,
        reason: `upgrade: impulseCount=${impulseCount} < 10, passRate=${(challengePassRate * 100).toFixed(0)}% > 60%`,
      };
    }
    return {
      stage: 'zhi_zhi',
      changed: false,
      reason: `maintain: impulseCount=${impulseCount}, passRate=${(challengePassRate * 100).toFixed(0)}%`,
    };
  }

  // zhi_yu → zhi_zhi
  if (currentStage === 'zhi_yu') {
    if (impulseCount < 15) {
      return {
        stage: 'zhi_zhi',
        changed: true,
        reason: `upgrade: impulseCount=${impulseCount} < 15 (showing awareness)`,
      };
    }
    return {
      stage: 'zhi_yu',
      changed: false,
      reason: `maintain: impulseCount=${impulseCount} >= 15`,
    };
  }

  // zheng_xin 维持
  return {
    stage: 'zheng_xin',
    changed: false,
    reason: `maintain: impulseCount=${impulseCount}, passRate=${(challengePassRate * 100).toFixed(0)}%`,
  };
}
