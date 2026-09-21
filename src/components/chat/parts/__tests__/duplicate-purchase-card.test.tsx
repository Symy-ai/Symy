// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DuplicatePrecheckCard } from '../duplicate-purchase-card';
import { getDueReuseConfirmation } from '../duplicate-purchase-store';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => ({
      'chat.duplicatePrecheck.genericItem': 'that item',
      'chat.duplicatePrecheck.title': 'Precheck',
      'chat.duplicatePrecheck.pause': `Pause ${vars?.item ?? ''}`,
      'chat.duplicatePrecheck.places.home': 'places',
      'chat.duplicatePrecheck.reuseButton': 'Use it',
      'chat.duplicatePrecheck.waitButton': 'Wait',
      'chat.duplicatePrecheck.reuseNote': 'reuse note',
      'chat.duplicatePrecheck.waitNote': 'wait note',
    })[key] || key,
  }),
}));

describe('DuplicatePrecheckCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it('reuse writes event with source and same-day idempotent trigger id', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'storage box', category: 'home' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));
    // batch81-c: reuse = 确认「家里有」→ 健康事件上报 + 物品清单落库, 恰两次
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.eventType).toBe('manual_adjustment');
    expect(body.metadata).toEqual({ source: 'duplicate_precheck', item: 'storage box', category: 'home', decision: 'reuse' });
    expect(body.triggerId).toMatch(/^duplicate-precheck:\d{4}-\d{2}-\d{2}:storage-box:reuse$/);
    expect(JSON.stringify(body)).not.toMatch(/amount|price|saved/i);
    expect(getDueReuseConfirmation(Date.now() + 25 * 60 * 60 * 1000)?.card.itemTitle).toBe('storage box');
    // 第二次调用 = 物品清单建库 (source: 'chat')
    expect(apiFetchMock.mock.calls[1][0]).toBe('/api/inventory');
    expect(apiFetchMock.mock.calls[1][1]).toEqual({ method: 'POST', body: { item_name: 'storage box', category: 'home', source: 'chat' } });
  });

  it('reuse on unextracted item ("it") reports decision but skips inventory write', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'it', category: 'other' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/buddy/health-events');
  });

  it('wait records decision without follow-up and repeated clicks stay idempotent', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'soy sauce', category: 'food' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-wait'));
    // wait = 未确认「家里有」→ 只上报决策, 不落物品清单
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][1].body.metadata.decision).toBe('wait');
    expect(getDueReuseConfirmation(Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
  });

  it('marks an already-reported decision after refresh without reporting again', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'storage box', category: 'home' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));
    apiFetchMock.mockClear();
    cleanup();

    render(<DuplicatePrecheckCard data={{ itemTitle: 'storage box', category: 'home' }} />);

    expect(screen.getByTestId('duplicate-precheck-decision').textContent).toContain('reuse note');
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(getDueReuseConfirmation(Date.now() + 25 * 60 * 60 * 1000)?.card.itemTitle).toBe('storage box');
  });

  it('keeps new decision ids interactive', () => {
    window.localStorage.setItem('symy-duplicate-precheck-decisions', JSON.stringify({
      'duplicate-precheck:2000-01-01:storage-box:reuse': 'reuse',
    }));

    render(<DuplicatePrecheckCard data={{ itemTitle: 'storage box', category: 'home' }} />);

    expect(screen.getByTestId('duplicate-precheck-reuse')).toBeTruthy();
    expect(screen.getByTestId('duplicate-precheck-wait')).toBeTruthy();
  });

  it('keeps the primary decision flow when decision logging fails', () => {
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });

    render(<DuplicatePrecheckCard data={{ itemTitle: 'cable', category: 'electronics' }} />);
    getItem.mockRestore();
    fireEvent.click(screen.getByTestId('duplicate-precheck-reuse'));

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(getDueReuseConfirmation(Date.now() + 25 * 60 * 60 * 1000)?.card.itemTitle).toBe('cable');
  });
});
