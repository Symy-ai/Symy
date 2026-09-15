/**
 * MeDreamFundsSection tests (batch75-b — testgap 盲区补测, v5 #11)
 *
 * 覆盖 (断言与现状对齐):
 *  - 头部汇总 totalCurrent = Σ current
 *  - Savings fund 强制 100% 进度、"/ ∞" 显示、无编辑/删除按钮
 *  - 进度条 pct = Math.min(100, round(current/target*100)); 达标 → ★ + Set a new goal
 *    target=0 边界: current>0 → Infinity 被 Math.min 钳到 100 (现状固化, 见 /tmp/b75b-defects.md)
 *  - 删除确认 hasProgress 分支 (金额进确认文案) + confirm 取消不删 + 最后一个 fund 删除按钮禁用
 *  - 点击基金卡展开历史: apiFetch 历史接口、再点折叠、失败静默为空
 *  - demo 模式: 无新增/编辑/删除入口, 点卡不拉历史
 */
// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeDreamFundsSection } from '../me-dream-funds-section';
import type { DreamFund } from '@/types/buddy-state';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/components/buddy/dream-fund-editor', () => ({
  DreamFundEditor: (props: { open: boolean; mode: string }) =>
    props.open ? <div data-testid="fund-editor" data-mode={props.mode} /> : null,
}));

// formatCurrency 桩 — 确定性 "$47" / "$46.80"
vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number, opts?: { decimals?: boolean }) =>
    opts?.decimals === false
      ? `$${Math.round(amount).toLocaleString('en-US')}`
      : `$${Number(amount).toFixed(2)}`,
}));

const DICT: Record<string, string> = {
  'buddy.dreamFunds': 'Dream Funds',
  'buddy.dreamFundAdd': 'Add dream fund',
  'buddy.dreamFundSavings': 'Savings',
  'buddy.dreamFundEdit': 'Edit fund',
  'buddy.dreamFundDelete': 'Delete fund',
  'buddy.dreamFundDeleteDisabled': 'At least 1 dream fund is required',
  'buddy.dreamFundDeleteConfirmWithProgress': 'Delete this fund and its ${amount} progress?',
  'buddy.dreamFundDeleteConfirm': 'Delete this fund?',
  'buddy.dreamFundDeleted': 'Fund deleted',
  'buddy.goalReached': 'Goal reached!',
  'buddy.setNewGoal': 'Set a new goal →',
  'buddy.dreamFundHistoryTitle': '📋 Fill history',
  'buddy.dreamFundHistoryEmpty': 'No fill history yet',
  'buddy.dreamFundSavingsHint': '∞ Accumulating savings',
  'common.loading': 'Loading...',
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const tpl = DICT[key] ?? key;
      if (!params) return tpl;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
        tpl,
      );
    },
  }),
}));

function makeFund(overrides: Partial<DreamFund> = {}): DreamFund {
  return {
    id: 'df-1',
    name: 'Iceland Trip',
    target: 400,
    current: 100,
    emoji: '🏔️',
    sortOrder: 0,
    ...overrides,
  };
}

function makeFunds(): DreamFund[] {
  return [
    makeFund(),
    makeFund({ id: 'df-2', name: 'New Bike', target: 200, current: 200, emoji: '🚲', sortOrder: 1 }),
    makeFund({ id: SAVINGS_FUND_ID, name: 'savings', target: 2147483647, current: 50, emoji: '🏦', sortOrder: 2 }),
  ];
}

function progressBarOf(fundId: string): HTMLElement {
  const card = screen.getByText(fundId === SAVINGS_FUND_ID ? 'Savings' : fundId === 'df-1' ? 'Iceland Trip' : 'New Bike')
    .closest('[data-fund-id]') as HTMLElement;
  return card.querySelector('.h-2 > div') as HTMLElement;
}

const noop = () => {};

beforeEach(() => {
  window.localStorage.clear();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ history: [] });
  vi.stubGlobal('confirm', vi.fn(() => false));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('MeDreamFundsSection — 汇总与进度条', () => {
  it('头部汇总 totalCurrent = Σ current (含 Savings)', () => {
    const { container } = render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);
    // 100 + 200 + 50 = 350
    const h3 = container.querySelector('h3');
    expect(h3?.textContent).toContain('Dream Funds');
    expect(h3?.textContent).toContain('$350');
  });

  it('Savings fund: 名称强制 "Savings"、"/ ∞" 金额、进度恒 100%', () => {
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);
    const savingsCard = screen.getByText('Savings').closest('[data-fund-id]') as HTMLElement;
    expect(savingsCard.textContent).toContain('$50');
    expect(savingsCard.textContent).toContain('/ ∞');
    expect(progressBarOf(SAVINGS_FUND_ID).style.width).toBe('100%');
    // current>0 → 累积 hint
    expect(screen.getByText('∞ Accumulating savings')).toBeTruthy();
  });

  it('普通 fund 进度: 100/400 → 25%', () => {
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);
    expect(screen.getByText('$100 / $400')).toBeTruthy();
    expect(progressBarOf('df-1').style.width).toBe('25%');
  });

  it('达标 fund (current ≥ target): 进度钳到 100% + ★ Goal reached + Set a new goal', () => {
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);
    expect(screen.getByText('$200 / $200')).toBeTruthy();
    expect(progressBarOf('df-2').style.width).toBe('100%');
    expect(screen.getByText('Goal reached!')).toBeTruthy();
    expect(screen.getByText('Set a new goal →')).toBeTruthy();
  });

  it('target=0 且 current>0 → 除零得 Infinity, 被 Math.min 钳为 100% (现状固化)', () => {
    render(
      <MeDreamFundsSection
        dreamFunds={[makeFund({ target: 0, current: 100 })]}
        isDemo={false}
        onToast={noop}
      />,
    );
    expect(progressBarOf('df-1').style.width).toBe('100%');
    // 现状: Infinity 被钳到 100 → 显示 Goal reached (0 目标基金达标属语义瑕疵, 已记 defects)
    expect(screen.getByText('Goal reached!')).toBeTruthy();
  });

  it('target=0 且 current=0 → 0/0 = NaN, 无 Goal reached 行 (现状固化, 已记 defects)', () => {
    render(
      <MeDreamFundsSection
        dreamFunds={[makeFund({ target: 0, current: 0 })]}
        isDemo={false}
        onToast={noop}
      />,
    );
    // NaN 比较行为: pct >= 100 为 false → 无达标行; 组件不崩溃
    expect(screen.queryByText('Goal reached!')).toBeNull();
  });
});

describe('MeDreamFundsSection — 删除确认', () => {
  function setupDelete(funds: DreamFund[]) {
    const onDelete = vi.fn();
    const onToast = vi.fn();
    render(<MeDreamFundsSection dreamFunds={funds} isDemo={false} onDeleteDreamFund={onDelete} onToast={onToast} />);
    return { onDelete, onToast };
  }

  it('有进度的 fund: 确认文案带金额; 确认后删除 + info toast', () => {
    const { onDelete, onToast } = setupDelete(makeFunds());
    const deleteBtns = screen.getAllByRole('button', { name: 'Delete fund' });
    fireEvent.click(deleteBtns[0]); // df-1, current=100

    expect(vi.mocked(window.confirm).mock.calls[0][0]).toBe('Delete this fund and its $100 progress?');
    // stub 默认 false → 不删
    expect(onDelete).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(deleteBtns[0]);
    expect(onDelete).toHaveBeenCalledWith('df-1');
    expect(onToast).toHaveBeenCalledWith('Fund deleted', 'info');
  });

  it('零进度的 fund: 无金额的普通确认文案', () => {
    const { onDelete } = setupDelete([
      makeFund({ current: 0 }),
      makeFund({ id: 'df-2', name: 'New Bike', current: 0 }),
    ]);
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete fund' })[0]);
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toBe('Delete this fund?');
    expect(onDelete).toHaveBeenCalledWith('df-1');
  });

  it('仅剩一个 fund 时删除按钮禁用 (aria 提示至少保留一个)', () => {
    render(
      <MeDreamFundsSection
        dreamFunds={[makeFund()]}
        isDemo={false}
        onDeleteDreamFund={vi.fn()}
        onToast={noop}
      />,
    );
    const disabled = screen.getByRole('button', { name: 'At least 1 dream fund is required' });
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    // Savings 是最后一个时同样禁用
    cleanup();
    render(
      <MeDreamFundsSection
        dreamFunds={[makeFund({ id: SAVINGS_FUND_ID, name: 'savings' })]}
        isDemo={false}
        onDeleteDreamFund={vi.fn()}
        onToast={noop}
      />,
    );
    // Savings 无编辑/删除按钮组 — 只有普通 fund 走删除分支
    expect(screen.queryByRole('button', { name: 'Delete fund' })).toBeNull();
  });
});

describe('MeDreamFundsSection — 历史展开', () => {
  const HISTORY = {
    history: [
      { id: 'h1', amount: 46.8, description: 'Refund from jacket purchase', createdAt: '2026-09-01T10:00:00.000Z', eventType: 'refund_boost', triggerSource: 'deposit_api' },
      { id: 'h2', amount: 12, description: 'Challenge completed: no doomscroll', createdAt: '2026-09-02T10:00:00.000Z', eventType: 'challenge_reward', triggerSource: 'mcp' },
    ],
  };

  it('点基金卡 → 拉取历史接口并渲染金额/描述; 再点折叠', async () => {
    apiFetchMock.mockResolvedValue(HISTORY);
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);

    fireEvent.click(screen.getByText('Iceland Trip'));
    await waitFor(() => {
      expect(screen.getByText('+$46.80')).toBeTruthy();
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/buddy/dream-funds/df-1/history',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(screen.getByText('+$12.00')).toBeTruthy();

    // 再点同一卡 → 折叠
    fireEvent.click(screen.getByText('Iceland Trip'));
    expect(screen.queryByText('+$46.80')).toBeNull();
  });

  it('历史接口失败 → 静默显示空态, 不崩溃', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);

    fireEvent.click(screen.getByText('Iceland Trip'));
    await waitFor(() => {
      expect(screen.getByText('No fill history yet')).toBeTruthy();
    });
  });

  it('卸载时中止在途历史请求 (AbortController cleanup)', async () => {
    let released: ((v: unknown) => void) | undefined;
    apiFetchMock.mockReturnValue(new Promise((resolve) => { released = resolve; }));
    const { unmount } = render(
      <MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />,
    );

    fireEvent.click(screen.getByText('Iceland Trip'));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const signal = apiFetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    // 在途 promise 迟到 resolve — 不再 setState (不抛 act 警告/异常)
    released?.({ history: HISTORY.history });
  });
});

describe('MeDreamFundsSection — demo 与编辑入口', () => {
  it('demo 模式: 无新增按钮、无编辑/删除按钮', () => {
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);
    expect(screen.getByRole('button', { name: 'Add dream fund' })).toBeTruthy();
    cleanup();

    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo onToast={noop} />);
    expect(screen.queryByRole('button', { name: 'Add dream fund' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit fund' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete fund' })).toBeNull();
  });

  it('新增/编辑/设新目标 → 打开 DreamFundEditor 对应 mode', () => {
    render(<MeDreamFundsSection dreamFunds={makeFunds()} isDemo={false} onToast={noop} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add dream fund' }));
    expect(screen.getByTestId('fund-editor').getAttribute('data-mode')).toBe('create');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit fund' })[0]);
    expect(screen.getByTestId('fund-editor').getAttribute('data-mode')).toBe('edit');
    fireEvent.click(screen.getByText('Set a new goal →'));
    expect(screen.getByTestId('fund-editor').getAttribute('data-mode')).toBe('setNewGoal');
  });
});
