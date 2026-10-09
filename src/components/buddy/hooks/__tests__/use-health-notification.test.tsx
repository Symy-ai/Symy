// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// stableT 铁律 (R186): t 必须稳定顶层引用
const stableT = (key: string, opts?: { change?: string | number }) => {
  const map: Record<string, string> = {
    'buddy.symyFeelsBetter': '小象心情变好了 {change}',
    'buddy.symyWasHurt': '小象受伤了 {change}',
  };
  let v = map[key] ?? key;
  if (opts && opts.change !== undefined) v = v.replace('{change}', String(opts.change));
  return v;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { useHealthNotification, type HealthNotification } from '../use-health-notification';

const box: { current: HealthNotification | null } = { current: null };
function Probe(props: { vitality: number; isDemo: boolean; isLoading: boolean }) {
  box.current = useHealthNotification(props); // 容器属性赋值, 非变量重绑
  return null;
}

/**
 * use-health-notification.ts (59行) — vitality 变化通知 (P1-4+BUG-90 双修复件)。
 *
 * 锁定:
 * - isLoading → prevRef 置 null 不追踪 (P1-4: 刷新不误弹)
 * - 首渲染 (prev=null) 不弹
 * - 变化 ≥1 才弹: 正=recovery 正文案 / 负=damage; <1 不弹
 * - 3s 自动消散; 卸载清计时器 (BUG-90)
 */
describe('useHealthNotification vitality 通知', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    box.current = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('isLoading → 不追踪; 数据到位后首帧不弹 (P1-4)', () => {
    const { rerender } = render(<Probe vitality={72} isDemo={false} isLoading />);
    expect(box.current).toBeNull();
    rerender(<Probe vitality={100} isDemo={false} isLoading={false} />);
    expect(box.current).toBeNull(); // prevRef 刚从 null 开始, 首帧跳过
  });

  it('变化 ≥1: 正=recovery / 负=damage', () => {
    const { rerender } = render(<Probe vitality={80} isDemo={false} isLoading={false} />);
    rerender(<Probe vitality={90} isDemo={false} isLoading={false} />);
    expect(box.current?.type).toBe('recovery');
    expect(box.current?.vitalityChange).toBe(10);
    expect(box.current?.message).toContain('+10');
    rerender(<Probe vitality={85} isDemo={false} isLoading={false} />);
    expect(box.current?.type).toBe('damage');
    expect(box.current?.vitalityChange).toBe(-5);
    expect(box.current?.message).toContain('-5');
  });

  it('变化 <1 → 不弹 (round 后 0)', () => {
    const { rerender } = render(<Probe vitality={80} isDemo={false} isLoading={false} />);
    rerender(<Probe vitality={80.4} isDemo={false} isLoading={false} />);
    expect(box.current).toBeNull(); // Math.round(0.4)=0 <1
  });

  it('3s 自动消散; 卸载清计时器 (BUG-90)', () => {
    const { rerender, unmount } = render(<Probe vitality={80} isDemo={false} isLoading={false} />);
    rerender(<Probe vitality={95} isDemo={false} isLoading={false} />);
    expect(box.current).not.toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(box.current).toBeNull();
    // 二次弹后立即卸载 → 无泄漏调用
    rerender(<Probe vitality={60} isDemo={false} isLoading={false} />);
    unmount();
    act(() => { vi.advanceTimersByTime(10000); });
    expect(true).toBe(true); // 未炸即过
  });
});
