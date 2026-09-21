/**
 * Growth Stats — K 因子测量纯聚合层 (batch82-c)
 *
 * BP 承诺 (0918 p20 验证期): 病毒机制建档 — K 因子与付费转化率。邀请链路
 * (record-ref 写 pending / invitation-reward 完成后 completed) 一直没有漏斗
 * 聚合视图, K 因子无法测量; 本模块补上数据层。
 *
 * 口径:
 * - 邀请发出   = invitations 总行数 (status 含 pending/completed/rejected)。
 * - 已完成     = status='completed' 行数 (双方 +30 天 Premium 的那批)。
 * - 去重邀请者 = 出现过的去重 referrer_user_id 数 (活跃邀请者)。
 * - K 因子近似 = completed ÷ 去重邀请者 — 人均带来完成邀请数。
 *
 * 红线 (owner 09-06): 只读聚合 — 输出键面无任何个人字段, 邀请奖励 50 代币
 * 是积分不是钱, reward_amount 永不出现在输出。数据不足照常返回真实小数字
 * (诚实原则: K=0.3 就显示 0.3, 不美化不设阈值门槛)。
 */

/** invitations 聚合输入最小列 — 只为去重与状态计数, 单行不离开服务端 */
export interface GrowthInvitationRow {
  referrer_user_id: string | null;
  status: string | null;
}

/** 公开输出 — 键面即契约: 只有聚合桶, 无个人字段 */
export interface GrowthStats {
  invites: {
    total: number;
    pending: number;
    completed: number;
  };
  /** 出现过的去重邀请者数 (活跃邀请者) */
  uniqueInviters: number;
  /** K 因子近似值 = completed ÷ uniqueInviters (两位小数; 无邀请者时 0) */
  kFactorApprox: number;
  generatedAt: string;
  /** true = 聚合失败, 当前值来自缓存/降级快照而非实时聚合 */
  degraded: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 零值骨架 — 聚合不可用时的最终兜底 (仍满足键面契约, 诚实为零不做样) */
export function emptyGrowthStats(now: Date, degraded: boolean): GrowthStats {
  return {
    invites: { total: 0, pending: 0, completed: 0 },
    uniqueInviters: 0,
    kFactorApprox: 0,
    generatedAt: now.toISOString(),
    degraded,
  };
}

/**
 * 纯函数: invitations 行数组 → 公开聚合。无效行跳过; referrer 缺失的行
 * 计入发出数但不进邀请者分母 (不虚构活跃邀请者)。
 */
export function aggregateGrowthStats(
  rows: GrowthInvitationRow[] | null | undefined,
  now: Date,
): GrowthStats {
  let total = 0;
  let pending = 0;
  let completed = 0;
  const inviters = new Set<string>();
  for (const row of rows || []) {
    if (!row) continue;
    total += 1;
    if (row.status === 'pending') pending += 1;
    if (row.status === 'completed') completed += 1;
    if (row.referrer_user_id) inviters.add(row.referrer_user_id);
  }
  return {
    invites: { total, pending, completed },
    uniqueInviters: inviters.size,
    kFactorApprox: inviters.size === 0 ? 0 : round2(completed / inviters.size),
    generatedAt: now.toISOString(),
    degraded: false,
  };
}
