// @vitest-environment happy-dom

/**
 * ImpulseForecastCard 测试 (batch62-c)
 *
 * 覆盖验收:
 * 1. ok 态三层: 概览 (高/中/低 + 最高类别 + 样本) → 逐日 7 行 (星期/等级/时段)
 *    → 准备建议 (复用既有入口三条) + 注释行
 * 2. 单轮追问: focusDay 对应行高亮 (data-focus)
 * 3. insufficient 引导态: 不渲染数字行
 * 4. 红线: 零金额零碳数值; 提前准备框架 (无 "你会失控" 措辞)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ImpulseForecastCard } from '../impulse-forecast-card';
import zh from '../../../../i18n/messages/zh.json';
import type { ImpulseForecastCardData } from '@/types/impulse-forecast';

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
        for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
      }
      return out;
    },
    locale: 'zh',
  }),
}));

const DAYS: ImpulseForecastCardData['days'] = [
  { dayKey: '2026-8-9', weekday: 2, level: 'medium', primaryCategory: 'beauty', dangerWindow: 'evening', sample: 6 },
  { dayKey: '2026-8-10', weekday: 3, level: 'high', primaryCategory: 'electronics', dangerWindow: 'lateNight', sample: 8 },
  { dayKey: '2026-8-11', weekday: 4, level: 'low', primaryCategory: null, dangerWindow: null, sample: 3 },
  { dayKey: '2026-8-12', weekday: 5, level: 'insufficient', primaryCategory: null, dangerWindow: null, sample: 1 },
  { dayKey: '2026-8-13', weekday: 6, level: 'insufficient', primaryCategory: null, dangerWindow: null, sample: 0 },
  { dayKey: '2026-8-14', weekday: 0, level: 'medium', primaryCategory: 'food', dangerWindow: 'evening', sample: 4 },
  { dayKey: '2026-8-15', weekday: 1, level: 'low', primaryCategory: null, dangerWindow: 'daytime', sample: 3 },
];

const OK_CARD: ImpulseForecastCardData = {
  status: 'ok',
  highDays: 1,
  mediumDays: 2,
  lowDays: 2,
  topCategory: 'electronics',
  days: DAYS,
  totalSample: 23,
};

afterEach(() => cleanup());

describe('ImpulseForecastCard — ok 态三层结构', () => {
  it('概览: 高/中/低天数 + 最高类别 + 样本量 (次数/天数 only)', () => {
    render(<ImpulseForecastCard data={OK_CARD} />);
    const overview = screen.getByTestId('impulse-forecast-overview').textContent || '';
    expect(overview).toContain('1');
    expect(overview).toContain('2');
    expect(screen.getByTestId('impulse-forecast-top-category').textContent).toContain('电子数码');
    expect(screen.getByTestId('impulse-forecast-sample').textContent).toContain('23');
    expect(screen.getByTestId('impulse-forecast-card').getAttribute('data-status')).toBe('ok');
  });

  it('逐日 7 行: 星期标签 + 等级 + 时段/类别, 行号锚定', () => {
    render(<ImpulseForecastCard data={OK_CARD} />);
    expect(screen.getByTestId('impulse-forecast-days').children).toHaveLength(7);
    const highRow = screen.getByTestId('impulse-forecast-day-1');
    expect(highRow.getAttribute('data-level')).toBe('high');
    expect(highRow.textContent).toContain('周四');
    expect(highRow.textContent).toContain('深夜');
    expect(highRow.textContent).toContain('电子数码');
    const lowRow = screen.getByTestId('impulse-forecast-day-2');
    expect(lowRow.getAttribute('data-level')).toBe('low');
    expect(screen.getByTestId('impulse-forecast-day-0').textContent).toContain('周三');
  });

  it('准备建议: 复用绿色替代/冷却/情绪守护三条既有入口', () => {
    render(<ImpulseForecastCard data={OK_CARD} />);
    const prep = screen.getByTestId('impulse-forecast-prep').textContent || '';
    expect(prep).toContain('绿色替代');
    expect(prep).toContain('愿望单');
    expect(prep).toContain('情绪守护');
  });

  it('注释行: 提前准备框架, 非预测不承诺准确率, 无失控措辞', () => {
    render(<ImpulseForecastCard data={OK_CARD} />);
    const note = screen.getByTestId('impulse-forecast-note').textContent || '';
    expect(note).toContain('不是预测');
    expect(note).not.toMatch(/失控|成瘾|诊断/);
  });
});

describe('ImpulseForecastCard — 单轮追问聚焦', () => {
  it('focusDay=1 → 对应行 data-focus, 其余行无标记', () => {
    render(<ImpulseForecastCard data={{ ...OK_CARD, focusDay: 1 }} />);
    expect(screen.getByTestId('impulse-forecast-day-1').getAttribute('data-focus')).toBe('true');
    expect(screen.getByTestId('impulse-forecast-day-0').getAttribute('data-focus')).toBeNull();
  });
});

describe('ImpulseForecastCard — 引导态与红线', () => {
  it('insufficient: 引导文案, 不渲染数字/逐日/建议', () => {
    render(<ImpulseForecastCard data={{ ...OK_CARD, status: 'insufficient' }} />);
    expect(screen.getByTestId('impulse-forecast-card').getAttribute('data-status')).toBe('insufficient');
    expect(screen.getByTestId('impulse-forecast-insufficient').textContent).toContain('攒');
    expect(screen.queryByTestId('impulse-forecast-overview')).toBeNull();
    expect(screen.queryByTestId('impulse-forecast-days')).toBeNull();
    expect(screen.queryByTestId('impulse-forecast-prep')).toBeNull();
  });

  it('整卡零金额零碳数值', () => {
    render(<ImpulseForecastCard data={OK_CARD} />);
    const text = screen.getByTestId('impulse-forecast-card').textContent || '';
    expect(text).not.toMatch(/\$|¥|元|carbon|kg/i);
  });
});
