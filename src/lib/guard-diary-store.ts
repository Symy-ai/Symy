/**
 * guard-diary-store — 守护日记收藏的客户端持久化 (localStorage, 零 DDL)
 *
 * 同 micro-challenge-store / green prefs 存法: try/catch 静默降级,
 * 存储不可用 = 本会话无收藏, 不阻塞 chat。
 *
 * 口径红线: 收藏条目只存面子字段 (文案/次数/小时/形态),
 * estSaved 永不落收藏 — 收藏列表可能被截图传播, 金额不进任何可分享面。
 */

import type { GuardDiary, GuardDiaryVariant } from '@/lib/guard-diary';

const STORAGE_KEY = 'symy-guard-diary-favorites';
const MAX_ENTRIES = 30;

/** 一条收藏的日记 — 面子字段 only (无 estSaved) */
export interface GuardDiaryFavorite {
  date: string;
  text: string;
  variant: GuardDiaryVariant;
  guardCount: number;
  hoursReclaimed: number;
}

const VARIANTS: ReadonlySet<string> = new Set(['companion', 'night', 'category', 'standard']);

function isValidEntry(v: unknown): v is GuardDiaryFavorite {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    typeof e.text === 'string' && e.text.trim().length > 0 &&
    typeof e.variant === 'string' && VARIANTS.has(e.variant) &&
    typeof e.guardCount === 'number' &&
    typeof e.hoursReclaimed === 'number'
  );
}

/** 读全部收藏 (新→旧, date 降序); 坏数据条目静默剔除 */
export function listGuardDiaryFavorites(): GuardDiaryFavorite[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidEntry)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_ENTRIES);
  } catch {
    // safe to ignore: 收藏是 best-effort 装饰, 读不了当空
    return [];
  }
}

/** 某日日记是否已收藏 */
export function isGuardDiaryFavorited(date: string): boolean {
  return listGuardDiaryFavorites().some((e) => e.date === date);
}

/**
 * 收藏/取消收藏某日日记 (toggle)。
 * 返回 toggle 后的收藏状态 (true = 已收藏)。同日重复收藏幂等 (只保留一条)。
 */
export function toggleGuardDiaryFavorite(diary: GuardDiary): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = listGuardDiaryFavorites();
    const already = current.some((e) => e.date === diary.date);
    const next = already
      ? current.filter((e) => e.date !== diary.date)
      : [
          {
            date: diary.date,
            text: diary.text,
            variant: diary.variant,
            guardCount: diary.guardCount,
            hoursReclaimed: diary.hoursReclaimed,
          },
          ...current,
        ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return !already;
  } catch {
    // safe to ignore: 隐私模式写入失败只影响收藏持久化
    return isGuardDiaryFavorited(diary.date);
  }
}

/** 测试用: 清空收藏 */
export function _resetGuardDiaryStoreForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
