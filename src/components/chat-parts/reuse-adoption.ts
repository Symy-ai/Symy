'use client';

/**
 * reuse-adoption — 复用采纳上报 (客户端薄封装, batch56-c)
 *
 * 与 green-alt-adoption 同一款式: 同一类目同会话只上报一次 (localStorage 记
 * 已上报 id), 上报失败静默降级, 未登录/demo 由 API 401 兜底。
 * 给守护风格画像的"复用轨"提供真实采纳数据。
 */

import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

const ADOPTED_STORAGE_KEY = 'symy-reuse-adopted-ids';

function readAdoptedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ADOPTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    // safe to ignore: localStorage 不可用时去重降级为仅会话内
    return new Set();
  }
}

function persistAdoptedIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADOPTED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // safe to ignore: 隐私模式下持久化失败, 只影响跨会话去重
  }
}

/** 该类目是否已上报过 (初始渲染态用) */
export function isReuseAdoptionReported(categoryId: string): boolean {
  return readAdoptedIds().has(categoryId);
}

/**
 * 上报一次复用采纳。重复类目直接 duplicate (不发请求); 网络失败静默 —
 * 本地已记账, UI 照样进入已确认态, 不阻塞 chat。
 */
export async function reportReuseAdoption(
  categoryId: string,
  estSaved?: number,
): Promise<{ status: 'duplicate' | 'reported' }> {
  const ids = readAdoptedIds();
  if (ids.has(categoryId)) return { status: 'duplicate' };
  ids.add(categoryId);
  persistAdoptedIds(ids);

  try {
    await apiFetch('/api/reuse/adoption', {
      method: 'POST',
      body: { categoryId, estSaved },
    });
  } catch (err) {
    // safe to ignore: 采纳确认是非关键路径, 不弹错不阻塞 chat
    logger.warn('[reuse-adoption] report failed (silently skipped):', err instanceof Error ? err.message : String(err));
  }
  return { status: 'reported' };
}

/** 测试用: 清空本地已上报集合 */
export function _resetReuseAdoptionForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ADOPTED_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
