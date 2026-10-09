// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { usePatternAlert, type PatternAlertData } from '../use-pattern-alert';

type Ret = PatternAlertData | null;
const box: { current: Ret } = { current: null };
function Probe(props: { isDemo: boolean; userId?: string }) {
  box.current = usePatternAlert(props);
  return null;
}

const alertData: PatternAlertData = {
  alert: true,
  failedCount: 3,
  recentFailures: [{ itemName: '咖啡机', amount: 129, createdAt: '2026-10-01' }],
};

/**
 * use-pattern-alert.ts (30行) — 7 天失败模式探测 (P1-2, Round 91)。
 *
 * 锁定:
 * - isDemo/无 userId → 不 fetch, null
 * - alert=true → 设置数据
 * - alert=false → 不设置 (null 保持)
 * - fetch 失败 → 静默 warn, 不炸
 * - 卸载后 active 门 → 不 setState
 */
describe('usePatternAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    box.current = null;
  });
  afterEach(() => cleanup());

  it('isDemo/无 userId → 不 fetch', () => {
    render(<Probe isDemo userId="u1" />);
    expect(fetchMock).not.toHaveBeenCalled();
    cleanup();
    render(<Probe isDemo={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(box.current).toBeNull();
  });

  it('alert=true → 设置; alert=false → null 保持', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(alertData) });
    render(<Probe isDemo={false} userId="u1" />);
    await vi.waitFor(() => expect(box.current).toEqual(alertData));
    cleanup();
    box.current = null;
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ alert: false, failedCount: 0, recentFailures: [] }) });
    render(<Probe isDemo={false} userId="u1" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(box.current).toBeNull(); // alert=false 不设置
  });

  it('fetch 失败 → 静默不炸; 非 ok → null', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    render(<Probe isDemo={false} userId="u1" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(box.current).toBeNull();
    cleanup();
    fetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve(alertData) });
    render(<Probe isDemo={false} userId="u1" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(box.current).toBeNull(); // r.ok=false → null
  });
});
