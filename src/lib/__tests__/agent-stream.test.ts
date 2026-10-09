import { describe, expect, it } from 'vitest';

import {
  feedChannel,
  newChannels,
  stripLeakedReasoning,
  visibleMessage,
  type AgentStreamEvent,
} from '../agent-stream';

/**
 * agent-stream.ts (76行) — Anthropic commerce-agents 流分离 TS 移植 (P0 泄漏架构修复)。
 *
 * 锁定:
 * - 七事件类型路由: text_delta→text 通道 / reasoning_delta→reasoning 通道 / 其余五类零入
 * - visibleMessage = 仅 text 通道拼接 (reasoning 永不进消息体 — P0 红线)
 * - stripLeakedReasoning 泄漏守卫三条件门 (≥3 行/≥80% ASCII/≥60% 推理形) + 末段答案提取
 * - CJK 消息直通 (非英文推理形)
 */
describe('feedChannel 事件路由', () => {
  it('text/reasoning 分通道; 其余五类零入', () => {
    const ch = newChannels();
    const events: AgentStreamEvent[] = [
      { type: 'text_delta', data: { text: '你好' } },
      { type: 'reasoning_delta', data: { text: '思考中' } },
      { type: 'status', data: { label: '调用工具' } },
      { type: 'tool_call', data: { tool: 't', id: '1', arguments: {} } },
      { type: 'tool_result', data: { tool: 't', id: '1', summary: 'ok', isError: false } },
      { type: 'progress', data: { message: 'ing' } },
      { type: 'turn_complete', data: {} },
    ];
    for (const ev of events) feedChannel(ch, ev);
    expect(ch.text).toEqual(['你好']);
    expect(ch.reasoning).toEqual(['思考中']);
  });

  it('空 text_delta 不入通道', () => {
    const ch = newChannels();
    feedChannel(ch, { type: 'text_delta', data: { text: '' } });
    expect(ch.text).toEqual([]);
  });

  it('visibleMessage = text 通道拼接 (reasoning 永不进 — P0 红线)', () => {
    const ch = newChannels();
    feedChannel(ch, { type: 'text_delta', data: { text: 'A' } });
    feedChannel(ch, { type: 'reasoning_delta', data: { text: 'SECRET-推理' } });
    feedChannel(ch, { type: 'text_delta', data: { text: 'B' } });
    expect(visibleMessage(ch)).toBe('AB');
  });
});

describe('stripLeakedReasoning 泄漏守卫', () => {
  const leaked = [
    'The user says they want a keyboard.',
    'I should respond in Chinese.',
    "I'll suggest the mechanical one.",
    '好的, 推荐机械键盘, 三百元内性价比最高。',
  ].join('\n');

  it('英文推理形泄漏 → 提取末段干净答案', () => {
    expect(stripLeakedReasoning(leaked)).toBe('好的, 推荐机械键盘, 三百元内性价比最高。');
  });

  it('CJK 为主 → 直通 (不误伤中文回复)', () => {
    const cjk = '这是正常中文回复。\n第二行也是中文。\n第三行还是中文。';
    expect(stripLeakedReasoning(cjk)).toBe(cjk);
  });

  it('行数 <3 → 直通', () => {
    expect(stripLeakedReasoning('The user says x.\nI should y.')).toBe('The user says x.\nI should y.');
  });

  it('全推理形无干净段 → 原样返回 (host 须有东西可显)', () => {
    const allReasoning = 'The user says a.\nI should b.\nLet me c.';
    expect(stripLeakedReasoning(allReasoning)).toBe(allReasoning);
  });
});
