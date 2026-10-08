// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  _resetGreenAltRetroForTest,
  consumeGreenAltRetroForRequest,
  getGreenAltRetroOutcome,
  markGreenAltRetroAnswered,
  markGreenAltRetroAwaited,
  markGreenAltRetroDismissed,
  setPendingGreenAltRetro,
  stageGreenAltRetroOptionDraft,
} from '../green-alt-retro-store';

/**
 * green-alt-retro-store.ts (132行) — 绿色采纳复盘三槽 sessionStorage (batch68-a)。
 *
 * 锁定:
 * - 三槽独立挂起 + 读后即清
 * - 消费优先级: draft > awaiting > pending
 * - 回答时 pending 留存 (顺序追问不丢)
 * - outcomes 终态回放 (answered/dismissed)
 * - dismissed 清 awaiting 不吞下一条消息
 * - 脏数据静默降级
 */
describe('green-alt-retro-store', () => {
  beforeEach(() => _resetGreenAltRetroForTest());

  it('pending: 挂起→消费即清; 无状态 → undefined', () => {
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
    setPendingGreenAltRetro('e1');
    expect(consumeGreenAltRetroForRequest()).toEqual({ pending: { entryId: 'e1' } });
    expect(consumeGreenAltRetroForRequest()).toBeUndefined(); // 读后即清
  });

  it('awaiting: 优先于 pending; awaiting 清后 pending 仍在 (读后即清按槽)', () => {
    setPendingGreenAltRetro('e1');
    markGreenAltRetroAwaited('e1');
    expect(consumeGreenAltRetroForRequest()).toEqual({ answer: { entryId: 'e1' } }); // answer 无 optionId
    expect(consumeGreenAltRetroForRequest()).toEqual({ pending: { entryId: 'e1' } }); // pending 另一槽
    expect(consumeGreenAltRetroForRequest()).toBeUndefined(); // 全清
  });

  it('draft: 最高优先 (optionId 结构化), 同时清 awaiting', () => {
    markGreenAltRetroAwaited('e1');
    stageGreenAltRetroOptionDraft('e1', 'already_have' as never);
    expect(consumeGreenAltRetroForRequest()).toEqual({ answer: { entryId: 'e1', optionId: 'already_have' } });
  });

  it('回答 awaiting 时 pending 留存 (顺序追问不丢)', () => {
    // 单槽覆盖语义: 新采纳覆盖旧 pending
    setPendingGreenAltRetro('e1');
    markGreenAltRetroAwaited('e1');
    consumeGreenAltRetroForRequest(); // 消费 awaiting (e1)
    setPendingGreenAltRetro('e2'); // 覆盖槽位
    markGreenAltRetroAwaited('e2');
    expect(consumeGreenAltRetroForRequest()).toEqual({ answer: { entryId: 'e2' } }); // awaiting 优先
    expect(consumeGreenAltRetroForRequest()).toEqual({ pending: { entryId: 'e2' } }); // pending 槽保留 (顺序不丢)
  });

  it('非法 optionId draft → 跳过 draft 走 awaiting/pending', () => {
    sessionStorage.setItem('symy-green-alt-retro-answer-draft', JSON.stringify({ entryId: 'e1', optionId: 'bogus' }));
    setPendingGreenAltRetro('e1');
    expect(consumeGreenAltRetroForRequest()).toEqual({ pending: { entryId: 'e1' } });
  });

  it('outcomes: answered/dismissed 回放 + dismissed 清 awaiting', () => {
    expect(getGreenAltRetroOutcome('e1')).toBeNull();
    markGreenAltRetroAnswered('e1');
    expect(getGreenAltRetroOutcome('e1')).toBe('answered');
    markGreenAltRetroDismissed('e2');
    expect(getGreenAltRetroOutcome('e2')).toBe('dismissed');
    expect(getGreenAltRetroOutcome('e1')).toBe('answered'); // 多条共存
    // dismissed 清 awaiting — 不吞下一条消息
    markGreenAltRetroAwaited('e3');
    markGreenAltRetroDismissed('e3');
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
  });

  it('脏 JSON → 静默 no-op', () => {
    sessionStorage.setItem('symy-green-alt-retro-pending', '{broken');
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
    expect(getGreenAltRetroOutcome('e1')).toBeNull();
  });
});
