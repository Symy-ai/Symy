/**
 * Intercept Medal 事件总线 — 聊天工具流 → Buddy 页通知区域
 *
 * 派发时机 ("没买"判定):
 * - complete_challenge status='passed' (savedAmount > 0, 非 failed, 非重复结算)
 * - record_impulse = 用户买了 (impulse_damage), 不是拦截 — 不派发勋章
 *
 * 消费方: BuddyTab 监听 INTERCEPT_MEDAL_EVENT, 在通知区域显示「晒出这枚勋章」入口。
 * detail.reason 为可选拦截理由; 事件源未填充时展示层按 itemTitle 本地分类兜底。
 * 既有模式: window CustomEvent ('symy:challenge-completed' / 'symy:open-challenge-modal' 同款)。
 */

import type { InterceptMedalData } from '@/types/intercept-medal';

export const INTERCEPT_MEDAL_EVENT = 'symy:intercept-medal';

/**
 * 同一枚勋章 60s 内去重 — 同一次拦截可能触发多次派发:
 * SSE 流路径 (tool_result) 与 "I'll pass" 按钮直连完成路径, 以及 AI 冗余重调 complete_challenge。
 */
const DEDUPE_WINDOW_MS = 60_000;
let lastDispatchKey = '';
let lastDispatchAt = 0;

export function dispatchInterceptMedal(data: InterceptMedalData): void {
  if (typeof window === 'undefined') return;
  if (!data || !Number.isFinite(data.savedCents) || data.savedCents <= 0) return;
  const key = `${data.itemTitle}:${data.savedCents}`;
  const now = Date.now();
  if (key === lastDispatchKey && now - lastDispatchAt < DEDUPE_WINDOW_MS) return;
  lastDispatchKey = key;
  lastDispatchAt = now;
  window.dispatchEvent(new CustomEvent<InterceptMedalData>(INTERCEPT_MEDAL_EVENT, { detail: data }));
}

/** 测试辅助 — 重置去重窗口 */
export function resetInterceptMedalDedupe(): void {
  lastDispatchKey = '';
  lastDispatchAt = 0;
}
