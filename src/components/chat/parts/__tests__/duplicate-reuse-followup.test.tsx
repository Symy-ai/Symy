// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DuplicateReuseFollowup } from '../duplicate-reuse-followup';

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
});
