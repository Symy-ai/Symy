/**
 * Guard Ledger — 守护转存账目 (batch6-b)
 *
 * 把"拦截省下的钱"与"梦想基金进项"打通的展示层聚合:
 * 每一次拦截结算 (挑战通过 → DepositDialog 存入) 已经通过 /api/buddy/deposit
 * 写入 dream fund + total_saved, 并落一条 health_event 审计记录
 * (eventType='challenge_reward', triggerSource='deposit_api',
 *  metadata.source='deposit', metadata.fundId/amount)。
 *
 * 本模块不发明新资金流, 只从这条既有管道**派生**两类视图:
 * 1. 守护转存账目 (symy-ledger 的"守护转存"进项区块)
 * 2. 每个基金的"其中守护攒下 X"构成拆线 (dream-funds-section)
 *
 * 口径红线 (禁止两套数):
 * - 每条转存条目的 amount 就是当时 p_total_saved_delta 的入账额,
 *   因此 Σ(条目) 按 construction 能对回 total_saved (是它的子集 —
 *   total_saved 还含退款找回/手动转入等非拦截来源)。
 * - Σ(fundGuardSaved 按 fund 分组) === Σ(全部条目) — 同一份条目聚合, 恒等式。
 * - health_events 被用户清除 (镜子哲学 reset) 时派生视图随之归零,
 *   这是既有 Clear 语义, 不额外持久化第二套数。
 *
 * 零 DDL: 守护目标基金偏好存 localStorage, 不新增数据库列。
 */

import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';

const GUARD_EVENTS_PAGE_SIZE = 100;
const GUARD_EVENTS_MAX_PAGES = 20;

/** health_events 中守护转存相关的最小字段 (GET /api/buddy/health-events 返回的 camelCase 形状) */
export interface GuardEventLite {
  id: string;
  eventType: string;
  triggerSource: string;
  triggerId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** 一条"守护转存"进项 — 一次拦截结算流入某个梦想基金的钱 */
export interface GuardTransferEntry {
  /** 幂等键: deposit:{userId}:{challengeId}:{fundId}:{amount} (health_event.triggerId) */
  id: string;
  /** 结算金额 — 与该次存款累加进 total_saved / fund.current 的数额同源 */
  amount: number;
  fundId: string;
  fundName: string;
  createdAt: string;
}

/**
 * 从既有 health_events 派生守护转存条目。
 * 只认 deposit_api 落的 challenge_reward 审计记录 (deposit route 唯一写入方),
 * 按 triggerId 去重 (防御上游重复落库), 按 createdAt 升序 = 账本时间序。
 */
export function deriveGuardTransfers(events: GuardEventLite[] | null | undefined): GuardTransferEntry[] {
  if (!events || events.length === 0) return [];
  const seen = new Set<string>();
  const entries: GuardTransferEntry[] = [];

  for (const e of events) {
    if (e.eventType !== 'challenge_reward') continue;
    if (e.triggerSource !== 'deposit_api') continue;
    const meta = (e.metadata && typeof e.metadata === 'object') ? e.metadata : null;
    if (!meta || meta.source !== 'deposit') continue;

    const fundId = typeof meta.fundId === 'string' ? meta.fundId : '';
    const amount = Number(meta.amount);
    if (!fundId || !Number.isFinite(amount) || amount <= 0) continue;

    const key = e.triggerId || e.id;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      id: key,
      amount,
      fundId,
      fundName: typeof meta.fundName === 'string' ? meta.fundName : fundId,
      createdAt: e.createdAt,
    });
  }

  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 拉取完整的守护转存审计管道。API 每页最多 100 条, 用 created_at 游标续拉;
 * 同一微秒内的跨页边界理论上可能漏记录, 但作为非关键展示层已在页容与上限内防御。
 */
export async function fetchGuardTransfers(): Promise<GuardTransferEntry[]> {
  const { apiFetch } = await import('@/lib/api-client');
  let cursor: string | null = null;
  let events: GuardEventLite[] = [];

  for (let page = 0; page < GUARD_EVENTS_MAX_PAGES; page += 1) {
    const url = new URL('/api/buddy/health-events', window.location.origin);
    url.searchParams.set('event_type', 'challenge_reward');
    url.searchParams.set('limit', String(GUARD_EVENTS_PAGE_SIZE));
    if (cursor) url.searchParams.set('before', cursor);

    const data = await apiFetch<{ events?: GuardEventLite[] }>(url.toString());
    const pageEvents = data?.events || [];
    events = events.concat(pageEvents);
    if (pageEvents.length < GUARD_EVENTS_PAGE_SIZE) break;

    const oldest = pageEvents.reduce((min, event) => (event.createdAt < min ? event.createdAt : min), pageEvents[0].createdAt);
    if (!oldest || oldest === cursor) break;
    cursor = oldest;
  }

  return deriveGuardTransfers(events);
}

/** 守护转存总额 — Σ(条目金额), 非有限数防御为 0 */
export function guardTransfersTotal(entries: GuardTransferEntry[] | null | undefined): number {
  if (!entries || entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
}

/** 按基金分组的守护攒下金额 (fundId → Σ金额) — 与条目同源, 恒等于 guardTransfersTotal */
export function guardSavedByFund(entries: GuardTransferEntry[] | null | undefined): Record<string, number> {
  const byFund: Record<string, number> = {};
  for (const e of entries || []) {
    if (!Number.isFinite(e.amount)) continue;
    byFund[e.fundId] = (byFund[e.fundId] || 0) + e.amount;
  }
  return byFund;
}

/** 某个基金"其中守护攒下"的金额 (无守护数据 → 0, 调用方据此不渲染拆线) */
export function fundGuardSaved(fundId: string, entries: GuardTransferEntry[] | null | undefined): number {
  return guardSavedByFund(entries)[fundId] || 0;
}

/**
 * 口径一致性断言用: 守护转存总额是否落在 total_saved 之内。
 * 守护存款是 total_saved 的子集 (total_saved 还累加退款找回/手动转入等来源),
 * 浮点累加留 1 分钱容差。
 */
export function guardTotalWithinTotalSaved(entries: GuardTransferEntry[] | null | undefined, totalSaved: number): boolean {
  return guardTransfersTotal(entries) <= (Number(totalSaved) || 0) + 0.01;
}

// ============================================================
// 守护目标基金偏好 — 拦截省下的钱默认流向的基金 (零 DDL, localStorage)
// ============================================================

export const GUARD_TARGET_STORAGE_KEY = 'symy-buddy-guard-target-fund';

/**
 * 读取守护目标基金 id。未设置/存储不可用时返回默认 SAVINGS_FUND_ID。
 * 调用方仍需校验该 id 在当前 dreamFunds 中存在, 不存在时回退既有选择逻辑。
 */
export function getGuardTargetFundId(): string {
  if (typeof window === 'undefined') return SAVINGS_FUND_ID;
  try {
    const saved = window.localStorage.getItem(GUARD_TARGET_STORAGE_KEY);
    return saved && saved.trim() ? saved.trim() : SAVINGS_FUND_ID;
  } catch {
    // safe to ignore: localStorage 读取失败时回退默认守护目标基金 (Savings), 只影响预选不影响资金流
    return SAVINGS_FUND_ID;
  }
}

/** 设置守护目标基金 (空 id 视为重置为默认) */
export function setGuardTargetFundId(fundId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = fundId.trim();
    if (!trimmed || trimmed === SAVINGS_FUND_ID) {
      window.localStorage.removeItem(GUARD_TARGET_STORAGE_KEY);
    } else {
      window.localStorage.setItem(GUARD_TARGET_STORAGE_KEY, trimmed);
    }
  } catch {
    // safe to ignore: localStorage 不可用 (隐私模式等) 时偏好读写静默降级 —
    // 只影响默认预选基金, 不影响任何资金流
  }
}
