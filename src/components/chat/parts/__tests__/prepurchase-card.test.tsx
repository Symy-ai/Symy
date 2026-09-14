// @vitest-environment happy-dom

/**
 * PrepurchaseCard 测试 — 买前三问决策卡 (batch50-a)
 *
 * 覆盖: 三问逐条流转 (答一条给一句回应), 三选项事件写入 (manual_adjustment,
 * metadata 带 source=prepurchase), 冷静 24h 写待回访记录, 周累计金额展示,
 * 「买吧」祝福语气 (非羞辱红线), buy 分支零金额上报。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PrepurchaseCard } from '../prepurchase-card';
import { _resetPrepurchaseStoreForTest, getDuePrepurchase, getWeeklyGuardedAmount } from '../prepurchase-store';
import { setGuardIntensity, _resetGuardIntensityStateForTest } from '@/hooks/use-guard-intensity';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      ({
        'chat.prepurchase.title': 'Three questions before buying',
        'chat.prepurchase.q1': 'Q1 real need?',
        'chat.prepurchase.q2': 'Q2 have an alternative?',
        'chat.prepurchase.q3': 'Q3 willing to wait?',
        'chat.prepurchase.inputPlaceholder': 'Write your answer…',
        'chat.prepurchase.answerButton': 'Answer',
        'chat.prepurchase.ack1.balanced': 'ack-1-balanced',
        'chat.prepurchase.ack2.balanced': 'ack-2-balanced',
        'chat.prepurchase.ack3.balanced': 'ack-3-balanced',
        'chat.prepurchase.decideTitle': 'Three choices — your call',
        'chat.prepurchase.amountLabel': 'Price (optional)',
        'chat.prepurchase.optionBuy': 'Buy it',
        'chat.prepurchase.optionAlt': 'I have an alternative',
        'chat.prepurchase.optionCooldown': 'Cool off 24 hours',
        'chat.prepurchase.noteBuy': 'Then buy it and enjoy it! 🐘',
        'chat.prepurchase.noteAlt': 'Smartest pick 🌱',
        'chat.prepurchase.noteCooldown': `Cool off — tomorrow at ${vars?.time ?? ''} I'll ask 🐘`,
        'chat.prepurchase.weeklySaved': `This week kept ${vars?.amount ?? ''} with you`,
      })[key] || key,
  }),
}));

function answerAll(container: { queryByTestId: (id: string) => HTMLElement | null }) {
  for (let i = 1; i <= 3; i++) {
    fireEvent.change(screen.getByTestId('prepurchase-input'), { target: { value: `a${i}` } });
    fireEvent.click(screen.getByTestId('prepurchase-submit'));
  }
  expect(container.queryByTestId('prepurchase-q1')).toBeNull();
}

describe('PrepurchaseCard (买前三问决策卡)', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    setGuardIntensity('balanced');
    _resetPrepurchaseStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
    _resetPrepurchaseStoreForTest();
  });

  it('三问逐条流转: 每答一条给一句简短回应 (按守护强度档位)', () => {
    const { container } = render(<PrepurchaseCard data={{ subject: null }} />);
    expect(screen.getByTestId('prepurchase-q1').textContent).toContain('Q1 real need?');

    fireEvent.change(screen.getByTestId('prepurchase-input'), { target: { value: '真的需要' } });
    fireEvent.click(screen.getByTestId('prepurchase-submit'));
    expect(screen.getByTestId('prepurchase-ack-1').textContent).toContain('ack-1-balanced');
    expect(screen.getByTestId('prepurchase-q2').textContent).toContain('Q2 have an alternative?');

    fireEvent.change(screen.getByTestId('prepurchase-input'), { target: { value: '没有' } });
    fireEvent.click(screen.getByTestId('prepurchase-submit'));
    expect(screen.getByTestId('prepurchase-ack-2').textContent).toContain('ack-2-balanced');

    fireEvent.change(screen.getByTestId('prepurchase-input'), { target: { value: '一天' } });
    fireEvent.click(screen.getByTestId('prepurchase-submit'));
    expect(screen.getByTestId('prepurchase-ack-3').textContent).toContain('ack-3-balanced');
    expect(container.textContent).toContain('Three choices — your call');
  });

  it('「家里有替代」+ 价格: 写 manual_adjustment 事件 (metadata 带金额) + 周累计立即可见', () => {
    const { container } = render(<PrepurchaseCard data={{ subject: null }} />);
    answerAll({ queryByTestId: (id) => container.querySelector(`[data-testid="${id}"]`) });

    fireEvent.change(screen.getByTestId('prepurchase-amount'), { target: { value: '59.9' } });
    fireEvent.click(screen.getByTestId('prepurchase-alt'));

    expect(screen.getByTestId('prepurchase-decision-note').textContent).toContain('Smartest pick');
    expect(getWeeklyGuardedAmount()).toBeCloseTo(59.9);
    expect(container.textContent).toContain('59.90');

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.body.eventType).toBe('manual_adjustment');
    expect(opts.body.metadata).toEqual({ source: 'prepurchase', decision: 'have_alt', guarded_amount: 59.9 });
  });

  it('「买吧」: 祝福语气 + 事件写入不含金额 (buy 恒不计入周累计)', () => {
    const { container } = render(<PrepurchaseCard data={{ subject: null }} />);
    answerAll({ queryByTestId: (id) => container.querySelector(`[data-testid="${id}"]`) });

    fireEvent.change(screen.getByTestId('prepurchase-amount'), { target: { value: '120' } });
    fireEvent.click(screen.getByTestId('prepurchase-buy'));

    expect(screen.getByTestId('prepurchase-decision-note').textContent).toContain('enjoy it');
    expect(getWeeklyGuardedAmount()).toBe(0);
    expect(container.querySelector('[data-testid="prepurchase-weekly"]')).toBeNull();

    const [, opts] = apiFetchMock.mock.calls[0];
    expect(opts.body.metadata).toEqual({ source: 'prepurchase', decision: 'buy' });
  });

  it('「冷静 24h」: 写待回访记录 (24h 后到期) + 事件写入', () => {
    render(<PrepurchaseCard data={{ subject: null }} />);
    answerAll({ queryByTestId: (id) => document.querySelector(`[data-testid="${id}"]`) });

    fireEvent.change(screen.getByTestId('prepurchase-amount'), { target: { value: '88' } });
    fireEvent.click(screen.getByTestId('prepurchase-cooldown'));

    expect(screen.getByTestId('prepurchase-decision-note').textContent).toMatch(/tomorrow at \d{1,2}:\d{2}/);
    expect(getDuePrepurchase(Date.now())).toBeNull();
    const due = getDuePrepurchase(Date.now() + 25 * 60 * 60 * 1000);
    expect(due).toEqual(expect.objectContaining({ subject: null, amount: 88 }));
    // 冷静未改判前不计入周累计
    expect(getWeeklyGuardedAmount()).toBe(0);
    expect(apiFetchMock.mock.calls[0][1].body.metadata).toEqual({
      source: 'prepurchase', decision: 'cooldown_24h', guarded_amount: 88,
    });
  });

  it('确认后防连点: 不重复写记录/上报', () => {
    render(<PrepurchaseCard data={{ subject: null }} />);
    answerAll({ queryByTestId: (id) => document.querySelector(`[data-testid="${id}"]`) });
    const buy = screen.getByTestId('prepurchase-buy');
    fireEvent.click(buy);
    expect(screen.queryByTestId('prepurchase-buy')).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
