/**
 * SpendingCapSetting tests (batch75-b — testgap 盲区补测, v8 #9 / E6)
 *
 * 覆盖 (断言与现状对齐):
 *  - useSpendingCapForm 清洗链 (真实实现): 非法字符剥离 / 多小数点 / 负号剥离
 *  - save() PUT 请求体: capCents = Math.round(draft*100), warningPct, resetPeriod
 *  - toggle off → capCents: 0 (draft 被忽略); toggle on + 空 draft → capCents: 0
 *    且 refetch 后仍 0 → 开关落回 off (E6-① 现状: 静默无效切换)
 *  - save() 无 catch (E6-③): apiFetch reject → refetch 不执行, unhandled rejection
 *  - 回填: capCents/100 无浮点尾差; warningPct 回填
 *  - 进度条条件渲染: state=null 不渲染; pctUsed>100 钳 100%; 状态配色
 *  - demo 模式: save no-op
 */
// @vitest-environment happy-dom

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpendingCapSetting } from '../spending-cap-setting';
import { apiFetch } from '@/lib/api-client';
import { useSpendingCap, type SpendingCapResponse } from '@/lib/hooks/use-spending-cap';
import type { SpendingCapState } from '@/lib/spending-cap-tracker';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

// useSpendingCapForm 用真实实现 (清洗链是被测行为), 仅 mock useSpendingCap (react-query 依赖)
vi.mock('@/lib/hooks/use-spending-cap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks/use-spending-cap')>();
  return { ...actual, useSpendingCap: vi.fn() };
});

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'en',
  }),
}));

function capState(overrides: Partial<SpendingCapState> = {}): SpendingCapState {
  return { usedCents: 5000, capCents: 10000, pctUsed: 50, status: 'ok', remainingCents: 5000, ...overrides };
}

function capData(overrides: {
  state?: SpendingCapState | null;
  setting?: Partial<SpendingCapResponse['setting']>;
} = {}): SpendingCapResponse {
  return {
    state: overrides.state === undefined ? capState() : overrides.state,
    setting: { capCents: 10000, periodStart: '2026-09-01', warningPct: 80, ...overrides.setting },
    events: [],
    categories: [],
    daysLeft: 15,
  };
}

function setup(data: SpendingCapResponse | null, isDemo = false) {
  const refetch = vi.fn(() => Promise.resolve(undefined));
  vi.mocked(useSpendingCap).mockReturnValue({
    data,
    refetch,
    isLoading: false,
  } as unknown as ReturnType<typeof useSpendingCap>);
  render(<SpendingCapSetting isDemo={isDemo} />);
  return { refetch };
}

function changeAmount(value: string) {
  fireEvent.change(screen.getByLabelText('profile.spendingCapAmount'), { target: { value } });
}

function toggle() {
  return screen.getByRole('button', { name: 'profile.spendingCapToggle' }) as HTMLButtonElement;
}
function saveButton() {
  return screen.getByRole('button', { name: 'profile.spendingCapSave' }) as HTMLButtonElement;
}
function resetButton() {
  return screen.getByRole('button', { name: 'profile.spendingCapReset' }) as HTMLButtonElement;
}
function amountInput() {
  return screen.getByLabelText('profile.spendingCapAmount') as HTMLInputElement;
}
function progressFill() {
  return screen.getByTestId('spending-cap-progress').querySelector('.h-2 > div') as HTMLElement;
}
function putCalls() {
  return vi.mocked(apiFetch).mock.calls.filter(([url]) => url === '/api/buddy/spending-cap');
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({} as SpendingCapResponse);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SpendingCapSetting — 条件渲染与回填', () => {
  it('capCents=0 → 功能关闭: 输入框/保存/重置不渲染, 开关为 off 样式', () => {
    setup(capData({ setting: { capCents: 0 } }));
    expect(screen.queryByLabelText('profile.spendingCapAmount')).toBeNull();
    expect(screen.queryByRole('button', { name: 'profile.spendingCapSave' })).toBeNull();
    expect(toggle().className).toContain('bg-white/20');
    expect(toggle().className).not.toContain('bg-cyan-500');
  });

  it('capCents>0 → 功能开启: 回填 draft = String(capCents/100), 无浮点尾差', () => {
    setup(capData({ setting: { capCents: 3919 } }));
    expect(amountInput().value).toBe('39.19');
  });

  it('warningPct 回填: setting.warningPct=90 → 90% 选项选中', () => {
    setup(capData({ setting: { warningPct: 90 } }));
    expect(screen.getByRole('radio', { name: '90%' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '80%' }).getAttribute('aria-checked')).toBe('false');
  });

  it('data.state=null → 进度条不渲染', () => {
    setup(capData({ state: null }));
    expect(screen.queryByTestId('spending-cap-progress')).toBeNull();
  });

  it('进度条: pctUsed=120 → 宽度钳 100%, exceeded 红色, 文本显示真实 120%', () => {
    setup(capData({ state: capState({ usedCents: 12000, pctUsed: 120, status: 'exceeded', remainingCents: 0 }) }));
    expect(progressFill().style.width).toBe('100%');
    expect(progressFill().className).toContain('bg-red-500');
    expect(screen.getByTestId('spending-cap-progress').textContent).toContain('$120.00 / $100.00 · 120%');
  });

  it('进度条: warning 状态 → 橙色', () => {
    setup(capData({ state: capState({ pctUsed: 85, status: 'warning' }) }));
    expect(progressFill().className).toContain('bg-orange-500');
  });
});

describe('SpendingCapSetting — 表单清洗 (useSpendingCapForm 真实链, D12 固化)', () => {
  it.each([
    ['12.34abc', '12.34'],
    ['1.2.3', '1.23'],
    ['1.2.3.4', '1.2.34'], // D12 现状: 正则只保第一个点, 仍留两个小数点
    ['-5', '5'], // 负号被剥离 → 负上限不可能从该输入产生 (E6-② 在组件层不成立)
    ['9a9', '99'],
    ['abc', ''],
  ])('输入 %j → draft %j', (raw, expected) => {
    setup(capData());
    changeAmount(raw);
    expect(amountInput().value).toBe(expected);
  });

  it('draft 清空后保存/重置按钮禁用 (空值不发请求)', () => {
    setup(capData({ setting: { capCents: 1000 } }));
    expect(saveButton().disabled).toBe(false);
    changeAmount('');
    expect(saveButton().disabled).toBe(true);
    expect(resetButton().disabled).toBe(true);
  });
});

describe('SpendingCapSetting — save 请求体', () => {
  it('保存: PUT {capCents: round(draft*100), warningPct: 80, resetPeriod: false}, 成功后 refetch 恰一次', async () => {
    const { refetch } = setup(capData());
    changeAmount('12.34');
    fireEvent.click(saveButton());

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    const [, init] = putCalls()[0]!;
    expect(init).toMatchObject({ method: 'PUT', body: { capCents: 1234, warningPct: 80, resetPeriod: false } });
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(saveButton().disabled).toBe(false); // finally 恢复 saving
  });

  it('换挡 warning → 95: PUT warningPct 跟随', async () => {
    setup(capData());
    fireEvent.click(screen.getByRole('radio', { name: '95%' }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]![1]!.body).toMatchObject({ warningPct: 95 });
  });

  it('重置按钮: resetPeriod=true, capCents 仍按 draft 上送', async () => {
    setup(capData());
    changeAmount('25');
    fireEvent.click(resetButton());

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]![1]!.body).toMatchObject({ capCents: 2500, resetPeriod: true });
  });

  it('toggle off: PUT capCents=0 — draft 残值被忽略', async () => {
    setup(capData({ setting: { capCents: 2500 } }));
    fireEvent.click(toggle());

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]![1]!.body).toMatchObject({ capCents: 0 });
  });

  it('E6-① 现状: 开关开启时 draft 为空 → PUT capCents=0; refetch 回 0 后开关落回 off (静默无效切换)', async () => {
    const { refetch } = setup(capData({ setting: { capCents: 0 } })); // 初始关闭, draft 空
    refetch.mockImplementation(() => {
      // 模拟服务端确认 capCents=0 (PUT 的就是 0)
      vi.mocked(useSpendingCap).mockReturnValue({
        data: capData({ setting: { capCents: 0 } }),
        refetch,
        isLoading: false,
      } as unknown as ReturnType<typeof useSpendingCap>);
      return Promise.resolve(undefined);
    });

    fireEvent.click(toggle()); // save(true) → capCents: round(Number('')||0 * 100) = 0

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]![1]!.body).toMatchObject({ capCents: 0, resetPeriod: false });
    await waitFor(() => expect(toggle().className).toContain('bg-white/20')); // 用户开了, UI 又弹回关
  });
});

describe('SpendingCapSetting — save 失败 (E6-③ 无 catch 固化)', () => {
  it('apiFetch reject → refetch 不执行; rejection 无处理者捕获 (现状: 无 catch + 无用户提示)', async () => {
    const { refetch } = setup(capData());
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network down'));

    // save() 无 catch: 捕获 process 级 unhandledRejection 以固化现状且不污染测试进程
    const prevListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    const rejections: unknown[] = [];
    const mine = (reason: unknown) => { rejections.push(reason); };
    process.on('unhandledRejection', mine);

    try {
      await act(async () => {
        fireEvent.click(saveButton());
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(refetch).not.toHaveBeenCalled();
      expect(saveButton().disabled).toBe(false); // finally 恢复
      expect(rejections).toHaveLength(1);
      expect((rejections[0] as Error).message).toBe('network down');
    } finally {
      process.removeListener('unhandledRejection', mine);
      for (const l of prevListeners) process.on('unhandledRejection', l);
    }
  });
});

describe('SpendingCapSetting — demo 模式', () => {
  it('isDemo → save no-op: 不发 PUT, 不 refetch', async () => {
    const { refetch } = setup(capData(), true);
    fireEvent.click(saveButton());
    fireEvent.click(toggle());
    await act(async () => {});
    expect(putCalls()).toHaveLength(0);
    expect(refetch).not.toHaveBeenCalled();
  });
});
