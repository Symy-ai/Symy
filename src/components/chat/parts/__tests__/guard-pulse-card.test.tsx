// @vitest-environment happy-dom

/**
 * GuardPulseCard 测试 (batch68-c)
 *
 * 覆盖验收:
 * 1. ok 态三层: 概览 (近 28 天次数/天数) → 高风险时段行 (小时区间/等级/
 *    拦截采纳天数/时段前建议) → 注释行
 * 2. 跨零点区间显示 (23:00–00:00 + 跨零点标注); 单小时区间显示
 * 3. insufficient 引导态: 不渲染数字行
 * 4. 红线: 零金额零碳数值; 节奏框架非评判 (无失败人格标签措辞)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GuardPulseCard } from '../guard-pulse-card';
import zh from '../../../../i18n/messages/zh.json';
import type { GuardPulseCardData } from '@/types/guard-pulse';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const path = key.replace(/^chat\./, '').split('.');
      const raw = path.reduce<unknown>(
        (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
        zh.chat as unknown as Record<string, unknown>,
      );
      let out = typeof raw === 'string' ? raw : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
      }
      return out;
    },
    locale: 'zh',
  }),
}));

const OK_CARD: GuardPulseCardData = {
  status: 'ok',
  lookbackDays: 28,
  resolvedTimezone: 'UTC',
  totalIntercepts: 6,
  totalAdoptions: 2,
  activeDays: 5,
  hours: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    intercepts: hour === 23 ? 4 : hour === 0 ? 2 : hour === 12 ? 2 : 0,
    adoptions: hour === 12 ? 2 : 0,
    activeDays: hour === 23 ? 4 : hour === 0 ? 2 : hour === 12 ? 3 : 0,
  })),
  windows: [
    {
      hours: [0, 23],
      startHour: 23,
      endHour: 0,
      wrapsMidnight: true,
      intercepts: 6,
      adoptions: 0,
      activeDays: 5,
      density: 1.2,
      level: 'medium',
      suggestion: 'delay_24h',
    },
    {
      hours: [12],
      startHour: 12,
      endHour: 12,
      wrapsMidnight: false,
      intercepts: 2,
      adoptions: 2,
      activeDays: 3,
      density: 1.33,
      level: 'high',
      suggestion: 'wishlist_next_noon',
    },
  ],
  totalSample: 8,
};

afterEach(() => cleanup());

describe('GuardPulseCard — ok 态结构', () => {
  it('概览: 近 28 天次数/天数 (只显示小时/次数/天数)', () => {
    render(<GuardPulseCard data={OK_CARD} />);
    const overview = screen.getByTestId('guard-pulse-overview').textContent || '';
    expect(overview).toContain('28');
    expect(overview).toContain('8');
    expect(overview).toContain('5');
    expect(screen.getByTestId('guard-pulse-card').getAttribute('data-status')).toBe('ok');
  });

  it('两个时段行: 跨零点区间 + 等级 chip + 次数/天数统计', () => {
    render(<GuardPulseCard data={OK_CARD} />);
    expect(screen.getByTestId('guard-pulse-windows').children).toHaveLength(2);
    const night = screen.getByTestId('guard-pulse-window-0');
    expect(night.getAttribute('data-level')).toBe('medium');
    expect(night.textContent).toContain('23:00–00:00');
    expect(night.textContent).toContain('跨零点');
    expect(screen.getByTestId('guard-pulse-window-0-stats').textContent).toContain('拦截 6 次');
    const lunch = screen.getByTestId('guard-pulse-window-1');
    expect(lunch.getAttribute('data-level')).toBe('high');
    expect(lunch.textContent).toContain('12:00');
    expect(lunch.textContent).not.toContain('跨零点');
  });

  it('时段前建议: 三个可执行动作文案各就各位', () => {
    render(<GuardPulseCard data={OK_CARD} />);
    expect(screen.getByTestId('guard-pulse-window-0-suggestion').textContent).toContain('延后 24 小时');
    expect(screen.getByTestId('guard-pulse-window-1-suggestion').textContent).toContain('收藏夹');
  });

  it('注释行: 节奏框架非评判, 无失败人格标签措辞', () => {
    render(<GuardPulseCard data={OK_CARD} />);
    const note = screen.getByTestId('guard-pulse-note').textContent || '';
    expect(note).toContain('不是评判');
    expect(note).not.toMatch(/失控|成瘾|失败|诊断|无可救药/);
  });
});

describe('GuardPulseCard — 引导态与红线', () => {
  it('insufficient: 引导文案, 不渲染概览/时段行', () => {
    render(<GuardPulseCard data={{ ...OK_CARD, status: 'insufficient', windows: [] }} />);
    expect(screen.getByTestId('guard-pulse-card').getAttribute('data-status')).toBe('insufficient');
    expect(screen.getByTestId('guard-pulse-insufficient').textContent).toContain('攒');
    expect(screen.queryByTestId('guard-pulse-overview')).toBeNull();
    expect(screen.queryByTestId('guard-pulse-windows')).toBeNull();
  });

  it('整卡零金额零碳数值', () => {
    render(<GuardPulseCard data={OK_CARD} />);
    const text = screen.getByTestId('guard-pulse-card').textContent || '';
    expect(text).not.toMatch(/\$|¥|元|carbon|kg/i);
  });
});
