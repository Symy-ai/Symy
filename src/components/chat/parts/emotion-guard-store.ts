/**
 * emotion-guard-store — 情绪守护 10 分钟等待 + 审计幂等的客户端持久化 (localStorage, 零 DDL)
 *
 * 两个 key:
 * - symy-emotion-guard-wait: 「先等 10 分钟」的 one-shot 等待记录 (单条, 新等待覆盖旧)。
 *   到期后由两处消费: 卡内计时器 (本会话) / chat 级到期待追问条 (刷新后)。
 *   不做跨设备同步承诺 — 换设备丢等待, 静默无事。
 * - symy-emotion-guard-audits: 当日已写审计的 triggerId 列表 (跨日自动清)。
 *   「同 mood 同日幂等」的本地防线; 服务端 health_events 按 trigger_id 再去重一道。
 *
 * 审计走 POST /api/buddy/health-events (eventType=manual_adjustment — 客户端唯一
 * 允许的纯审计类型, 零 vitality 副作用)。红线: metadata 只有 source/mood/choice,
 * 金额与物品名绝不落事件。
 */

import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { EmotionGuardChoice, EmotionMood, PendingEmotionWait } from '@/types/emotion-guard';

const WAIT_STORAGE_KEY = 'symy-emotion-guard-wait';
const AUDITS_STORAGE_KEY = 'symy-emotion-guard-audits';
export const EMOTION_WAIT_DURATION_MS = 10 * 60 * 1000;
const STALE_WAIT_MS = 24 * 60 * 60 * 1000; // 10 分钟等待超 24h 未消解 → 僵尸清理

/** 本地时区的 YYYY-MM-DD — triggerId 的「同日」以用户本地日为准 */
export function emotionGuardLocalDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 事件 triggerId 约定: emotion-guard:YYYY-MM-DD:mood (服务端按此幂等去重) */
export function emotionGuardTriggerId(mood: EmotionMood, dateKey: string): string {
  return `emotion-guard:${dateKey}:${mood}`;
}

function readWait(): PendingEmotionWait | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WAIT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.mood === 'string' && typeof p.startedAt === 'number' && typeof p.dueAt === 'number') {
      return { mood: p.mood as PendingEmotionWait['mood'], startedAt: p.startedAt, dueAt: p.dueAt };
    }
    return null;
  } catch {
    // safe to ignore: 坏记录当无 (等待是 best-effort 本地状态)
    return null;
  }
}

function writeWait(record: PendingEmotionWait | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (record) {
      window.localStorage.setItem(WAIT_STORAGE_KEY, JSON.stringify(record));
    } else {
      window.localStorage.removeItem(WAIT_STORAGE_KEY);
    }
  } catch {
    // safe to ignore: 持久化失败只影响到期追问
  }
}

/** 选「先等 10 分钟」时写入 one-shot 等待记录 (新等待覆盖旧) */
export function saveEmotionWait(mood: EmotionMood, now: number = Date.now()): PendingEmotionWait {
  const record: PendingEmotionWait = { mood, startedAt: now, dueAt: now + EMOTION_WAIT_DURATION_MS };
  writeWait(record);
  return record;
}

/** 进行中/已到期等待记录 (无记录 → null); 超过 24h 的僵尸在派生前被 prune 清掉 */
export function getEmotionWait(): PendingEmotionWait | null {
  return readWait();
}

/** 到期待追问记录 (未到期 / 无记录 → null) */
export function getDueEmotionWait(now: number = Date.now()): PendingEmotionWait | null {
  const pending = readWait();
  if (!pending) return null;
  return pending.dueAt <= now ? pending : null;
}

/** 等待已消解 (卡内追问二选一 / 用户取消 / 追问条二选一后调用) */
export function resolveEmotionWait(): void {
  writeWait(null);
}

/** 过期清理: 等待超 24h 仍未消解 → 静默丢弃 (不做跨设备同步, 也不留僵尸) */
export function pruneStaleEmotionWait(now: number = Date.now()): void {
  const pending = readWait();
  if (pending && now - pending.dueAt > STALE_WAIT_MS) {
    writeWait(null);
  }
}

function readAuditIds(today: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(AUDITS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return new Set();
    const p = parsed as { date?: unknown; ids?: unknown };
    if (p.date !== today || !Array.isArray(p.ids)) return new Set();
    return new Set(p.ids.filter((id): id is string => typeof id === 'string'));
  } catch {
    // safe to ignore: 幂等记录损坏 → 当没写过, 服务端 dedup 兜底
    return new Set();
  }
}

function writeAuditIds(today: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUDITS_STORAGE_KEY, JSON.stringify({ date: today, ids: [...ids] }));
  } catch {
    // safe to ignore: 持久化失败只影响本地幂等, 服务端按 trigger_id 去重
  }
}

/** 今日该 mood 是否已写过审计 (同 mood 同日只写一次的本地防线) */
export function hasEmotionGuardAudit(mood: EmotionMood, now: Date = new Date()): boolean {
  const today = emotionGuardLocalDateKey(now);
  return readAuditIds(today).has(emotionGuardTriggerId(mood, today));
}

/**
 * 写一次情绪守护审计 (免费安抚 / 等待放下各一次; 花钱安慰分支永不调用本函数)。
 * triggerId = emotion-guard:YYYY-MM-DD:mood — 本地去重 + 服务端 RPC 23505 双保险。
 * metadata 红线: 只有 source/mood/choice, 零金额零物品名。上报失败回滚本地记录
 * (下次可重试), 静默不弹错。
 */
export function reportEmotionGuardEvent(mood: EmotionMood, choice: EmotionGuardChoice, now: Date = new Date()): void {
  const today = emotionGuardLocalDateKey(now);
  const triggerId = emotionGuardTriggerId(mood, today);
  const ids = readAuditIds(today);
  if (ids.has(triggerId)) return;
  ids.add(triggerId);
  writeAuditIds(today, ids);
  const description = choice === 'free_care'
    ? `Emotion guard: free comfort (${mood})`
    : `Emotion guard: waited it out, let it go (${mood})`;
  apiFetch('/api/buddy/health-events', {
    method: 'POST',
    body: {
      eventType: 'manual_adjustment',
      triggerSource: 'manual',
      triggerId,
      description,
      metadata: { source: 'emotion_guard', mood, choice },
    },
  }).catch((err: unknown) => {
    // safe to ignore: 审计失败只影响统计计数, 不弹错不阻塞; 回滚让下次可重试
    logger.warn('[emotion-guard-store] audit report failed (will retry next time):', err instanceof Error ? err.message : String(err));
    const rollback = readAuditIds(emotionGuardLocalDateKey());
    rollback.delete(triggerId);
    writeAuditIds(emotionGuardLocalDateKey(), rollback);
  });
}

/** 测试用: 清空本地状态 */
export function _resetEmotionGuardStoreForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WAIT_STORAGE_KEY);
    window.localStorage.removeItem(AUDITS_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
