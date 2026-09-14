/**
 * micro-challenge-store — 微挑战的客户端持久化 (localStorage, 零 DDL)
 *
 * 职责单一, 三块状态:
 * 1. 发起历史 (frequency): 卡片展示时记录 {category, initiatedAt}, 随 chat 请求体
 *    上行做服务端 7 天同品类冷却 (microChallengeHistory 字段)
 * 2. 待回访记录 (follow-up): 接受挑战时记录 {challengeId, category, dueAt},
 *    次日打开 chat 时到期 → 展示一次性结果回访条
 * 3. 回访消解: 用户二选一后清除记录, 回访条不再出现
 *
 * 所有读写 try/catch 静默降级 (localStorage 不可用 = 本会话内无频控/无回访, 不阻塞 chat)。
 */

import { logger } from '@/lib/logger';
import type { MicroChallengeCategory, MicroChallengeHistoryEntry } from '@/types/micro-challenge';

const HISTORY_STORAGE_KEY = 'symy-micro-challenge-history';
const PENDING_STORAGE_KEY = 'symy-micro-challenge-pending';
const HISTORY_MAX_ENTRIES = 20;

function isMicroCategory(v: unknown): v is MicroChallengeCategory {
  return v === 'electronics' || v === 'clothing' || v === 'beauty' || v === 'home' || v === 'food';
}

/** 读发起历史 (形状校验, 坏数据当空) */
export function readMicroChallengeHistory(): MicroChallengeHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is MicroChallengeHistoryEntry =>
        !!e && isMicroCategory((e as { category?: unknown }).category) &&
        typeof (e as { initiatedAt?: unknown }).initiatedAt === 'number',
    );
  } catch {
    // safe to ignore: 频控是 best-effort 装饰, 读不了就当无历史
    return [];
  }
}

/** 卡片展示时记一条发起 (频控锚点; 接受/跳过/忽略都算已发起) */
export function recordMicroChallengeOffered(category: MicroChallengeCategory): void {
  if (typeof window === 'undefined') return;
  try {
    const history = readMicroChallengeHistory();
    history.push({ category, initiatedAt: Date.now() });
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(-HISTORY_MAX_ENTRIES)),
    );
  } catch {
    // safe to ignore: 隐私模式持久化失败, 只影响跨会话频控
  }
}

/** 待回访记录 — 接受微挑战时写入, 次日到期触发一次性回访条 */
export interface PendingMicroChallenge {
  challengeId: string;
  category: MicroChallengeCategory;
  /** 挑战创建时的 item_name (回访完成时原样传回 complete 端点) */
  itemName: string;
  /** 挑战金额 (创建时用的名义金额, 回访完成时原样传回) */
  amount: number;
  /** 到期时间 (ms epoch) = 创建 + 24h */
  dueAt: number;
}

function readPending(): PendingMicroChallenge | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.challengeId === 'string' && p.challengeId &&
      isMicroCategory(p.category) &&
      typeof p.itemName === 'string' &&
      typeof p.amount === 'number' &&
      typeof p.dueAt === 'number'
    ) {
      return { challengeId: p.challengeId, category: p.category, itemName: p.itemName, amount: p.amount, dueAt: p.dueAt };
    }
    return null;
  } catch {
    // safe to ignore: 回访是 best-effort, 坏记录当无
    return null;
  }
}

function writePending(record: PendingMicroChallenge | null): void {
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

/** 接受微挑战时写入待回访记录 */
export function savePendingMicroChallenge(record: PendingMicroChallenge): void {
  writePending(record);
}

/** 到期待回访记录 (未到期 / 无记录 → null) */
export function getDueMicroChallenge(now: number = Date.now()): PendingMicroChallenge | null {
  const pending = readPending();
  if (!pending) return null;
  return pending.dueAt <= now ? pending : null;
}

/** 回访已消解 (用户二选一后调用) — 记录清除, 回访条不再出现 */
export function resolvePendingMicroChallenge(): void {
  writePending(null);
}

/** 过期清理: pending 超过 7 天仍未回访 → 静默丢弃 (避免僵尸记录) */
export function pruneStalePendingMicroChallenge(now: number = Date.now()): void {
  const pending = readPending();
  if (pending && now - pending.dueAt > 7 * 24 * 60 * 60 * 1000) {
    logger.info('[micro-challenge-store] stale pending follow-up pruned');
    writePending(null);
  }
}

/** 测试用: 清空全部本地状态 */
export function _resetMicroChallengeStoreForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
