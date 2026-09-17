/**
 * format helpers 边界补测 (batch78-c — testgap v9 §十五.3 观察名单, 纯测试)
 *
 * 覆盖 (断言与现状对齐, 现状固化 ≠ 认可理想行为):
 *  - formatCurrencyShort K 段四舍五入溢出: 999_999 → "$1000.0K"
 *    (999999/1000 = 999.999 → toFixed(1) 进位为 "1000.0", 数值已越 1000 却仍挂 K 段)
 *  - M 段同型溢出: 999_999_999 → "$1000.0M" (与 K 段同根, 一并固化)
 *  - 换段阈值: 1_000_000 → "$1.0M" (M 段起点, 与上一行构成跨段对照)
 *  - ≥1e27 指数畸形边界 (v8 已录): abs/1e6 ≥ 1e21 时 toFixed 返回指数形式
 *    → "$1e+21M" 等畸形输出; 无害固化 = 不抛错 + 固化当前输出形态, 防静默回归
 *  - null/undefined/NaN 守卫现状: "$0" / "$NaN"
 *
 * locale 依赖: 全局 vitest env 为 node (无 window) → getCurrentLocale 恒 'en' → '$'。
 * 若本文件改跑 happy-dom, localStorage('symy-locale')/navigator 会影响货币符号。
 */

import { describe, it, expect } from 'vitest';
import { formatCurrencyShort } from '../format';

describe('formatCurrencyShort — K/M 段四舍五入溢出现状固化 (v9 §十五.3)', () => {
  it('999_999 → "$1000.0K": K 段 toFixed(1) 进位溢出, 数值越段但后缀仍为 K', () => {
    expect(formatCurrencyShort(999_999)).toBe('$1000.0K');
  });

  it('999_999_999 → "$1000.0M": M 段同型溢出 (同根现状)', () => {
    expect(formatCurrencyShort(999_999_999)).toBe('$1000.0M');
  });

  it('1_000_000 → "$1.0M": M 段起点 (跨段对照, 溢出值未跨段)', () => {
    expect(formatCurrencyShort(1_000_000)).toBe('$1.0M');
  });
});

describe('formatCurrencyShort — ≥1e27 指数畸形边界无害固化 (v8 已录)', () => {
  it('1e27 → "$1e+21M": abs/1e6 达 1e21, toFixed 退化为指数形式', () => {
    expect(formatCurrencyShort(1e27)).toBe('$1e+21M');
  });

  it('2.5e27 → "$2.5e+21M": 指数尾数保留一位小数', () => {
    expect(formatCurrencyShort(2.5e27)).toBe('$2.5e+21M');
  });

  it('1e30 → "$1e+24M": 指数随量级增长, 仍不抛错', () => {
    expect(formatCurrencyShort(1e30)).toBe('$1e+24M');
  });
});

describe('formatCurrencyShort — 空值守卫现状', () => {
  it('null / undefined → "$0"', () => {
    expect(formatCurrencyShort(null)).toBe('$0');
    expect(formatCurrencyShort(undefined)).toBe('$0');
  });

  it('NaN → "$0" (isNaN 与 null 同守卫, 与 formatCurrency 的 "$0" 口径一致)', () => {
    expect(formatCurrencyShort(NaN)).toBe('$0');
  });
});
