/**
 * prepurchase-store — 买前三问决策记录 + 冷静待回访的客户端持久化 (localStorage, 零 DDL)
 *
 * 两个 key:
 * - symy-prepurchase-decisions: 决策日志 (数组)。周累计「本周三问帮你留下的钱」
 *   只统计放弃项: 家里有替代 (当场放弃) 或 冷静 24h 后次日回访改判「不想要了」。
 *   金额只存在这里 (用户私域), 永不进分享卡与荣誉框架。
 * - symy-prepurchase-pending: 冷静 24h 待回访记录 (24h 后到期 → 一次性回访条)。
 *
 * 所有读写 try/catch 静默降级 (localStorage 不可用 = 本会话无回访无周累计, 不阻塞 chat)。
 */

import { logger } from '@/lib/logger';
import type { PrepurchaseDecision, PrepurchaseDecisionRecord, PendingPrepurchaseFollowup } from '@/types/prepurchase';

const DECISIONS_STORAGE_KEY = 'symy-prepurchase-decisions';
const PENDING_STORAGE_KEY = 'symy-prepurchase-pending';
const STALE_MS = 60 * 24 * 60 * 60 * 1000; // 决策日志 60 天后清理
const MAX_DECISIONS = 200;

function isDecision(v: unknown): v is PrepurchaseDecision {
  return v === 'buy' || v === 'have_alt' || v === 'cooldown_24h';
}

function sanitizeAmount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function readDecisions(): PrepurchaseDecisionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DECISIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is PrepurchaseDecisionRecord =>
        !!r && typeof r === 'object' &&
        isDecision((r as Record<string, unknown>).decision) &&
        typeof (r as Record<string, unknown>).followupLetGo === 'boolean' &&
        typeof (r as Record<string, unknown>).decidedAt === 'number',
    ).map((r) => ({
      decision: r.decision,
      followupLetGo: r.followupLetGo,
      amount: sanitizeAmount((r as unknown as Record<string, unknown>).amount),
      decidedAt: r.decidedAt,
    }));
  } catch {
    // safe to ignore: 坏日志当无 (周累计只是 best-effort 展示)
    return [];
  }
}

function writeDecisions(records: PrepurchaseDecisionRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DECISIONS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // safe to ignore: 持久化失败只影响周累计展示
  }
}

/** 本周一 00:00 (本地时区) 的 ms epoch — 周累计的分桶边界 */
export function weekStartOf(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 周一=0
  return d.getTime() - day * 24 * 60 * 60 * 1000;
}

/** 决策卡三选一确认时追加一条决策记录 (buy 只留痕不计金额; have_alt 计入周累计) */
export function recordPrepurchaseDecision(
  input: Pick<PrepurchaseDecisionRecord, 'decision' | 'amount'> & Partial<Pick<PrepurchaseDecisionRecord, 'followupLetGo'>>,
): void {
  const record: PrepurchaseDecisionRecord = {
    decision: input.decision,
    followupLetGo: input.followupLetGo === true,
    amount: sanitizeAmount(input.amount),
    decidedAt: Date.now(),
  };
  const records = readDecisions().filter((r) => Date.now() - r.decidedAt < STALE_MS);
  records.push(record);
  writeDecisions(records.slice(-MAX_DECISIONS));
}

/** 冷静 24h 次日回访改判「不想要了」→ 追加放弃记录 (金额此时才计入周累计) */
export function recordPrepurchaseLetGo(amount: number | null): void {
  recordPrepurchaseDecision({ decision: 'cooldown_24h', amount, followupLetGo: true });
}

/** 本周三问帮你留下的钱 (放弃项金额之和; buy 恒不计入) */
export function getWeeklyGuardedAmount(now: number = Date.now()): number {
  const weekStart = weekStartOf(now);
  return readDecisions()
    .filter((r) => r.decidedAt >= weekStart)
    .filter((r) => r.decision === 'have_alt' || (r.decision === 'cooldown_24h' && r.followupLetGo))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

function readPending(): PendingPrepurchaseFollowup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (
      (p.subject === null || typeof p.subject === 'string') &&
      typeof p.askedAt === 'number' &&
      typeof p.dueAt === 'number'
    ) {
      return {
        subject: typeof p.subject === 'string' ? p.subject : null,
        askedAt: p.askedAt,
        dueAt: p.dueAt,
        amount: sanitizeAmount(p.amount),
      };
    }
    return null;
  } catch {
    // safe to ignore: 回访是 best-effort, 坏记录当无
    return null;
  }
}

function writePending(record: PendingPrepurchaseFollowup | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (record) {
      window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(record));
    } else {
      window.localStorage.removeItem(PENDING_STORAGE_KEY);
    }
  } catch {
    // safe to ignore: 持久化失败只影响次日回访
  }
}

/** 冷静选项确认时写入待回访记录 (24h 后到期) */
export function savePendingPrepurchase(record: PendingPrepurchaseFollowup): void {
  writePending(record);
}

/** 到期待回访记录 (未到期 / 无记录 → null) */
export function getDuePrepurchase(now: number = Date.now()): PendingPrepurchaseFollowup | null {
  const pending = readPending();
  if (!pending) return null;
  return pending.dueAt <= now ? pending : null;
}

/** 回访已消解 (用户二选一后调用) — 记录清除, 回访条不再出现 */
export function resolvePendingPrepurchase(): void {
  writePending(null);
}

/** 进行中冷静期记录 (batch59-a 守护面板) — 未超 7 天僵尸线都算进行中 (含到期待回访) */
export function getActivePendingPrepurchase(now: number = Date.now()): PendingPrepurchaseFollowup | null {
  const pending = readPending();
  if (!pending || now - pending.dueAt > 7 * 24 * 60 * 60 * 1000) return null;
  return pending;
}

/** 过期清理: pending 超过 7 天仍未回访 → 静默丢弃 (避免僵尸记录) */
export function pruneStalePendingPrepurchase(now: number = Date.now()): void {
  const pending = readPending();
  if (pending && now - pending.dueAt > 7 * 24 * 60 * 60 * 1000) {
    logger.info('[prepurchase-store] stale pending follow-up pruned');
    writePending(null);
  }
}

/** 测试用: 清空本地状态 */
export function _resetPrepurchaseStoreForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DECISIONS_STORAGE_KEY);
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
