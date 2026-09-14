/**
 * cooldown-store — 冷静卡待回访记录的客户端持久化 (localStorage, 零 DDL)
 *
 * 与 micro-challenge-store 的 pending 半程同型: 冷静卡任一动作 (放进愿望单 /
 * 现在就要) 写入 {category, askedAt, dueAt, userChoseBuy}, 24h 后下次打开 chat
 * 时到期 → 展示一次性回访条; 用户二选一后清除。所有读写 try/catch 静默降级
 * (localStorage 不可用 = 本会话无回访, 不阻塞 chat)。
 */

import { logger } from '@/lib/logger';
import type { CooldownCategory, PendingCooldownFollowup } from '@/types/cooldown';

const PENDING_STORAGE_KEY = 'symy-cooldown-pending';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function isCooldownCategory(v: unknown): v is CooldownCategory {
  return v === 'electronics' || v === 'clothing' || v === 'beauty' || v === 'home' || v === 'food';
}

function readPending(): PendingCooldownFollowup | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const categoryOk = p.category === null || isCooldownCategory(p.category);
    if (
      categoryOk &&
      typeof p.askedAt === 'number' &&
      typeof p.dueAt === 'number' &&
      typeof p.userChoseBuy === 'boolean'
    ) {
      return {
        category: isCooldownCategory(p.category) ? p.category : null,
        askedAt: p.askedAt,
        dueAt: p.dueAt,
        userChoseBuy: p.userChoseBuy,
      };
    }
    return null;
  } catch {
    // safe to ignore: 回访是 best-effort, 坏记录当无
    return null;
  }
}

function writePending(record: PendingCooldownFollowup | null): void {
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

/** 冷静卡动作确认时写入待回访记录 (24h 后到期) */
export function savePendingCooldown(record: PendingCooldownFollowup): void {
  writePending(record);
}

/** 到期待回访记录 (未到期 / 无记录 → null) */
export function getDueCooldown(now: number = Date.now()): PendingCooldownFollowup | null {
  const pending = readPending();
  if (!pending) return null;
  return pending.dueAt <= now ? pending : null;
}

/** 回访已消解 (用户二选一后调用) — 记录清除, 回访条不再出现 */
export function resolvePendingCooldown(): void {
  writePending(null);
}

/** 过期清理: pending 超过 7 天仍未回访 → 静默丢弃 (避免僵尸记录) */
export function pruneStalePendingCooldown(now: number = Date.now()): void {
  const pending = readPending();
  if (pending && now - pending.dueAt > STALE_MS) {
    logger.info('[cooldown-store] stale pending follow-up pruned');
    writePending(null);
  }
}

/** 测试用: 清空本地状态 */
export function _resetCooldownStoreForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
