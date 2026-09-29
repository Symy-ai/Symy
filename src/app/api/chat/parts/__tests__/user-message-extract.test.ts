/**
 * user-message-extract — 刀19 相位级单测
 *
 * 纯函数相位，零 mock。断言边界: 空 body (无 user 消息且末条 assistant 空) → 400、
 * 空白 content → 400、仅 assistant 消息时回退末条 (现状锁定)、多轮取最后一条 user。
 * (JSON body 解析/校验在 parts/chat-validation.ts，其边界由 chat-validation.test.ts 承担)
 */
import { describe, expect, it } from 'vitest';

import { extractUserMessage } from '../user-message-extract';

describe('user-message-extract', () => {
  it('取最后一条 user 消息', () => {
    const result = extractUserMessage([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'second' },
    ]);
    expect(result).toEqual({ ok: true, userContent: 'second' });
  });

  it('无 user 消息时回退到末条消息 (现状锁定)', () => {
    const result = extractUserMessage([
      { role: 'assistant', content: 'earlier' },
      { role: 'assistant', content: 'last' },
    ]);
    expect(result).toEqual({ ok: true, userContent: 'last' });
  });

  it('空消息数组 → 400 Message content cannot be empty', async () => {
    const result = extractUserMessage([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: 'Message content cannot be empty' });
    }
  });

  it('末条消息为空字符串 → 400', async () => {
    const result = extractUserMessage([{ role: 'user', content: '' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toEqual({ error: 'Message content cannot be empty' });
    }
  });

  it('末条消息为纯空白 (trim 后为空) → 400', () => {
    const result = extractUserMessage([{ role: 'user', content: '   \n\t ' }]);
    expect(result.ok).toBe(false);
  });

  it('末条 user 消息纯空白 → 400（空白串是 truthy，|| 回退不触发 — 现状锁定）', () => {
    // '  ' 非空字符串为 truthy → userContent='  ' → trim 后空 → 400，
    // 不会回退到末条 assistant 消息（原 route.ts 同语义，机械搬移后锁定）
    const result = extractUserMessage([
      { role: 'user', content: '  ' },
      { role: 'assistant', content: 'real answer' },
    ]);
    expect(result.ok).toBe(false);
  });
});
