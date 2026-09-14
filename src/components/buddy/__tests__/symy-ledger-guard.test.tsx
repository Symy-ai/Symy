/**
 * SymyLedger 守护转存进项区块 tests (batch6-b)
 *
 * 覆盖:
 *  - 拦截结算后账本出现"守护转存"进项, 条目金额等于结算额, 总额行含守护次数与金额
 *  - 只显示最近 3 条 (账本时间序倒序)
 *  - 无守护数据时区块整体隐藏 (荣誉非羞辱, 不出 0 表)
 *  - demo 模式不拉取
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SymyLedger } from '../symy-ledger';
import type { BuddyState } from '@/types/buddy-state';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// useHourlyRate 桩 (隔离 AuthProvider 依赖)
vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, setHourlyRate: vi.fn() }),
}));

// 分享卡桩 — 本任务红线: 不往 share 域新增金额通道
const shareCardSpy = vi.hoisted(() => vi.fn());
vi.mock('../share-card-modal', () => ({
  ShareCardModal: (props: Record<string, unknown>) => {
    shareCardSpy(props);
    return null;
  },
}));

// formatCurrency 桩
vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number, opts?: { decimals?: boolean }) =>
    opts?.decimals === false
      ? `$${Math.round(amount).toLocaleString('en-US')}`
      : `$${Number(amount).toFixed(2)}`,
}));

const DICT: Record<string, string> = {
  'buddy.ledger.guard.title': '🛡️ Guard transfers',
  'buddy.ledger.guard.totalLine': '{count} guards · {amount} now growing in your dream funds',
  'buddy.ledger.guard.recentTitle': 'Latest guards',
  'buddy.ledger.guard.entryAria': '{amount} guarded into {fund}',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const tpl = DICT[key] ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl
      );
    },
  }),
}));

function makeBuddyState(overrides: Partial<BuddyState> = {}): BuddyState {
  return {
    vitality: 80,
    tokens: 10,
    health: 'healthy',
    level: 3,
    xp: 40,
    xpToNext: 100,
    streak: 3,
    dreamFunds: [
      { id: 'df-1', name: 'Credit Card Payoff', target: 2000, current: 146.8, emoji: '💳', sortOrder: 0 },
    ],
    badges: [],
    totalSaved: 146.8,
    challengesCompleted: 2,
    lastHealingKitAt: null,
    version: 1,
    growthStage: 'young',
    personality: 'unknown',
    intimacy: 10,
    dailyNeeds: { clarity: 50, connection: 50 },
    proactiveMessages: [],
    personalityAwakenedAt: null,
    lastActiveAt: null,
    ...overrides,
  };
}

function depositEvent(id: string, amount: number, createdAt: string) {
  return {
    id,
    eventType: 'challenge_reward',
    triggerSource: 'deposit_api',
    triggerId: `deposit:user-1:ch-${id}:df-1:${amount}`,
    description: '',
    metadata: { source: 'deposit', fundId: 'df-1', fundName: 'Credit Card Payoff', amount },
    createdAt,
  };
}

function renderLedger(isDemo = false) {
  return render(
    <SymyLedger
      buddyState={makeBuddyState()}
      config={{ color: '#000', neonGradient: 'g' }}
      isDemo={isDemo}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ events: [] });
});

describe('SymyLedger — 守护转存进项区块', () => {
  it('拦截结算后 ledger 出现守护转存进项, 金额等于结算额', async () => {
    apiFetchMock.mockResolvedValue({
      events: [depositEvent('e1', 46.8, '2026-09-01T10:00:00.000Z')],
    });
    renderLedger();

    await waitFor(() => expect(screen.getByTestId('guard-transfer-block')).toBeTruthy());
    expect(screen.getByText('+$46.80')).toBeTruthy();
    expect(screen.getByText(/1 guards · \$47 now growing/)).toBeTruthy();
    expect(screen.getByLabelText('$46.80 guarded into Credit Card Payoff')).toBeTruthy();
    // 拉取走既有审计管道, 只取 challenge_reward
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/buddy/health-events?event_type=challenge_reward')
    );
  });

  it('最多显示最近 3 条 (时间序倒序)', async () => {
    apiFetchMock.mockResolvedValue({
      events: [
        depositEvent('e1', 10, '2026-09-01T10:00:00.000Z'),
        depositEvent('e2', 20, '2026-09-02T10:00:00.000Z'),
        depositEvent('e3', 30, '2026-09-03T10:00:00.000Z'),
        depositEvent('e4', 40, '2026-09-04T10:00:00.000Z'),
      ],
    });
    renderLedger();

    await waitFor(() => expect(screen.getByTestId('guard-transfer-block')).toBeTruthy());
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // 倒序: 最新 (e4, $40) 在前; $10 (最老) 不出现
    expect(rows[0].textContent).toContain('$40.00');
    expect(screen.queryByText('+$10.00')).toBeNull();
  });

  it('审计记录超过一页时继续分页拉取, 总进项覆盖完整守护记录', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      depositEvent(
        `e-${index}`,
        1,
        new Date(Date.parse('2026-09-02T00:00:00.000Z') - index).toISOString()
      )
    );
    const oldest = firstPage[firstPage.length - 1].createdAt;
    apiFetchMock.mockImplementation((url: string) => ({
      events: url.includes(`before=${encodeURIComponent(oldest)}`)
        ? [depositEvent('e-final', 40, '2026-09-01T00:00:00.000Z')]
        : firstPage,
    }));
    renderLedger();

    await waitFor(() => expect(screen.getByTestId('guard-transfer-block')).toBeTruthy());
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/101 guards · \$140 now growing/)).toBeTruthy();
  });

  it('无守护数据时区块整体隐藏, 不出 0 表', async () => {
    renderLedger();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('guard-transfer-block')).toBeNull();
  });

  it('demo 模式不拉取审计记录', () => {
    renderLedger(true);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('guard-transfer-block')).toBeNull();
  });
});
