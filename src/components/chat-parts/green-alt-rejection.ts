'use client';

/**
 * green-alt-rejection — 绿色替代拒绝反馈上报 (batch62-b, 客户端薄封装)
 *
 * 走既有 POST /api/buddy/health-events (manual_adjustment 纯审计通道, 零
 * vitality/token 副作用), 载荷与幂等判定复用纯函数 recordGreenAltRejection:
 * 冷却窗内同 entry 同 reason 不重复上报; 跨冷却窗可再次上报刷新偏好。
 * 本地日志只记 (entryId, reason, at) 三元组 — 无金额无内容, 上报失败静默降级
 * (与 green-alt-adoption 同款, 不弹错不阻塞 chat)。
 */

import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import {
  recordGreenAltRejection,
  type GreenAltRejectionEventInput,
  type GreenAltRejectionOutcome,
  type GreenAltRejectionReason,
} from '@/lib/green-alt-preference';

const REJECTION_STORAGE_KEY = 'symy-green-alt-rejection-log';
/** 本地日志容量上限 (FIFO) — 只服务冷却窗幂等, 4 个原因最长窗 14 天足够 */
const REJECTION_LOG_LIMIT = 50;

interface LocalRejectionEntry {
  entryId: string;
  reason: GreenAltRejectionReason;
  /** 上报时间戳 (ms) */
  at: number;
}

function readLog(): LocalRejectionEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(REJECTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is LocalRejectionEntry =>
        !!v && typeof v === 'object' &&
        typeof (v as LocalRejectionEntry).entryId === 'string' &&
        typeof (v as LocalRejectionEntry).at === 'number' &&
        typeof (v as LocalRejectionEntry).reason === 'string',
    );
  } catch {
    // safe to ignore: localStorage 不可用时幂等降级为仅会话内 (组件 state 兜底)
    return [];
  }
}

function persistLog(entries: LocalRejectionEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REJECTION_STORAGE_KEY, JSON.stringify(entries.slice(-REJECTION_LOG_LIMIT)));
  } catch {
    // safe to ignore: 隐私模式下持久化失败, 只影响跨会话幂等
  }
}

/** 该 entry 最近一次拒绝的原因 (任意原因; 无 → null), 供卡片初始渲染已确认态。
 *  本地日志按追加序排列, 同毫秒 tie 时后写入者 (更新偏好) 赢。 */
export function latestGreenAltRejectionReason(entryId: string): GreenAltRejectionReason | null {
  let latest: LocalRejectionEntry | null = null;
  for (const e of readLog()) {
    if (e.entryId === entryId && (!latest || e.at >= latest.at)) latest = e;
  }
  return latest?.reason ?? null;
}

/**
 * 上报一次拒绝反馈。冷却窗内同 entry 同 reason → duplicate (不发请求)。
 * 网络/登录失败: console warn 后 UI 照常进已确认态 (非关键路径, 不阻塞 chat)。
 */
export async function reportGreenAltRejection(
  entryId: string,
  reason: GreenAltRejectionReason,
): Promise<GreenAltRejectionOutcome> {
  const localEvents: GreenAltRejectionEventInput[] = readLog().map((e) => ({
    metadata: { source: 'green_alt_rejection', entryId: e.entryId, reason: e.reason },
    createdAt: new Date(e.at).toISOString(),
  }));
  const outcome = recordGreenAltRejection(entryId, reason, localEvents, new Date());
  if (outcome.status !== 'recorded' || !outcome.payload) return outcome;

  const log = readLog();
  log.push({ entryId, reason, at: Date.now() });
  persistLog(log);

  try {
    await apiFetch('/api/buddy/health-events', {
      method: 'POST',
      body: outcome.payload,
    });
  } catch (err) {
    // safe to ignore: 拒绝反馈是非关键路径, 不弹错不阻塞 chat;
    // 本地已记账, 冷却窗内不会因失败而重复骚扰上报
    logger.warn('[green-alt-rejection] report failed (silently skipped):', err instanceof Error ? err.message : String(err));
  }
  return outcome;
}

/** 测试用: 清空本地拒绝日志 */
export function _resetGreenAltRejectionForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REJECTION_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}

/** 测试用: 伪造一条本地拒绝记录 (回放/过期场景) */
export function _seedGreenAltRejectionForTest(entryId: string, reason: GreenAltRejectionReason, at: number): void {
  if (typeof window === 'undefined') return;
  const log = readLog();
  log.push({ entryId, reason, at });
  persistLog(log);
}
