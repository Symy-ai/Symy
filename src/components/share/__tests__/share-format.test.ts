import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/freedom-time', () => ({
  formatFreedomTime: vi.fn((h: number, locale: string) => `${locale}:${h >= 1 ? `${Math.round(h)}小时` : `${Math.round(h * 60)}分钟`}`),
}));

import { MILESTONE_THRESHOLDS, formatHoursNumber, formatShareHoursLabel, getMilestoneState } from '../share-format';
import { formatFreedomTime } from '@/lib/freedom-time';

const mockFFT = vi.mocked(formatFreedomTime);

/**
 * share-format.ts (60行) — 晒卡格式化叶子 (arch 批1 F4 环消除件)。
 *
 * 面子/里子铁律 (owner 09-06): 金额永不进卡 — 全函数只处理赢回小时。
 *
 * 锁定:
 * - formatHoursNumber: ≥10 取整 / <10 保 1 位 / 亚小时(0.05)+0+负+NaN+∞ → ''
 * - formatShareHoursLabel: 同门卫 + 委托 formatFreedomTime (同向取整)
 * - getMilestoneState: 10/50/100 三档; unlocked 门=首档; next/remaining
 */
describe('formatHoursNumber 纯数字槽', () => {
  it('≥10 取整 / <10 保 1 位', () => {
    expect(formatHoursNumber(68)).toBe('68');
    expect(formatHoursNumber(68.4)).toBe('68');
    expect(formatHoursNumber(9.26)).toBe('9.3');
    expect(formatHoursNumber(0.5)).toBe('0.5');
  });

  it('亚小时+0+负+NaN+∞ → 空串 (调用方走兜底文案)', () => {
    expect(formatHoursNumber(0.05)).toBe('');
    expect(formatHoursNumber(0)).toBe('');
    expect(formatHoursNumber(-3)).toBe('');
    expect(formatHoursNumber(Number.NaN)).toBe('');
    expect(formatHoursNumber(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('formatShareHoursLabel 完整标签', () => {
  it('有效值委托 formatFreedomTime (locale 透传)', () => {
    expect(formatShareHoursLabel(5.5, 'zh')).toBe('zh:5.5小时'.replace('5.5', '6'));
    expect(mockFFT).toHaveBeenCalledWith(5.5, 'zh');
  });

  it('亚小时分钟面 (QA 冒烟边界 #4/#5: 同一笔拦截两面数字一致)', () => {
    expect(formatShareHoursLabel(0.5, 'zh')).toBe('zh:30分钟');
  });

  it('同门卫: 0.05/0/负/NaN → 空串', () => {
    expect(formatShareHoursLabel(0.05, 'zh')).toBe('');
    expect(formatShareHoursLabel(0, 'zh')).toBe('');
    expect(formatShareHoursLabel(-1, 'zh')).toBe('');
    expect(formatShareHoursLabel(Number.NaN, 'zh')).toBe('');
  });
});

describe('getMilestoneState 里程碑', () => {
  it('阈值三档 10/50/100', () => {
    expect([...MILESTONE_THRESHOLDS]).toEqual([10, 50, 100]);
  });

  it('9 → 未解锁 next=10 remaining=1; 10 → 解锁 next=50', () => {
    const s9 = getMilestoneState(9);
    expect(s9.unlocked).toBe(false);
    expect(s9.next).toBe(10);
    expect(s9.remaining).toBe(1);
    const s10 = getMilestoneState(10);
    expect(s10.unlocked).toBe(true);
    expect(s10.next).toBe(50);
    expect(s10.remaining).toBe(40);
  });

  it('小数 24.9 → floor 24 (remaining 26); 100+ → 满级 next=null remaining=0', () => {
    const s = getMilestoneState(24.9);
    expect(s.count).toBe(24);
    expect(s.remaining).toBe(26);
    const full = getMilestoneState(150);
    expect(full.next).toBeNull();
    expect(full.remaining).toBe(0);
    expect(full.unlocked).toBe(true);
  });

  it('0/负/NaN → count=0 未解锁', () => {
    expect(getMilestoneState(0).count).toBe(0);
    expect(getMilestoneState(-5).unlocked).toBe(false);
    expect(getMilestoneState(Number.NaN).count).toBe(0);
  });
});
