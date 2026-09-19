/**
 * Tests for co2-estimate pure function (batch82-b)
 *
 * - 换算 = usd × 唯一系数常量 (函数输出与常量乘积严格一致)
 * - 边界: 0 / 负数 / NaN / ±Infinity → 0; 大数不漂移
 * - 未识别口径 → 0 (宁可不算, 不冒算)
 * - 常数单源断言 (红线: 禁散落): 系数字面量在模块源码中仅出现一次
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  co2FromUsdSaved,
  CO2_KG_PER_USD,
  CO2_METHODOLOGY,
  CO2_METHODOLOGY_DOC_URL,
  type Co2Methodology,
} from '../co2-estimate';

describe('co2FromUsdSaved', () => {
  it('multiplies the amount by the single published coefficient', () => {
    expect(co2FromUsdSaved(100)).toBeCloseTo(100 * CO2_KG_PER_USD, 10);
    expect(co2FromUsdSaved(1000)).toBeCloseTo(1000 * CO2_KG_PER_USD, 10);
    expect(co2FromUsdSaved(0.5)).toBeCloseTo(0.5 * CO2_KG_PER_USD, 10);
  });

  it('cleans invalid inputs to zero (0 / negative / NaN / ±Infinity)', () => {
    expect(co2FromUsdSaved(0)).toBe(0);
    expect(co2FromUsdSaved(-5)).toBe(0);
    expect(co2FromUsdSaved(Number.NaN)).toBe(0);
    expect(co2FromUsdSaved(Number.POSITIVE_INFINITY)).toBe(0);
    expect(co2FromUsdSaved(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('keeps large amounts exact at the coefficient product', () => {
    expect(co2FromUsdSaved(1e9)).toBeCloseTo(1e9 * CO2_KG_PER_USD, 6);
  });

  it('returns 0 for an unrecognized methodology, default for the published one', () => {
    expect(co2FromUsdSaved(100, 'mystery' as Co2Methodology)).toBe(0);
    expect(co2FromUsdSaved(100, CO2_METHODOLOGY)).toBeCloseTo(100 * CO2_KG_PER_USD, 10);
  });
});

describe('co2 constant — single source (red line)', () => {
  it('the numeric coefficient literal appears exactly once in the module source', () => {
    const source = readFileSync('src/lib/co2-estimate.ts', 'utf-8');
    const literals = source.match(/0\.14(?!\d)/g) ?? [];
    expect(literals.length).toBe(1);
    expect(source).toContain('CO2_KG_PER_USD = 0.14;');
  });

  it('exposes the open-source methodology doc URL used by the governance page', () => {
    expect(CO2_METHODOLOGY_DOC_URL).toContain('github.com/Symy-ai/Symy');
    expect(CO2_METHODOLOGY_DOC_URL.endsWith('src/lib/co2-estimate.ts')).toBe(true);
  });
});
