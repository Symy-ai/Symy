// @vitest-environment happy-dom

/**
 * PrepurchaseFollowup 测试 — 买前三问「冷静 24h」次日回访条 (batch50-a)
 *
 * 覆盖: 回访问题渲染, 「不想要了」写 manual_adjustment 事件 + 改判金额计入周累计,
 * 「还想要」祝福分支零上报, 二选一后消解 (onResolved + 记录清除)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PrepurchaseFollowup } from '../prepurchase-followup';
import {
  _resetPrepurchaseStoreForTest,
  getDuePrepurchase,
  getWeeklyGuardedAmount,
  savePendingPrepurchase,
} from '../prepurchase-store';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      ({
        'chat.prepurchase.itemGeneric': 'that thing you wanted',
        'chat.prepurchase.followupQuestion': `That ${vars?.item ?? ''} from yesterday's questions — still want it?`,
        'chat.prepurchase.followupStillWant': 'Still want it',
        'chat.prepurchase.followupLetGo': 'Let it go',
        'chat.prepurchase.followupBlessing': 'Enjoy it! 🐘',
        'chat.prepurchase.followupSuccessNote': 'Guard success 🌱',
      })[key] || key,
  }),
}));

describe('PrepurchaseFollowup (三问次日回访条)', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    _resetPrepurchaseStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetPrepurchaseStoreForTest();
  });

  it('渲染回访问题 (主题回显, 无主题用通用文案)', () => {
    render(<PrepurchaseFollowup record={{ subject: null, askedAt: 1, dueAt: 2, amount: 42 }} />);
    expect(screen.getByTestId('prepurchase-followup').textContent).toContain('that thing you wanted');
    expect(screen.getByTestId('prepurchase-followup').textContent).toContain("yesterday's questions");
  });

  it('「不想要了」: 写 manual_adjustment 事件 (metadata 带 prepurchase_success + 金额) + 金额计入周累计 + 记录消解', () => {
    savePendingPrepurchase({ subject: '耳机', askedAt: 1, dueAt: 2, amount: 128 });
    const onResolved = vi.fn();
    render(<PrepurchaseFollowup record={{ subject: '耳机', askedAt: 1, dueAt: 2, amount: 128 }} onResolved={onResolved} />);

    fireEvent.click(screen.getByTestId('prepurchase-followup-passed'));

    expect(screen.getByTestId('prepurchase-followup-answered').textContent).toContain('Guard success');
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(getDuePrepurchase(Date.now() + 48 * 60 * 60 * 1000)).toBeNull(); // 记录已消解
    expect(getWeeklyGuardedAmount()).toBe(128); // 改判放弃 → 金额此时才计入

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.body.eventType).toBe('manual_adjustment');
    expect(opts.body.metadata).toEqual({
      source: 'prepurchase_followup', prepurchase_success: true, guarded_amount: 128,
    });
  });

  it('「还想要」: 祝福分支零上报, 金额不计入周累计, 记录同样消解', () => {
    render(<PrepurchaseFollowup record={{ subject: null, askedAt: 1, dueAt: 2, amount: 66 }} />);

    fireEvent.click(screen.getByTestId('prepurchase-followup-want'));

    expect(screen.getByTestId('prepurchase-followup-answered').textContent).toContain('Enjoy it');
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(getWeeklyGuardedAmount()).toBe(0);
    expect(getDuePrepurchase(Date.now() + 48 * 60 * 60 * 1000)).toBeNull();
  });
});
