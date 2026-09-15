/**
 * DepositDialog tests (batch75-b 第四段 — testgap 盲区补测, v8 Top20 #8 / v5 #2)
 *
 * 覆盖 (断言与现状对齐):
 *  - DM-1: 金额 $ 由代码控制 — 标题/按钮插值 $20.00
 *  - DM-6: deposit/skip ref guard — 同 tick 双击只发一次 API
 *  - 存入成功: 单次 POST body={challengeId, action:'deposit', fundId};
 *    庆祝视图渲染服务器返回的 newCurrent/target/progress (钳 100%); onDeposited 收到完整 result
 *  - 409 幂等 (DM-2): 庆祝视图 + 占位数据 (0/0 假进度, v8 #8-③ 现状固化) + onDeposited 不调 + 4s 自动关
 *  - 非 409 失败: error 视图, Try Again 回选择卡且 ref 重置可重试; onClose 不调
 *  - DM-5-FINAL: loading 中禁点遮罩关闭 + 按钮 disabled; 非 loading 点遮罩 safeClose
 *  - 自动关闭: 庆祝 4s / skip 3s; safeClose 幂等 (Continue 后 timer 不再关); 卸载清理 (MEDIUM-6)
 *  - skip: body 无 fundId; onSkipped 恰一次; 失败 → safeClose 且不调 onSkipped
 */
// @vitest-environment happy-dom

import { render, screen, fireEvent, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DepositDialog, type DepositDialogProps } from '../deposit-dialog';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      let tpl = (params?.defaultValue as string) ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') tpl = tpl.replaceAll(`{${k}}`, String(v));
        }
      }
      return tpl;
    },
  }),
}));

import { apiFetch } from '@/lib/api-client';

const mockedApiFetch = vi.mocked(apiFetch);

const PAYLOAD = {
  success: true,
  action: 'deposit',
  fundId: 'fund-1',
  fundName: 'Laptop',
  fundEmoji: '💻',
  amount: 20,
  newCurrent: 120,
  target: 300,
  progress: 40,
  goalReached: false,
  bonusTokens: 5,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<DepositDialogProps> = {}) {
  const props: DepositDialogProps = {
    challengeId: 'ch-1',
    savedAmount: 20,
    fundName: 'Laptop',
    fundEmoji: '💻',
    fundId: 'fund-1',
    onClose: vi.fn(),
    onDeposited: vi.fn(),
    onSkipped: vi.fn(),
    ...overrides,
  };
  const utils = render(<DepositDialog {...props} />);
  return { props, unmount: utils.unmount };
}

const depositBtn = () => screen.getByRole('button', { name: /Laptop|your fund/ }) as HTMLButtonElement;
const skipBtn = () => screen.getByRole('button', { name: /freedom/ }) as HTMLButtonElement;
// 当前视图的选择卡容器 (每个视图只有一个 div.relative 卡片, portal 挂在 body 下)
const backdrop = () => document.body.querySelector('div.relative')!.parentElement as HTMLElement;

describe('DepositDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('DM-1: 标题/存入按钮的金额由代码插值 ($20.00), 按钮带 emoji+基金名', () => {
    setup();
    expect(screen.getByText('You saw it. $20.00 stays.')).toBeTruthy();
    expect(depositBtn().textContent).toBe('✅ $20.00 → 💻 Laptop');
  });

  it('fundName 缺省 → 按钮回退 "your fund"', () => {
    setup({ fundName: undefined, fundEmoji: undefined });
    expect(depositBtn().textContent).toBe('✅ $20.00 → your fund');
  });

  it('存入成功: 恰一次 POST body={challengeId, action, fundId}; onDeposited 收到完整 result', async () => {
    const { props } = setup();
    mockedApiFetch.mockResolvedValueOnce(PAYLOAD);
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/buddy/deposit', {
      method: 'POST',
      body: { challengeId: 'ch-1', action: 'deposit', fundId: 'fund-1' },
    });
    expect(props.onDeposited).toHaveBeenCalledTimes(1);
    expect(props.onDeposited).toHaveBeenCalledWith(PAYLOAD);
  });

  it('庆祝视图: 渲染服务器返回 newCurrent/target/progress(40%)/bonusTokens', async () => {
    setup();
    mockedApiFetch.mockResolvedValueOnce(PAYLOAD);
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('$120');
    expect(document.body.textContent).toContain('$300');
    expect(document.body.textContent).toContain('+5');
    expect(document.body.querySelector('[style*="width: 40%"]')).toBeTruthy();
  });

  it('进度钳 100% (progress=150) 与 target≥SAVINGS_FUND_TARGET 显示 ∞', async () => {
    setup();
    mockedApiFetch.mockResolvedValueOnce({ ...PAYLOAD, progress: 150, target: 2147483647 });
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(document.body.querySelector('[style*="width: 100%"]')).toBeTruthy();
    expect(document.body.textContent).toContain('∞');
  });

  it('goalReached=true → 显示 Goal Reached 文案', async () => {
    setup();
    mockedApiFetch.mockResolvedValueOnce({ ...PAYLOAD, goalReached: true });
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('Goal Reached! 🎉');
  });

  it('DM-6: loading 中同 tick 双击只发一次 API (ref guard)', async () => {
    setup();
    const d = deferred<typeof PAYLOAD>();
    mockedApiFetch.mockReturnValueOnce(d.promise);
    await act(async () => {
      fireEvent.click(depositBtn());
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    d.resolve(PAYLOAD);
    await act(async () => {});
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('DM-5-FINAL: loading 中按钮 disabled 且点击遮罩不关闭; 成功后庆祝照常', async () => {
    const { props } = setup();
    const d = deferred<typeof PAYLOAD>();
    mockedApiFetch.mockReturnValueOnce(d.promise);
    const btn = depositBtn();
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });
    expect(btn.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(backdrop());
      await Promise.resolve();
    });
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      d.resolve(PAYLOAD);
      await Promise.resolve();
    });
    expect(props.onDeposited).toHaveBeenCalledTimes(1);
  });

  it('非 loading 点击遮罩 → safeClose 立即关闭一次', () => {
    const { props } = setup();
    fireEvent.click(backdrop());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('庆祝 4s 自动关闭且只关一次 (timer 清引用)', async () => {
    const { props } = setup();
    mockedApiFetch.mockResolvedValueOnce(PAYLOAD);
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(3999);
      await Promise.resolve();
    });
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('Continue 按钮 → 立即 safeClose, 自动 timer 不再重复关', async () => {
    const { props } = setup();
    mockedApiFetch.mockResolvedValueOnce(PAYLOAD);
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue →' }));
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('卸载清理: 庆祝期间卸载, 4s 后不再 onClose (MEDIUM-6)', async () => {
    const { props, unmount } = setup();
    mockedApiFetch.mockResolvedValueOnce(PAYLOAD);
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('非 409 失败: error 视图 + onClose 不调; Try Again 回选择卡且可重试 (ref 重置)', async () => {
    const { props } = setup();
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('Failed. Try again.');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onDeposited).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
      await Promise.resolve();
    });
    expect(depositBtn()).toBeTruthy();

    mockedApiFetch.mockResolvedValueOnce(PAYLOAD);
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(props.onDeposited).toHaveBeenCalledTimes(1);
  });

  it('409 幂等 (DM-2): 庆祝视图 + 0/0 占位假进度 (v8 #8-③ 现状固化), onDeposited 不调, 4s 自动关', async () => {
    const { props } = setup();
    mockedApiFetch.mockRejectedValueOnce(Object.assign(new Error('Already deposited'), { status: 409 }));
    await act(async () => {
      fireEvent.click(depositBtn());
      await Promise.resolve();
    });
    expect(props.onDeposited).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('$0');
    expect(document.body.querySelector('[style*="width: 0%"]')).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('skip: 单次 POST body 无 fundId; onSkipped 恰一次; 3s 自动关', async () => {
    const { props } = setup();
    mockedApiFetch.mockResolvedValueOnce({ success: true });
    await act(async () => {
      fireEvent.click(skipBtn());
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/buddy/deposit', {
      method: 'POST',
      body: { challengeId: 'ch-1', action: 'skip' },
    });
    expect(props.onSkipped).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('freedom');
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('skip 失败: 直接 safeClose 且不调 onSkipped', async () => {
    const { props } = setup();
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      fireEvent.click(skipBtn());
      await Promise.resolve();
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSkipped).not.toHaveBeenCalled();
  });
});
