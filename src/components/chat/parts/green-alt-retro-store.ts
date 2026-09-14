'use client';

/**
 * green-alt-retro-store — 绿色采纳后复盘的客户端会话态 (batch68-a)
 *
 * sessionStorage 三槽一次性状态, 发消息时读后即清 (与 dismissedContextSignals
 * 同款上行模式):
 *   - pending  : 采纳成功后挂起 → 下一次发送随 body.greenAltRetroPending 上行,
 *                服务端判定让位 gate 后决定是否追问; 无论是否触发, 客户端读后
 *                即清 — 每条采纳只追问一次, 不顺延。
 *   - awaiting : 追问事件到达后挂起 → 下一次发送随 body.greenAltRetroAnswer
 *                (自由文本路径) 上行; 消费即清除 — 用户不理会即温和结束,
 *                绝不重复追问。
 *   - draft    : 复盘卡选项点击后暂存 → 同一次发送随 body.greenAltRetroAnswer
 *                (含 optionId) 上行; 优先级高于 awaiting。
 * 另记会话内 outcomes (answered/dismissed), 复盘卡重挂载时回放终态。
 * sessionStorage 不可用 (SSR/隐私模式) 时全部静默降级为 no-op。
 */

import { isGreenAltRetroOptionId, type GreenAltRetroOptionId } from '@/lib/green-alt-retro';

const PENDING_KEY = 'symy-green-alt-retro-pending';
const AWAITING_KEY = 'symy-green-alt-retro-awaiting';
const DRAFT_KEY = 'symy-green-alt-retro-answer-draft';
const OUTCOME_KEY = 'symy-green-alt-retro-outcomes';

export type GreenAltRetroOutcome = 'answered' | 'dismissed';

/** 发送时随 body 上行的复盘会话态 (chat-validation zod 同形状) */
export interface GreenAltRetroRequestState {
  pending?: { entryId: string };
  answer?: { entryId: string; optionId?: GreenAltRetroOptionId };
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // safe to ignore: sessionStorage 不可用/脏数据 → 视为无状态
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // safe to ignore: 隐私模式下持久化失败, 只影响本会话追问体验
  }
}

function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // safe to ignore: sessionStorage 不可用
  }
}

/** 采纳成功后挂起追问 (同一采纳由 adoption 去重保证只挂一次) */
export function setPendingGreenAltRetro(entryId: string): void {
  writeJson(PENDING_KEY, { entryId });
}

/** 追问卡已发出 (green_alt_retro 事件到达) → 下一条自由文本视为回答尝试 */
export function markGreenAltRetroAwaited(entryId: string): void {
  writeJson(AWAITING_KEY, { entryId });
}

/** 复盘卡选项点击 → 暂存结构化回答, 与消息文本同轮上行 */
export function stageGreenAltRetroOptionDraft(entryId: string, optionId: GreenAltRetroOptionId): void {
  writeJson(DRAFT_KEY, { entryId, optionId });
}

export function getGreenAltRetroOutcome(entryId: string): GreenAltRetroOutcome | null {
  const outcomes = readJson<Record<string, GreenAltRetroOutcome>>(OUTCOME_KEY);
  return outcomes?.[entryId] ?? null;
}

export function markGreenAltRetroAnswered(entryId: string): void {
  const outcomes = readJson<Record<string, GreenAltRetroOutcome>>(OUTCOME_KEY) ?? {};
  outcomes[entryId] = 'answered';
  writeJson(OUTCOME_KEY, outcomes);
}

/** 卡上「先不聊这个」: 清 awaiting + 记终态 — 不再追问, 不把下一条消息当回答 */
export function markGreenAltRetroDismissed(entryId: string): void {
  removeKey(AWAITING_KEY);
  const outcomes = readJson<Record<string, GreenAltRetroOutcome>>(OUTCOME_KEY) ?? {};
  outcomes[entryId] = 'dismissed';
  writeJson(OUTCOME_KEY, outcomes);
}

/**
 * 发送时一次性消费会话态 (读后即清)。回答优先于追问 — 若本轮在回答上一条
 * 追问, pending 留到下一次发送 (顺序追问不丢)。
 */
export function consumeGreenAltRetroForRequest(): GreenAltRetroRequestState | undefined {
  const draft = readJson<{ entryId?: string; optionId?: string }>(DRAFT_KEY);
  if (draft && typeof draft.entryId === 'string' && isGreenAltRetroOptionId(draft.optionId)) {
    removeKey(DRAFT_KEY);
    removeKey(AWAITING_KEY);
    return { answer: { entryId: draft.entryId, optionId: draft.optionId } };
  }
  removeKey(DRAFT_KEY);

  const awaiting = readJson<{ entryId?: string }>(AWAITING_KEY);
  if (awaiting && typeof awaiting.entryId === 'string') {
    removeKey(AWAITING_KEY);
    return { answer: { entryId: awaiting.entryId } };
  }

  const pending = readJson<{ entryId?: string }>(PENDING_KEY);
  if (pending && typeof pending.entryId === 'string') {
    removeKey(PENDING_KEY);
    return { pending: { entryId: pending.entryId } };
  }
  return undefined;
}

/** 测试用: 清空全部复盘会话态 */
export function _resetGreenAltRetroForTest(): void {
  removeKey(PENDING_KEY);
  removeKey(AWAITING_KEY);
  removeKey(DRAFT_KEY);
  removeKey(OUTCOME_KEY);
}
