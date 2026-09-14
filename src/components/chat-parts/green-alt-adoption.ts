'use client';

/**
 * green-alt-adoption — 绿色替代采纳上报 (客户端薄封装)
 *
 * 职责单一: 同一卡片 id 只上报一次 (localStorage 记已上报 id 集合),
 * 上报失败静默降级 (console warn 级, 不弹错不阻塞 chat)。
 * 未登录/demo 模式由 API 层 401 兜底 — 这里同样静默。
 */

import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
// 🌱 batch68-a: 采纳成功后挂起复盘追问 (会话态一次性, 下一轮自然对话中追问一次)
import { setPendingGreenAltRetro } from '@/components/chat/parts/green-alt-retro-store';

const ADOPTED_STORAGE_KEY = 'symy-green-alt-adopted-ids';

function readAdoptedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ADOPTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    // safe to ignore: localStorage 不可用时去重降级为仅会话内 (组件 state 兜底)
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

/** 该卡片 id 是否已上报过 (初始渲染态用) */
export function isGreenAltAdoptionReported(entryId: string): boolean {
  return readAdoptedIds().has(entryId);
}

/**
 * 上报一次采纳。重复 id 直接返回 false (不发请求)。
 * 网络失败/未登录: console warn 后返回 true-ish 语义不阻塞 UI —
 * 返回 'reported' 表示 UI 应进入已确认态 (本地已记账, 失败不再重试)。
 */
export async function reportGreenAltAdoption(
  entryId: string,
  estSaved?: number,
): Promise<{ status: 'duplicate' | 'reported' }> {
  const ids = readAdoptedIds();
  if (ids.has(entryId)) return { status: 'duplicate' };
  ids.add(entryId);
  persistAdoptedIds(ids);
  // 🌱 batch68-a: 新采纳 → 挂起复盘追问 (发送时一次性上行; 无论上报 API 成败,
  // 用户的采纳动作本身已发生, 追问资格以本地记账为准)
  setPendingGreenAltRetro(entryId);

  try {
    await apiFetch('/api/green-alt/adoption', {
      method: 'POST',
      body: { entryId, estSaved },
    });
  } catch (err) {
    // safe to ignore: 采纳确认是非关键路径, 不弹错不阻塞 chat;
    // 本地已记账, 用户不会被同一卡片反复打扰
    logger.warn('[green-alt-adoption] report failed (silently skipped):', err instanceof Error ? err.message : String(err));
  }
  return { status: 'reported' };
}

/** 测试用: 清空本地已上报集合 */
export function _resetGreenAltAdoptionForTest(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ADOPTED_STORAGE_KEY);
  } catch {
    // safe to ignore: 测试环境 localStorage 不可用
  }
}
