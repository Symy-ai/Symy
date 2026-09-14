/**
 * compare-turn 测试 (batch56-a)
 *
 * 覆盖验收:
 * 1. 命中: canned 迎接回复 + 对比裁决卡 (两侧对象词 + green-alt 词条命中只读引用)
 * 2. 未命中 (反驳/已买/无关还是) → null, 不产卡
 * 3. SSE 流: compare_card 事件在前, token 分块 + done 收尾
 */

import { describe, expect, it } from 'vitest';
import { buildCompareTurn, buildCompareSseStream, compareSseEvent } from '../compare-turn';

describe('buildCompareTurn', () => {
  it('单侧命中 green-alt 词条时只读引用 (iPad→secondhand_audio_tablet; kindle 无据)', () => {
    const turn = buildCompareTurn({ userContent: '买 iPad 还是 kindle？', locale: 'zh', rng: () => 0 });
    expect(turn).not.toBeNull();
    expect(turn!.compareCard.sideA).toBe('ipad');
    expect(turn!.compareCard.sideB).toBe('kindle');
    expect(turn!.compareCard.matchA?.id).toBe('secondhand_audio_tablet');
    expect(turn!.compareCard.matchB).toBeNull();
    expect(typeof turn!.reply).toBe('string');
    expect(turn!.reply.length).toBeGreaterThan(0);
  });

  it('双侧都无据时 matchA/matchB 均 null (卡面走中性引导)', () => {
    const turn = buildCompareTurn({ userContent: 'refurbished vs new', locale: 'en', rng: () => 0 });
    expect(turn).not.toBeNull();
    // "refurbished"/"new" 不含词条 trigger — 零编造
    expect(turn!.compareCard.matchA).toBeNull();
    expect(turn!.compareCard.matchB).toBeNull();
  });

  it('更强意图/不误伤句式 → null', () => {
    expect(buildCompareTurn({ userContent: '我就要买iPad还是安卓平板', locale: 'zh' })).toBeNull();
    expect(buildCompareTurn({ userContent: '我还是算了', locale: 'zh' })).toBeNull();
    expect(buildCompareTurn({ userContent: '今天天气不错', locale: 'zh' })).toBeNull();
  });
});

describe('compare SSE', () => {
  it('compareSseEvent 形状', () => {
    expect(compareSseEvent({ sideA: 'A', sideB: 'B', matchA: null, matchB: null })).toEqual({
      type: 'compare_card',
      compareCard: { sideA: 'A', sideB: 'B', matchA: null, matchB: null },
    });
  });

  it('canned 流先发卡事件再发 token + done', async () => {
    const turn = buildCompareTurn({ userContent: '买iPad还是安卓平板', locale: 'zh', rng: () => 0 })!;
    const stream = buildCompareSseStream(turn);
    const text = await new Response(stream).text();
    const events = text.trim().split('\n\n').map((line) => JSON.parse(line.replace(/^data: /, '')));
    expect(events[0].type).toBe('compare_card');
    expect(events[0].compareCard.sideA).toBe('ipad');
    const tokenTypes = events.slice(1, -1).map((e: { type: string }) => e.type);
    expect(tokenTypes.every((t: string) => t === 'token')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');
  });
});
