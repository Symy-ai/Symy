// @vitest-environment happy-dom
/**
 * GuardDataManagementSetting 设置区块测试 (batch59-b)
 *
 * 覆盖: 规模总览渲染 / 样本不足 warm note / 分类清除确认弹层 (条数/天数 +
 * estSaved 知情提醒) / 确认后 POST reset lane / 全清后庆祝卡一次性展示 /
 * 恢复默认 (清三 localStorage 键 + 时薪回写默认) / 清键后四块读取回归默认
 * (normalize degrade 回归)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuardDataManagementSetting } from '../guard-data-management-setting';

const setHourlyRate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 40, rateIsDefault: false, setHourlyRate, isLoading: false }),
  DEFAULT_HOURLY_RATE: 25,
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'profile.guardDataTitle': '守护数据管理',
        'profile.guardDataDesc': 'desc',
        'profile.guardDataUnitEvents': '条',
        'profile.guardDataUnitDays': '天',
        'profile.guardDataCoveredPrefix': '覆盖 ',
        'profile.guardDataEarliestPrefix': '最早记录 ',
        'profile.guardDataEmptyNote': '还没有守护记录',
        'profile.guardDataWarmNote': '记录还不多',
        'profile.guardDataLoadFailed': 'load failed',
        'profile.guardDataClearChallenge': '仅清拦截记录',
        'profile.guardDataClearAltReuse': '仅清替代与复用',
        'profile.guardDataClearAll': '全部守护记录',
        'profile.guardDataResetSettingsTitle': '调乱了？',
        'profile.guardDataResetSettingsButton': '恢复默认设置',
        'profile.guardDataConfirmTitle': '轻装出发前，确认一下',
        'profile.guardDataConfirmSettings': '将把四块设置恢复为出厂默认值。',
        'profile.guardDataImpactPrefix': '知情提醒：这些记录里合计约 $',
        'profile.guardDataImpactSuffix': ' 的省钱估算也会一并放下。',
        'profile.guardDataRetainedPrefix': '其余 ',
        'profile.guardDataRetainedSuffix': ' 会原样保留。',
        'profile.guardDataConfirmKeep': '勋章与段位不受影响。',
        'profile.guardDataConfirmGo': '确认轻装出发',
        'profile.guardDataConfirmCancel': '先保留',
        'profile.guardDataNewChapterTitle': '新的一章开始',
        'profile.guardDataNewChapterBody': '小象陪你重新出发。',
        'profile.guardDataRetainedNote': '勋章段位依然陪着你。',
        'profile.guardDataDismiss': '收下',
      })[key] || key,
    locale: 'zh',
  }),
}));

const fetchMock = vi.fn();
vi.mock('@/hooks/use-guard-style-profile', () => ({
  fetchGuardStyleEvents: (...args: unknown[]) => fetchMock(...args),
}));

const apiFetchMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const d = (day: number) => new Date(2026, 8, day, 10, 0, 0).toISOString();
const FULL_EVENTS = [
  { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 40 }, createdAt: d(1) },
  { eventType: 'challenge_completed', triggerId: 'g2', metadata: { savedAmount: 60 }, createdAt: d(2) },
  { eventType: 'challenge_completed', triggerId: 'g3', metadata: { savedAmount: 100 }, createdAt: d(2) },
  { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption', estSaved: 25 }, createdAt: d(3) },
  { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption', estSaved: 50 }, createdAt: d(4) },
];

describe('GuardDataManagementSetting', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    apiFetchMock.mockClear();
    setHourlyRate.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders overview stats with earliest date', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS);
    render(<GuardDataManagementSetting />);
    await waitFor(() => {
      const stats = screen.getByTestId('guard-data-stats');
      expect(stats.textContent).toContain('5 条');
      expect(stats.textContent).toContain('覆盖 4 天');
      expect(stats.textContent).toContain('最早记录');
    });
  });

  it('insufficient (<5 events) → warm note', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS.slice(0, 2));
    render(<GuardDataManagementSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-data-stats').textContent).toContain('记录还不多');
    });
  });

  it('clear-all flow: confirm panel shows counts + private impact, POSTs lane, then celebrates once', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS);
    render(<GuardDataManagementSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-data-stats').textContent).toContain('5 条');
    });

    fireEvent.click(screen.getByTestId('guard-data-clear-all'));
    const confirm = screen.getByTestId('guard-data-confirm');
    expect(confirm.textContent).toContain('5 条');
    expect(confirm.textContent).toContain('覆盖 4 天');
    // 金额知情提醒 (in-app 私享): $275 = 40+60+100+25+50
    expect(screen.getByTestId('guard-data-confirm-impact').textContent).toContain('$275');

    fireEvent.click(screen.getByTestId('guard-data-confirm-go'));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buddy/health-events/reset', {
        method: 'POST',
        body: { lane: 'all' },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('guard-data-celebration').textContent).toContain('新的一章开始');
    });

    fireEvent.click(screen.getByTestId('guard-data-celebration-dismiss'));
    await waitFor(() => {
      expect(screen.queryByTestId('guard-data-celebration')).toBeNull();
    });
  });

  it('clear-challenge flow: retained note for other tracks, POSTs lane=challenge, no celebration', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS);
    render(<GuardDataManagementSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-data-stats').textContent).toContain('5 条');
    });

    fireEvent.click(screen.getByTestId('guard-data-clear-challenge'));
    expect(screen.getByTestId('guard-data-confirm').textContent).toContain('3 条');
    expect(screen.getByTestId('guard-data-confirm-impact').textContent).toContain('$200');

    fireEvent.click(screen.getByTestId('guard-data-confirm-go'));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/buddy/health-events/reset', {
        method: 'POST',
        body: { lane: 'challenge' },
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('guard-data-confirm')).toBeNull();
    });
    expect(screen.queryByTestId('guard-data-celebration')).toBeNull();
  });

  it('reset settings: clears three localStorage keys and writes default hourly rate', async () => {
    fetchMock.mockResolvedValue(FULL_EVENTS);
    window.localStorage.setItem('symy-guard-intensity', 'lockdown');
    window.localStorage.setItem('symy-guard-scope', JSON.stringify({ electronics: 'exempt' }));
    window.localStorage.setItem('symy-night-window', 'nightOwl');
    render(<GuardDataManagementSetting />);
    await waitFor(() => {
      expect(screen.getByTestId('guard-data-stats').textContent).toContain('5 条');
    });

    fireEvent.click(screen.getByTestId('guard-data-reset-settings'));
    expect(screen.getByTestId('guard-data-confirm-scope').textContent).toContain('出厂默认值');

    fireEvent.click(screen.getByTestId('guard-data-confirm-go'));
    await waitFor(() => {
      expect(setHourlyRate).toHaveBeenCalledWith(25);
    });
    expect(window.localStorage.getItem('symy-guard-intensity')).toBeNull();
    expect(window.localStorage.getItem('symy-guard-scope')).toBeNull();
    expect(window.localStorage.getItem('symy-night-window')).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('恢复默认后四块设置读取回归默认 (53-b normalize degrade 回归)', () => {
  it('清键后 raw null → normalize 回默认值', async () => {
    const { normalizeGuardIntensity, DEFAULT_GUARD_INTENSITY } = await import('@/lib/guard-intensity');
    const { normalizeGuardScope, isGuardScopeDefault } = await import('@/lib/guard-scope');
    const { normalizeNightWindow, DEFAULT_NIGHT_WINDOW } = await import('@/lib/night-window');
    const { DEFAULT_HOURLY_RATE } = await import('@/lib/freedom-time');

    window.localStorage.removeItem('symy-guard-intensity');
    window.localStorage.removeItem('symy-guard-scope');
    window.localStorage.removeItem('symy-night-window');

    expect(normalizeGuardIntensity(window.localStorage.getItem('symy-guard-intensity'))).toBe(
      DEFAULT_GUARD_INTENSITY,
    );
    expect(isGuardScopeDefault(normalizeGuardScope(window.localStorage.getItem('symy-guard-scope')))).toBe(true);
    expect(normalizeNightWindow(window.localStorage.getItem('symy-night-window'))).toBe(
      DEFAULT_NIGHT_WINDOW,
    );
    expect(DEFAULT_HOURLY_RATE).toBe(25);
  });
});
