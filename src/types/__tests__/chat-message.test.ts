/**
 * ChatMessage 类型契约测试 — canonical 类型定义 (177行)
 *
 * 锁定:
 * - 三 role 联合 (user/assistant/action — P1-2 fix)
 * - actionType 三值联合 (saw_it/chose_to_buy/challenge_created)
 * - 会话内卡片字段可选性 (productCards/greenAlt/reuseHint 等)
 * - mode 两值 + isError/onRetry 错误通道
 */

import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../chat-message';

const base = {
  id: 'm1',
  content: 'hello',
  timestamp: new Date('2026-10-10'),
};

describe('ChatMessage 类型契约', () => {
  it('三 role: user/assistant/action (P1-2 fix)', () => {
    const user: ChatMessage = { ...base, role: 'user' };
    const assistant: ChatMessage = { ...base, role: 'assistant' };
    const action: ChatMessage = { ...base, role: 'action' };
    expect(user.role).toBe('user');
    expect(assistant.role).toBe('assistant');
    expect(action.role).toBe('action');
  });

  it('actionType 三值: saw_it/chose_to_buy/challenge_created', () => {
    const m: ChatMessage = { ...base, role: 'action', actionType: 'saw_it' };
    expect(m.actionType).toBe('saw_it');
    const m2: ChatMessage = { ...base, role: 'action', actionType: 'chose_to_buy' };
    expect(m2.actionType).toBe('chose_to_buy');
    const m3: ChatMessage = { ...base, role: 'action', actionType: 'challenge_created' };
    expect(m3.actionType).toBe('challenge_created');
  });

  it('mode 两值: normal/challenge', () => {
    const m: ChatMessage = { ...base, role: 'user', mode: 'challenge' };
    expect(m.mode).toBe('challenge');
  });

  it('错误通道: isError+onRetry', () => {
    const m: ChatMessage = { ...base, role: 'assistant', isError: true, onRetry: () => 'retried' };
    expect(m.isError).toBe(true);
    expect(m.onRetry?.()).toBe('retried');
  });

  it('会话内卡片字段全部可选 (缺省不炸)', () => {
    const m: ChatMessage = { ...base, role: 'assistant' };
    expect(m.productCards).toBeUndefined();
    expect(m.greenAlt).toBeUndefined();
    expect(m.reuseHint).toBeUndefined();
    expect(m.productCardsQuery).toBeUndefined();
    expect(m.reasoning).toBeUndefined();
  });

  it('productCards 数组形状', () => {
    const m: ChatMessage = { ...base, role: 'assistant', productCards: [] };
    expect(Array.isArray(m.productCards)).toBe(true);
  });
});
