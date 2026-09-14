// @vitest-environment happy-dom

/**
 * GuardConsistencyCard 渲染测试 (batch63-b)
 *
 * 覆盖 AC5 三态 (no-data / insufficient / normal) + 金额行只在 app 内 +
 * 分享面零金额 + 低稳定域非羞辱措辞 (无失败/失控类词)。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GuardConsistencyCard } from '../guard-consistency-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/lib/format', () => ({
  formatCurrencyShort: (n: number) => `$${Math.round(n)}`,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations: Record<string, string> = {
      'profile.guardMatrix.title': 'Guard Consistency',
      'profile.guardMatrix.desc': 'Where you turn guarding into action',
      'profile.guardMatrix.empty': 'No guard records yet',
      'profile.guardMatrix.insufficient': 'Still few records',
      'profile.guardMatrix.headline': '{domains} domains · {days} days',
      'profile.guardMatrix.rowActions': '{guarded} held · {alt} alt · {reuse} reuse',
      'profile.guardMatrix.rowReleased': '{released} released',
      'profile.guardMatrix.rowStability': '{percent}% steady',
      'profile.guardMatrix.rowFew': 'Still counting',
      'profile.guardMatrix.steadiestLine': 'Your steadiest domain: {category}',
      'profile.guardMatrix.needsCareLine': '{category} is still a tug-of-war — worth a little company',
      'profile.guardMatrix.suggestLine': 'Next small step in {category}',
      'profile.guardMatrix.unclassifiedLine': '{count} more unmapped',
      'profile.guardMatrix.amountLine': '≈{amount} saved so far (visible only to you)',
      'profile.guardMatrix.shareBtn': 'Share',
      'profile.guardMatrix.shareClose': 'Close',
      'profile.guardMatrix.titleSteadiest': 'Steadiest domain',
      'profile.guardMatrix.titleNeedsCare': 'Worth company',
      'profile.guardMatrix.share.pill': 'Guard Consistency',
      'profile.guardMatrix.share.actionsLabel': 'actions',
      'profile.guardMatrix.share.daysLabel': 'days on',
      'profile.guardMatrix.cat.electronics': 'Electronics',
      'profile.guardMatrix.cat.food': 'Food',
      'profile.guardMatrix.cat.clothing': 'Clothing',
      'share.interceptMedal.brandTagline': 'brand',
    };
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale: 'en',
    };
  },
}));

interface Ev {
  eventType: string;
  triggerId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

let seq = 0;
function ev(eventType: string, metadata: Record<string, unknown> | null, day = 1): Ev {
  seq += 1;
  return {
    eventType,
    triggerId: `${eventType}:${seq}`,
    metadata,
    createdAt: new Date(2026, 8, day, 10).toISOString(),
  };
}

/** apiFetch 按 event_type 参数分桶返回 */
function mockEvents(events: Ev[]) {
  vi.mocked(apiFetch).mockImplementation((url: string | URL) => {
    const u = new URL(String(url), 'http://localhost');
    const type = u.searchParams.get('event_type') || '';
    return Promise.resolve({ events: events.filter((e) => e.eventType === type) });
  });
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GuardConsistencyCard — 三态', () => {
  it('loading 时渲染骨架', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<GuardConsistencyCard />);
    expect(screen.getByTestId('guard-consistency-card-skeleton')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it('no-data: 无任何三轨记录 → 引导态', async () => {
    mockEvents([]);
    render(<GuardConsistencyCard />);
    await waitFor(() => expect(screen.getByTestId('guard-consistency-card-empty')).toBeTruthy());
    expect(screen.getByText('No guard records yet')).toBeTruthy();
  });

  it('insufficient: 记录少达不到域样本阈值 → 不出矩阵结论', async () => {
    mockEvents([
      ev('challenge_completed', { category: 'food' }, 1),
      ev('challenge_failed', { category: 'food' }, 2),
    ]);
    render(<GuardConsistencyCard />);
    await waitFor(() => expect(screen.getByTestId('guard-consistency-card-insufficient')).toBeTruthy());
    expect(screen.queryByTestId('guard-consistency-card-rows')).toBeNull();
  });

  it('normal: 矩阵行/稳定度/称号/私享金额行齐全, 拉取失败降级 no-data', async () => {
    mockEvents([
      // electronics: 3 守 0 放 → 最稳域
      ev('challenge_completed', { category: 'electronics', savedAmount: 40 }, 1),
      ev('challenge_completed', { category: 'electronics', savedAmount: 20 }, 2),
      ev('challenge_completed', { category: 'electronics' }, 3),
      // food: 1 守 1 放 1 替代 → 值得陪伴
      ev('challenge_completed', { category: 'food', savedAmount: 10 }, 4),
      ev('challenge_failed', { category: 'food' }, 5),
      ev('mindful_recovery', { kind: 'green_alt_adoption', entryId: 'milk_tea', estSaved: 2.5 }, 6),
    ]);
    render(<GuardConsistencyCard />);
    await waitFor(() => expect(screen.getByTestId('guard-consistency-card')).toBeTruthy());

    expect(screen.getByTestId('guard-consistency-row-electronics')).toBeTruthy();
    expect(screen.getByTestId('guard-consistency-row-food')).toBeTruthy();
    expect(screen.getByTestId('guard-consistency-card-steadiest').textContent).toContain('Electronics');
    expect(screen.getByTestId('guard-consistency-card-needs-care').textContent).toContain('Food');
    expect(screen.getByTestId('guard-consistency-card-suggest')).toBeTruthy();
    // 私享金额行 = savedAmount(40+20+10) + estSaved(2.5), 仅 app 内
    expect(screen.getByTestId('guard-consistency-card-amount').textContent).toContain('$73');

    // 分享面: 面子字段 only — 分享面节点内零金额 (卡内私享金额行不受影响)
    fireEvent.click(screen.getByTestId('guard-consistency-share-btn'));
    await waitFor(() => expect(screen.getByTestId('guard-consistency-share-modal')).toBeTruthy());
    const face = screen.getByTestId('guard-consistency-share-face');
    expect(face).toBeTruthy();
    expect(face.textContent).not.toContain('$');
    expect(face.textContent).not.toMatch(/saved|amount/i);
  });

  it('fetch 失败静默降级 no-data, 不抛错', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network') as never);
    render(<GuardConsistencyCard />);
    await waitFor(() => expect(screen.getByTestId('guard-consistency-card-empty')).toBeTruthy());
  });
});
