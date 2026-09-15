// @vitest-environment happy-dom
/**
 * batch76-b — lib/hooks/use-spending-cap.ts 现状固化（testgap v8 D12 载体 + v9 净新增邻域）
 *
 * D12 断言点（先用测试固定现状再判定是否 bug）：
 *   setAmount 清洗链 `replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')` 对
 *   '1.2.3' → '1.23'（直觉）但 '1.2.3.4' → '1.2.34'（仍留两个小数点，反直觉）。
 *   贪婪回溯使多小数点只在「恰好 3 段」时收敛为 1 个，4 段起残留 2 个。
 *
 * useSpendingCap 为 react-query 薄层：断言 queryKey 常量、请求 URL、enabled 门控。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api-client';
import { useSpendingCap, useSpendingCapForm, SPENDING_CAP_KEY } from '@/lib/hooks/use-spending-cap';

describe('useSpendingCapForm — setAmount 清洗链（D12 现状固化）', () => {
  function renderForm() {
    return renderHook(() => useSpendingCapForm());
  }

  it('starts with empty draft', () => {
    const { result } = renderForm();
    expect(result.current.draft).toBe('');
  });

  it('passes through well-formed decimal input untouched', () => {
    const { result } = renderForm();
    act(() => result.current.setAmount('89.50'));
    expect(result.current.draft).toBe('89.50');
  });

  it('strips non-numeric characters (sign, exponent, spaces, symbols)', () => {
    const { result } = renderForm();
    act(() => result.current.setAmount('-5'));
    expect(result.current.draft).toBe('5'); // 负号被剥 — 无法输入负上限
    act(() => result.current.setAmount('1e5'));
    expect(result.current.draft).toBe('15');
    act(() => result.current.setAmount('10 %'));
    expect(result.current.draft).toBe('10');
    act(() => result.current.setAmount('abc'));
    expect(result.current.draft).toBe('');
  });

  it("D12: '1.2.3' → '1.23'（三段收敛为单个小数点）", () => {
    const { result } = renderForm();
    act(() => result.current.setAmount('1.2.3'));
    expect(result.current.draft).toBe('1.23');
  });

  it("D12 反直觉现状: '1.2.3.4' → '1.2.34'（四段仍残留两个小数点）", () => {
    const { result } = renderForm();
    act(() => result.current.setAmount('1.2.3.4'));
    expect(result.current.draft).toBe('1.2.34'); // 贪婪回溯只吃掉第 2 个点 — 已记 /tmp/b76b-defects.md
  });

  it('adjacent dots collapse to one', () => {
    const { result } = renderForm();
    act(() => result.current.setAmount('12..5'));
    expect(result.current.draft).toBe('12.5');
  });

  it('simulated keystroke typing keeps a single trailing dot alive', () => {
    const { result } = renderForm();
    act(() => result.current.setAmount('5'));
    act(() => result.current.setAmount('5.'));
    expect(result.current.draft).toBe('5.');
    act(() => result.current.setAmount('5.0'));
    expect(result.current.draft).toBe('5.0');
  });
});

describe('useSpendingCap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  function makeWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
  }

  const fixture = {
    state: null,
    setting: { capCents: 10000, periodStart: '2026-09-01T00:00:00.000Z', warningPct: 80 },
    events: [],
    categories: [],
    daysLeft: 16,
  };

  it('exposes the stable query key constant', () => {
    expect(SPENDING_CAP_KEY).toEqual(['spending-cap']);
  });

  it('fetches GET /api/buddy/spending-cap and returns the payload', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(fixture);
    const { result } = renderHook(() => useSpendingCap(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith('/api/buddy/spending-cap');
    expect(result.current.data).toEqual(fixture);
  });

  it('enabled=false skips the network entirely', async () => {
    const { result } = renderHook(() => useSpendingCap(false), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
