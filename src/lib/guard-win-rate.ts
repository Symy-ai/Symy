/**
 * Guard Win Rate — 守护胜率漏斗 (batch49-c)
 *
 * 从既有 health_events 只读派生"我的守护赢了几成":
 *   局数 = challenge_completed (通过) + challenge_failed (中途破防)
 *   转存 = challenge_reward + deposit_api (与 guard-ledger 同管道, 挑战通过后存入梦想基金)
 *
 * 口径红线 (与 guard-ledger 同款, 禁止第二套数):
 * - health_events 没有独立的"挑战发起"事件; 漏斗分母以**有结局的局数**为准
 *   (completed + failed, 均按 triggerId 幂等去重), 每个数都能对回既有记录。
 * - 样本 < MIN_SAMPLE_SIZE 返回 insufficient 态, 不硬造 0% 结论
 *   (沿用 impulse-window 反假洞察原则)。
 * - streak (连续守护成功天数): 从最近一个有结局的本地日期往前数,
 *   每天须 ≥1 次 completed 且 0 次 failed; 断档即停。
 * - 零 DDL / 零新持久化: health_events 被清除 (镜子 reset) 时本视图随之归零。
 */

/** 样本量阈值: 有结局局数少于该值不做结论 */
export const MIN_SAMPLE_SIZE = 5;

/** health_events 最小字段 (GET /api/buddy/health-events 返回的 camelCase 子集) */
export interface GuardWinRateEventInput {
  id?: string;
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface GuardWinRateSummary {
  /** 'insufficient' = 样本不足, 调用方渲染中性文案而非 0% */
  status: 'insufficient' | 'ok';
  /** 有结局的挑战局数 = passed + abandoned (去重后) */
  settled: number;
  /** 通过 (challenge_completed, 去重后) */
  passed: number;
  /** 通过且转存进梦想基金 (challenge_reward/deposit_api, 去重后) */
  deposited: number;
  /** 中途破防 (challenge_failed, 去重后) */
  abandoned: number;
  /** 胜率 0..1 = passed / settled (insufficient 时 0) */
  winRate: number;
  /** 连续守护成功天数 (本地日期, 见文件头口径; insufficient 时 0) */
  streakDays: number;
  /** 胜场累计守护金额 = Σ转存条目 amount (仅 app 内展示, 永不进分享面) */
  guardedAmount: number;
}

/** 单类事件的幂等去重 key: triggerId 优先 (写入方约定), 缺失回退 id */
function dedupKey(e: GuardWinRateEventInput, prefix: string): string {
  return `${prefix}:${e.triggerId || e.id || `${e.createdAt}:${e.eventType}`}`;
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * 从既有 health_events 派生守护胜率漏斗。
 * 无效 createdAt 的条目跳过; 三类事件各自按 triggerId 去重 (防御上游重复落库)。
 */
export function deriveGuardWinRate(events: GuardWinRateEventInput[] | null | undefined): GuardWinRateSummary {
  const passedSeen = new Set<string>();
  const failedSeen = new Set<string>();
  const depositSeen = new Set<string>();
  /** 本地日期 → {passed, failed} (streak 口径) */
  const dayOutcomes = new Map<string, { passed: number; failed: number }>();
  let guardedAmount = 0;

  for (const e of events || []) {
    if (!e || typeof e.eventType !== 'string') continue;
    const day = localDayKey(e.createdAt);
    if (!day) continue;

    if (e.eventType === 'challenge_completed') {
      const key = dedupKey(e, 'completed');
      if (passedSeen.has(key)) continue;
      passedSeen.add(key);
      const d = dayOutcomes.get(day) || { passed: 0, failed: 0 };
      d.passed += 1;
      dayOutcomes.set(day, d);
    } else if (e.eventType === 'challenge_failed') {
      const key = dedupKey(e, 'failed');
      if (failedSeen.has(key)) continue;
      failedSeen.add(key);
      const d = dayOutcomes.get(day) || { passed: 0, failed: 0 };
      d.failed += 1;
      dayOutcomes.set(day, d);
    } else if (e.eventType === 'challenge_reward' && e.triggerSource === 'deposit_api') {
      const meta = (e.metadata && typeof e.metadata === 'object') ? e.metadata : null;
      if (!meta || meta.source !== 'deposit') continue;
      const amount = Number(meta.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const key = dedupKey(e, 'deposit');
      if (depositSeen.has(key)) continue;
      depositSeen.add(key);
      guardedAmount += amount;
    }
  }

  const passed = passedSeen.size;
  const abandoned = failedSeen.size;
  const settled = passed + abandoned;

  // streak: 从最近的有结局日期往回逐日数, 当日须有胜且无败
  let streakDays = 0;
  if (settled > 0 && dayOutcomes.size > 0) {
    const days = [...dayOutcomes.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    // 游标从最近结局日起逐日回退 (本地日期算术, 无 UTC 炸弹)
    const [y0, m0, d0] = days[0].split('-').map(Number);
    let cursor = new Date(y0, m0, d0);
    for (;;) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      const d = dayOutcomes.get(key);
      if (!d || d.passed < 1 || d.failed > 0) break;
      streakDays += 1;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    }
  }

  if (settled < MIN_SAMPLE_SIZE) {
    return {
      status: 'insufficient',
      settled,
      passed,
      deposited: depositSeen.size,
      abandoned,
      winRate: 0,
      streakDays: 0,
      guardedAmount,
    };
  }

  return {
    status: 'ok',
    settled,
    passed,
    deposited: depositSeen.size,
    abandoned,
    winRate: passed / settled,
    streakDays,
    guardedAmount,
  };
}
