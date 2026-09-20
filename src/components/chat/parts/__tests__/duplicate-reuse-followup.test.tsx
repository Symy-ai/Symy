// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DuplicateReuseFollowup } from '../duplicate-reuse-followup';
import { getDueReuseConfirmation, savePendingReuseConfirmation } from '../duplicate-purchase-store';

const PENDING_KEY = 'symy-duplicate-precheck-reuse-pending';
const DAY_MS = 24 * 60 * 60 * 1000;

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => ({
      'chat.duplicatePrecheck.genericItem': 'that item',
      'chat.duplicatePrecheck.followupQuestion': `Did you skip ${vars?.item ?? ''}?`,
      'chat.duplicatePrecheck.followupAvoidedButton': 'avoided',
      'chat.duplicatePrecheck.followupBoughtButton': 'bought',
      'chat.duplicatePrecheck.followupAvoided': 'avoided note',
      'chat.duplicatePrecheck.followupBought': 'bought note',
    })[key] || key,
  }),
}));

describe('DuplicateReuseFollowup', () => {
  beforeEach(() => { window.localStorage.clear(); apiFetchMock.mockReset(); apiFetchMock.mockResolvedValue(undefined); });
  afterEach(cleanup);

  it.each([true, false])('writes one conclusion without amounts (avoided=%s)', (avoided) => {
    render(<DuplicateReuseFollowup card={{ itemTitle: 'cable', category: 'electronics' }} decisionId="decision-id" />);
    fireEvent.click(screen.getByTestId(avoided ? 'duplicate-reuse-avoided' : 'duplicate-reuse-bought'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = apiFetchMock.mock.calls[0][1].body;
    expect(body.triggerId).toBe('decision-id:conclusion');
    expect(body.metadata).toEqual({ source: 'duplicate_precheck', decision: 'reuse', followUpAvoidedPurchase: avoided });
    expect(JSON.stringify(body)).not.toMatch(/amount|price|saved/i);
    expect(screen.getByTestId('duplicate-reuse-followup-answered').textContent).toContain(avoided ? 'avoided' : 'bought');
  });

  it('keeps the pending follow-up when conclusion reporting fails with 500', async () => {
    savePendingReuseConfirmation({ itemTitle: 'cable', category: 'electronics' });
    const pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '{}') as { decisionId?: string; dueAt?: number };
    const duePending = JSON.stringify({ ...pending, dueAt: Date.now() - 1 });
    window.localStorage.setItem(PENDING_KEY, duePending);
    apiFetchMock.mockRejectedValueOnce(new Error('500'));

    render(<DuplicateReuseFollowup card={{ itemTitle: 'cable', category: 'electronics' }} decisionId={String(pending.decisionId)} />);
    fireEvent.click(screen.getByTestId('duplicate-reuse-avoided'));
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    const restored = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '{}') as { decisionId?: string };
    expect(restored.decisionId).toBe(pending.decisionId);
    expect(getDueReuseConfirmation()?.decisionId).toBe(pending.decisionId);
  });

  it('clears the pending follow-up and closes the loop after a successful retry', async () => {
    savePendingReuseConfirmation({ itemTitle: 'cable', category: 'electronics' });
    const pending = JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? '{}') as { decisionId?: string };
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, dueAt: Date.now() - 1 }));
    apiFetchMock.mockRejectedValueOnce(new Error('500'));

    const failedAttempt = render(<DuplicateReuseFollowup card={{ itemTitle: 'cable', category: 'electronics' }} decisionId={String(pending.decisionId)} />);
    fireEvent.click(failedAttempt.getByTestId('duplicate-reuse-avoided'));
    await vi.waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).not.toBeNull());
    failedAttempt.unmount();

    render(<DuplicateReuseFollowup card={{ itemTitle: 'cable', category: 'electronics' }} decisionId={String(pending.decisionId)} />);
    fireEvent.click(screen.getByTestId('duplicate-reuse-bought'));
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));

    expect(apiFetchMock.mock.calls[1][1].body.triggerId).toBe(`${pending.decisionId}:conclusion`);
    expect(apiFetchMock.mock.calls[1][1].body.metadata.followUpAvoidedPurchase).toBe(false);
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(getDueReuseConfirmation(Date.now() + DAY_MS + 60_000)).toBeNull();
    expect(screen.getByTestId('duplicate-reuse-followup-answered').textContent).toContain('bought');
  });
});
