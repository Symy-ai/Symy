/**
 * Component tests for GuardTotalsCard (绿色守护战绩总览卡, batch5-c)
 *
 * 测试矩阵:
 *   - longestKnownStreak 纯函数: 当前 streak / 勋章里程碑下界 (streak_7→7,
 *     streak_guardian_30→30) / 有拦截无 streak 时下界 1 / 只保守不夸大
 *   - isGuardTotalsEmpty 纯函数: 全零判定
 *   - 有数据时字段齐全: 累计拦截 / 连续守护 / 最长连续 / 勋章 n/总数 /
 *     小象阶段 / 里子金额行 + 口袋文案 / 晒入口
 *   - 空态: 全零数据不出 0/0/0 空表, 出「第一次守护会在这里开始」正面引导,
 *     无晒入口 (荣誉非羞耻)
 *   - 低数据态: streak 为 0 时守护格出重新起数陪伴文案, 不出现孤零零的 0
 *   - 分享入口传参: 唯一金额是 medal.savedCents (share-modal 既有机制渲染前
 *     换算成自由小时), 不出现任何其他金额字段 (totalSaved/moneyLeft/amount);
 *     面子字段 streakDays + interceptCount 齐全, initialTemplate = streak
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuardTotalsCard, longestKnownStreak, isGuardTotalsEmpty } from '../guard-totals-card';
import { ALL_BADGES } from '@/components/buddy/constants';

const shareSpy = vi.fn();

vi.mock('@/components/share/share-modal', () => ({
  ShareModal: (props: Record<string, unknown>) => {
    shareSpy(props);
    if (!(props as { open?: boolean }).open) return null;
    return <div data-testid="share-modal-stub" />;
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'profile.guardTotals.title': 'Guardian record',
        'profile.guardTotals.subtitle': 'Since day one',
        'profile.guardTotals.interceptsTotal': 'Total intercepts',
        'profile.guardTotals.streakDays': 'Guard streak',
        'profile.guardTotals.streakFresh': 'Your next guard starts a fresh count',
        'profile.guardTotals.longestStreak': 'Longest streak',
        'profile.guardTotals.badges': 'Green badges',
        'profile.guardTotals.stageLabel': "Symy's stage",
        'profile.guardTotals.moneyLine': 'Every guard has left you {amount}',
        'profile.guardTotals.moneyNote': 'The money stays in your pocket — it is never sent anywhere.',
        'profile.guardTotals.shareBtn': 'Share',
        'profile.guardTotals.emptyTitle': 'Your first guard will begin here',
        'profile.guardTotals.emptyBody': 'Every impulse Symy helps you pause grows into this green record.',
        'profile.guardTotals.loadError': 'Could not load your guardian record',
        'common.days': 'days',
        'common.retry': 'Retry',
        'buddy.growthStage.baby': 'Baby Elephant',
        'buddy.growthStage.young': 'Young Elephant',
        'buddy.growthStage.adult': 'Adult Elephant',
        'buddy.growthStage.elder': 'Guardian Elder',
      };
      let result = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

import { apiFetch } from '@/lib/api-client';

const mockApiFetch = vi.mocked(apiFetch);

function mockPipelines(state: Record<string, unknown>, stats: Record<string, unknown>) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.startsWith('/api/buddy/state')) return Promise.resolve(state) as Promise<never>;
    if (url.startsWith('/api/challenge/stats')) return Promise.resolve(stats) as Promise<never>;
    if (url.startsWith('/api/buddy/health-events')) return Promise.resolve({ events: [] }) as Promise<never>;
    return Promise.reject(new Error(`unexpected url: ${url}`)) as Promise<never>;
  });
}

const FULL_STATE = {
  streak: 12,
  badges: ['impulse_shield', 'streak_7'],
  growthStage: 'young',
  totalSaved: 260,
};

const FULL_STATS = { totalSaw: 40, totalPassed: 34, totalFailed: 6 };

beforeEach(() => {
  shareSpy.mockClear();
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('longestKnownStreak pure function', () => {
  it('uses current streak when it exceeds badge floors', () => {
    expect(longestKnownStreak(12, ['streak_7'], 34)).toBe(12);
  });

  it('uses badge milestone floor when it exceeds current streak (data-provable lower bound)', () => {
    // streak 断了但 30 天里程碑勋章在 — 最长连续至少 30, 只保守不夸大
    expect(longestKnownStreak(3, ['streak_guardian_30'], 34)).toBe(30);
    expect(longestKnownStreak(3, ['streak_7'], 34)).toBe(7);
  });

  it('floors at 1 when intercepts exist but no streak data (a pass happened on some day)', () => {
    expect(longestKnownStreak(0, [], 5)).toBe(1);
  });

  it('is 0 only when nothing has ever been guarded', () => {
    expect(longestKnownStreak(0, [], 0)).toBe(0);
  });
});

describe('isGuardTotalsEmpty pure function', () => {
  it('detects the brand-new user (no intercepts, no streak, no badges)', () => {
    expect(isGuardTotalsEmpty({ totalIntercepts: 0, streakDays: 0, badgesUnlocked: 0 })).toBe(true);
  });

  it('is false as soon as any honor exists', () => {
    expect(isGuardTotalsEmpty({ totalIntercepts: 1, streakDays: 0, badgesUnlocked: 0 })).toBe(false);
    expect(isGuardTotalsEmpty({ totalIntercepts: 0, streakDays: 2, badgesUnlocked: 0 })).toBe(false);
  });
});

describe('GuardTotalsCard with data', () => {
  it('renders all five face fields plus the in-app money line', async () => {
    mockPipelines(FULL_STATE, FULL_STATS);
    render(<GuardTotalsCard />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-totals-intercepts').textContent).toContain('34');
    });
    // 连续守护 + 最长连续 (streak 12 > streak_7 下界 → 12)
    expect(screen.getByTestId('guard-totals-streak').textContent).toContain('12');
    expect(screen.getByTestId('guard-totals-longest').textContent).toContain('12');
    // 勋章 n/总数 — 总数来自 ALL_BADGES 注册表
    expect(screen.getByTestId('guard-totals-badges').textContent).toContain(`2/${ALL_BADGES.length}`);
    // 小象阶段称号
    expect(screen.getByTestId('guard-totals-stage').textContent).toBe('Young Elephant');
    // 里子行 (app 内可见) + 口袋文案
    expect(screen.getByTestId('guard-totals-money-line').textContent).toBe('Every guard has left you 10 hours');
    expect(screen.getByText('The money stays in your pocket — it is never sent anywhere.')).toBeTruthy();
    // 晒入口存在
    expect(screen.getByTestId('guard-totals-share')).toBeTruthy();
  });

  it('keeps every field present when badges list is null (early rows)', async () => {
    mockPipelines({ streak: 0, badges: null, growthStage: 'baby', totalSaved: 0 }, { totalPassed: 2 });
    render(<GuardTotalsCard />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-totals-intercepts').textContent).toContain('2');
    });
    expect(screen.getByTestId('guard-totals-badges').textContent).toContain(`0/${ALL_BADGES.length}`);
    // 勋章 0 但拦截 2 → 低数据态: 阶段仍显示 baby 称号, 不出空表
    expect(screen.getByTestId('guard-totals-stage').textContent).toBe('Baby Elephant');
  });
});

describe('GuardTotalsCard honor-not-shame states', () => {
  it('empty state shows positive guidance, never a 0/0/0 shame table, no share entry', async () => {
    mockPipelines({ streak: 0, badges: [], growthStage: 'baby', totalSaved: 0 }, { totalPassed: 0 });
    render(<GuardTotalsCard />);

    await waitFor(() => {
      expect(screen.getByText('Your first guard will begin here')).toBeTruthy();
    });
    expect(screen.getByText('Every impulse Symy helps you pause grows into this green record.')).toBeTruthy();
    // 不出 0 指标格、不出晒入口
    expect(screen.queryByTestId('guard-totals-intercepts')).toBeNull();
    expect(screen.queryByTestId('guard-totals-longest')).toBeNull();
    expect(screen.queryByTestId('guard-totals-share')).toBeNull();
    // 不出里子金额行
    expect(screen.queryByTestId('guard-totals-money-line')).toBeNull();
  });

  it('low-data state: streak 0 shows fresh-start companion copy instead of a bare 0', async () => {
    mockPipelines({ streak: 0, badges: ['impulse_shield'], growthStage: 'baby', totalSaved: 30 }, { totalPassed: 3 });
    render(<GuardTotalsCard />);

    await waitFor(() => {
      expect(screen.getByText('Your next guard starts a fresh count')).toBeTruthy();
    });
    expect(screen.queryByTestId('guard-totals-streak')).toBeNull();
  });
});

describe('GuardTotalsCard share entry (face-only)', () => {
  it('passes cumulative face data to share-modal; the only money is the sanctioned medal.savedCents', async () => {
    mockPipelines(FULL_STATE, FULL_STATS);
    render(<GuardTotalsCard />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-totals-share')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('guard-totals-share'));

    await waitFor(() => {
      expect(shareSpy).toHaveBeenCalled();
    });
    const props = shareSpy.mock.calls[0][0] as Record<string, unknown>;

    // 面子字段: 累计面子数据 + streak 模板
    expect(props.initialTemplate).toBe('streak');
    expect(props.streakDays).toBe(12);
    expect(props.interceptCount).toBe(34);

    // 分享入口传参无金额字段: totalSaved / moneyLeft / amount 一概不出现;
    // 唯一的金额是 medal.savedCents — share-modal 既有机制在渲染前把它换算成
    // 自由小时 (面子化), 分享图永无钱数。
    expect(props.totalSaved).toBeUndefined();
    expect(props.moneyLeft).toBeUndefined();
    expect(props.amount).toBeUndefined();
    const medal = props.medal as { itemTitle: string; savedCents: number };
    expect(medal.itemTitle).toBe('');
    expect(medal.savedCents).toBe(26000);
  });

  it('mounts the share modal only after the 晒 entry is clicked', async () => {
    mockPipelines(FULL_STATE, FULL_STATS);
    render(<GuardTotalsCard />);

    await waitFor(() => {
      expect(screen.getByTestId('guard-totals-share')).toBeTruthy();
    });
    expect(screen.queryByTestId('share-modal-stub')).toBeNull();
    fireEvent.click(screen.getByTestId('guard-totals-share'));
    expect(screen.getByTestId('share-modal-stub')).toBeTruthy();
  });
});
