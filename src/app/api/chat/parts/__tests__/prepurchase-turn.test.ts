/**
 * prepurchase-turn 测试 — 买前三问 canned 轮 (batch50-a)
 *
 * 覆盖: 意图命中产出 (迎接回复 + 卡 payload), 未命中 null, SSE 流事件顺序
 * (prepurchase_card 最前 → token → done), 双语取词。
 */

import { describe, expect, it } from 'vitest';
import { buildPrepurchaseTurn, buildPrepurchaseSseStream, prepurchaseSseEvent } from '../prepurchase-turn';

const FIXED_RNG = () => 0; // 恒取第 0 个变体, 断言确定性

describe('buildPrepurchaseTurn (三问轮)', () => {
  it('命中: 返回迎接回复 + 决策卡 payload', () => {
    const turn = buildPrepurchaseTurn({ userContent: '我该买这双鞋吗', locale: 'zh', rng: FIXED_RNG });
    expect(turn).not.toBeNull();
    expect(turn!.prepurchaseCard).toEqual({ subject: null });
    expect(turn!.reply.length).toBeGreaterThan(0);
    expect(turn!.reply).toContain('本象');
  });

  it('en 命中取英文话术', () => {
    const turn = buildPrepurchaseTurn({ userContent: 'Should I buy this?', locale: 'en', rng: FIXED_RNG });
    expect(turn!.reply).toMatch(/elephant|together/i);
  });

  it('未命中 (普通咨询 / 反驳): null', () => {
    expect(buildPrepurchaseTurn({ userContent: '帮我找个包', locale: 'zh', rng: FIXED_RNG })).toBeNull();
    expect(buildPrepurchaseTurn({ userContent: '我就要买', locale: 'zh', rng: FIXED_RNG })).toBeNull();
  });
});

describe('prepurchaseSseEvent / buildPrepurchaseSseStream', () => {
  it('SSE 事件形状: type=prepurchase_card + 卡 payload', () => {
    expect(prepurchaseSseEvent({ subject: null })).toEqual({
      type: 'prepurchase_card',
      prepurchaseCard: { subject: null },
    });
  });

  it('canned 流: prepurchase_card 事件最前, token 分块, done 收尾', async () => {
    const turn = buildPrepurchaseTurn({ userContent: '值得买吗', locale: 'zh', rng: FIXED_RNG })!;
    const stream = buildPrepurchaseSseStream(turn);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.slice(6)));
    expect(events[0].type).toBe('prepurchase_card');
    expect(events[0].prepurchaseCard).toEqual({ subject: null });
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.map((e) => e.content).join('')).toBe(turn.reply);
  });
});
