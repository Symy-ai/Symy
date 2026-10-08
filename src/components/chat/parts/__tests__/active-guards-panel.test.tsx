// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ActiveGuardsPanel } from '../active-guards-panel';
import { aggregateActiveGuards, type ActiveGuardsEventInput } from '@/lib/active-guards';
import type { GuardMoment } from '@/lib/guard-moments';
import zh from '../../../../i18n/messages/zh.json';

const apiFetchMock = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const raw = key
        .split('.')
        .reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), zh);
      let result = typeof raw === 'string' ? raw : key;
      for (const [name, value] of Object.entries(vars ?? {})) result = result.replaceAll(`{${name}}`, value);
      return result;
    },
    locale: 'zh',
  }),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/hooks/use-guard-intensity', () => ({
  useGuardIntensity: () => ({ guardIntensity: 'balanced', setGuardIntensity: vi.fn() }),
}));

const NOW = new Date(2026, 8, 9, 12);
const LATEST_WIN: GuardMoment = {
  id: 'win-1',
  track: 'guard',
  date: new Date(2026, 8, 7, 10),
  estSaved: 120,
};

function summary() {
  const events: ActiveGuardsEventInput[] = [
    {
      eventType: 'manual_adjustment',
      triggerId: null,
      metadata: {
        source: 'green_commitment',
        category: 'food',
        subject: '外卖',
        start_key: '2026-09-01',
        end_key: '2026-09-30',
      },
      createdAt: new Date(2026, 8, 1, 9).toISOString(),
    },
    {
      eventType: 'challenge_completed',
      triggerId: 'trigger-1',
      metadata: { category: 'food', savedAmount: 35 },
      createdAt: new Date(2026, 8, 5, 20).toISOString(),
    },
  ];
  return aggregateActiveGuards({
    now: NOW,
    challenge: { id: 'challenge-1', itemName: '耳机', amount: 299, createdAt: new Date(2026, 8, 9, 6).toISOString() },
    events,
    cooldown: { subject: '跑鞋', askedAt: NOW.getTime() - 6 * 3600000, dueAt: NOW.getTime() + 18 * 3600000, amount: 400 },
  });
}

beforeEach(() => {
  apiFetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('ActiveGuardsPanel', () => {
  it('renders challenge, commitment, and cooldown sections with private amounts', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={LATEST_WIN} onClose={vi.fn()} />);

    expect(screen.getAllByTestId('active-guards-challenge')).toHaveLength(1);
    expect(screen.getAllByTestId('active-guards-commitment')).toHaveLength(1);
    expect(screen.getAllByTestId('active-guards-cooldown')).toHaveLength(1);
    const amounts = screen.getAllByTestId('active-guards-item-saved').map((node) => node.textContent).join('|');
    expect(amounts).toContain('¥299');
    expect(amounts).toContain('¥35');
    expect(amounts).toContain('¥400');
    expect(screen.getByTestId('active-guards-identity').textContent).toContain('3');
  });

  it('renders each SOS entry inline with its active guard', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={null} onClose={vi.fn()} />);
    expect(screen.getAllByTestId('active-guards-sos-btn')).toHaveLength(3);
    expect(within(screen.getByTestId('active-guards-challenge')).queryByTestId('active-guards-sos-btn')).not.toBeNull();
    expect(within(screen.getByTestId('active-guards-commitment')).queryByTestId('active-guards-sos-btn')).not.toBeNull();
    expect(within(screen.getByTestId('active-guards-cooldown')).queryByTestId('active-guards-sos-btn')).not.toBeNull();
  });

  it('collapses SOS after closing the opened response', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByTestId('active-guards-sos-btn')[0]);
    expect(screen.getByTestId('active-guards-sos-lead')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('active-guards-sos')).getByRole('button', { name: '关闭' }));
    expect(screen.queryByTestId('active-guards-sos')).toBeNull();
  });

  it('reports a cooldown SOS with the active item reference', async () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={null} onClose={vi.fn()} />);
    fireEvent.click(within(screen.getByTestId('active-guards-cooldown')).getByTestId('active-guards-sos-btn'));
    fireEvent.click(screen.getByTestId('active-guards-sos-release'));
    expect(await screen.findByTestId('active-guards-sos-done')).toBeTruthy();
    expect(vi.mocked(apiFetchMock)).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(apiFetchMock).mock.calls[0] as unknown as [
      string,
      { method: string; body: { metadata: Record<string, string> } },
    ];
    expect(url).toBe('/api/buddy/health-events');
    expect(options.method).toBe('POST');
    expect(options.body.metadata).toMatchObject({ source: 'guard_sos', ref_kind: 'cooldown' });
  });

  it('opens and closes the share sheet without leaking private amounts', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={LATEST_WIN} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('active-guards-share-btn'));
    const face = screen.getByTestId('active-guards-share-face');
    expect(face.textContent).toContain('3');
    expect(face.textContent).not.toMatch(/¥\d|\$\d/);
    fireEvent.click(within(face).getByRole('button', { name: '关闭' }));
    expect(screen.queryByTestId('active-guards-share-modal')).toBeNull();
  });

  it('closes the share sheet through the backdrop', () => {
    render(<ActiveGuardsPanel summary={summary()} latestWin={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('active-guards-share-btn'));
    fireEvent.click(screen.getByTestId('active-guards-share-modal'));
    expect(screen.queryByTestId('active-guards-share-modal')).toBeNull();
  });

  it('renders empty state without guard list or share entry', () => {
    const empty = aggregateActiveGuards({ now: NOW, challenge: null, events: [], cooldown: null });
    render(<ActiveGuardsPanel summary={empty} latestWin={null} onClose={vi.fn()} />);
    expect(screen.getByTestId('active-guards-empty').textContent).toContain('没有进行中的守护');
    expect(screen.queryByTestId('active-guards-list')).toBeNull();
    expect(screen.queryByTestId('active-guards-share-btn')).toBeNull();
    expect(screen.queryByTestId('active-guards-latest-win')).toBeNull();
  });
});
