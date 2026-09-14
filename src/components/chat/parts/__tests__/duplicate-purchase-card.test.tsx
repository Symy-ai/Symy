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
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.eventType).toBe('manual_adjustment');
    expect(body.metadata).toEqual({ source: 'duplicate_precheck', item: 'storage box', category: 'home', decision: 'reuse' });
    expect(body.triggerId).toMatch(/^duplicate-precheck:\d{4}-\d{2}-\d{2}:storage-box:reuse$/);
    expect(JSON.stringify(body)).not.toMatch(/amount|price|saved/i);
    expect(getDueReuseConfirmation(Date.now() + 25 * 60 * 60 * 1000)?.card.itemTitle).toBe('storage box');
  });

  it('wait records decision without follow-up and repeated clicks stay idempotent', () => {
    render(<DuplicatePrecheckCard data={{ itemTitle: 'soy sauce', category: 'food' }} />);
    fireEvent.click(screen.getByTestId('duplicate-precheck-wait'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][1].body.metadata.decision).toBe('wait');
    expect(getDueReuseConfirmation(Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
  });
});
