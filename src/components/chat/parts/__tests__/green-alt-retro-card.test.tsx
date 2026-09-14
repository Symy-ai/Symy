// @vitest-environment happy-dom
/**
 * GreenAltRetroCard + green-alt-retro-store 测试 (batch68-a)
 *
 * 覆盖: 4 个非羞辱选项渲染 (i18n 文案, 零金额); 选项点击 → 本地已记录态 +
 * 会话态草稿 + 以选项文案发送一条普通聊天消息; 终态回放 (重挂载不再弹选项);
 * 「先不聊这个」→ 卡片消失 + awaiting 清空 (下一条消息不被当回答);
 * store 一次性消费语义 (pending 读后即清 / draft 优先于 awaiting)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GreenAltRetroCard } from '../green-alt-retro-card';
import {
  _resetGreenAltRetroForTest,
  consumeGreenAltRetroForRequest,
  markGreenAltRetroAwaited,
  setPendingGreenAltRetro,
  stageGreenAltRetroOptionDraft,
} from '../green-alt-retro-store';
import type { GreenAltRetroCardData } from '@/types/green-alt-retro';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'chat.greenAltRetro.askTitle': 'Why did this one work?',
        'chat.greenAltRetro.freeTextHint': 'Tap one, or just type it out',
        'chat.greenAltRetro.dismiss': 'Maybe later',
        'chat.greenAltRetro.answeredNote': 'Noted — thanks for sharing',
        'chat.greenAltRetro.option.already_have': 'Already have one',
        'chat.greenAltRetro.option.rent_borrow': 'Renting is easier',
        'chat.greenAltRetro.option.try_once': 'Just trying it once',
        'chat.greenAltRetro.option.reduce_idle': 'Want less idle stuff',
      })[key] || key,
  }),
}));

const CARD: GreenAltRetroCardData = {
  entryId: 'milk_tea',
  options: ['already_have', 'rent_borrow', 'try_once', 'reduce_idle'],
};

describe('GreenAltRetroCard', () => {
  beforeEach(() => {
    _resetGreenAltRetroForTest();
  });
  afterEach(cleanup);

  it('渲染 4 个非羞辱选项 + 自由文本提示 + 温和出口; 面上零金额', () => {
    render(<GreenAltRetroCard data={CARD} onSendMessage={vi.fn()} />);
    expect(screen.getByTestId('green-alt-retro-option-already_have').textContent).toBe('Already have one');
    expect(screen.getByTestId('green-alt-retro-option-rent_borrow')).toBeTruthy();
    expect(screen.getByTestId('green-alt-retro-option-try_once')).toBeTruthy();
    expect(screen.getByTestId('green-alt-retro-option-reduce_idle')).toBeTruthy();
    expect(screen.getByTestId('green-alt-retro-dismiss').textContent).toBe('Maybe later');
    expect(screen.getByTestId('green-alt-retro-card').textContent).not.toMatch(/\$|¥|price|cost/i);
  });

  it('点选项 → 以选项文案发送消息 + 草稿带 optionId 上行 + 卡进已记录态', () => {
    const onSendMessage = vi.fn();
    markGreenAltRetroAwaited('milk_tea');
    render(<GreenAltRetroCard data={CARD} onSendMessage={onSendMessage} />);
    fireEvent.click(screen.getByTestId('green-alt-retro-option-already_have'));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('Already have one');
    // 草稿被暂存, 消费时以结构化 optionId 形态出现 (awaiting 同时被清)
    expect(consumeGreenAltRetroForRequest()).toEqual({ answer: { entryId: 'milk_tea', optionId: 'already_have' } });
    expect(screen.getByTestId('green-alt-retro-answered-note').textContent).toContain('Noted');
  });

  it('重挂载回放已记录态, 不再弹选项', () => {
    stageGreenAltRetroOptionDraft('milk_tea', 'try_once');
    consumeGreenAltRetroForRequest();
    const { container } = render(<GreenAltRetroCard data={CARD} />);
    fireEvent.click(screen.getByTestId('green-alt-retro-option-try_once'));
    cleanup();
    const remounted = render(<GreenAltRetroCard data={CARD} />);
    expect(remounted.container.querySelector('[data-testid^="green-alt-retro-option-"]')).toBeNull();
    expect(screen.getByTestId('green-alt-retro-answered-note')).toBeTruthy();
    void container;
  });

  it('「先不聊这个」→ 卡片消失 + awaiting 清空 (拒绝回答不重复追问, 下条消息不被当回答)', () => {
    const onSendMessage = vi.fn();
    markGreenAltRetroAwaited('milk_tea');
    const { container } = render(<GreenAltRetroCard data={CARD} onSendMessage={onSendMessage} />);
    fireEvent.click(screen.getByTestId('green-alt-retro-dismiss'));
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="green-alt-retro-card"]')).toBeNull();
    // awaiting 已清 → 下一次发送不带 answer (普通链路接管, 不误判为回答)
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
  });
});

describe('green-alt-retro-store — 一次性消费语义', () => {
  beforeEach(() => {
    _resetGreenAltRetroForTest();
  });

  it('pending 读后即清 — 同一采纳只追问一次', () => {
    setPendingGreenAltRetro('milk_tea');
    expect(consumeGreenAltRetroForRequest()).toEqual({ pending: { entryId: 'milk_tea' } });
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
  });

  it('awaiting → 自由文本回答形态 (只带 entryId)', () => {
    markGreenAltRetroAwaited('milk_tea');
    expect(consumeGreenAltRetroForRequest()).toEqual({ answer: { entryId: 'milk_tea' } });
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
  });

  it('回答优先于追问 — 回答本轮上行, pending 留到下一次', () => {
    setPendingGreenAltRetro('takeaway_cup');
    markGreenAltRetroAwaited('milk_tea');
    expect(consumeGreenAltRetroForRequest()).toEqual({ answer: { entryId: 'milk_tea' } });
    expect(consumeGreenAltRetroForRequest()).toEqual({ pending: { entryId: 'takeaway_cup' } });
  });

  it('非法草稿被忽略 (防御脏 sessionStorage)', () => {
    window.sessionStorage.setItem('symy-green-alt-retro-answer-draft', JSON.stringify({ entryId: 'milk_tea', optionId: 'hacked' }));
    expect(consumeGreenAltRetroForRequest()).toBeUndefined();
  });
});
