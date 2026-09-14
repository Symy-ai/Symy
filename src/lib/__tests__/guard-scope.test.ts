/**
 * guard-scope 纯函数 SSOT 单测 (batch53-b)
 *
 * 覆盖: normalize 损坏降级全默认 / prompt 行生成 (全默认空串 = 现状逐字节
 * 一致的回归锚点) / 品类与模式合法性校验 / 三态判定 / 地图小结计数。
 */

import { describe, expect, it } from 'vitest';
import {
  GUARD_SCOPE_CATEGORIES,
  buildGuardScopePromptLine,
  defaultGuardScope,
  guardScopeSummary,
  isCategoryExempt,
  isCategoryStrict,
  isGuardScopeCategory,
  isGuardScopeMode,
  isGuardScopeDefault,
  normalizeGuardScope,
  type GuardScope,
} from '../guard-scope';

describe('normalizeGuardScope', () => {
  it('缺失/undefined → 全默认 guard', () => {
    expect(normalizeGuardScope(undefined)).toEqual(defaultGuardScope());
    expect(normalizeGuardScope(null)).toEqual(defaultGuardScope());
  });

  it('损坏 JSON 字符串 / 非对象 / 数组 → 全默认', () => {
    expect(normalizeGuardScope('{not json')).toEqual(defaultGuardScope());
    expect(normalizeGuardScope('42')).toEqual(defaultGuardScope());
    expect(normalizeGuardScope(['electronics'])).toEqual(defaultGuardScope());
    expect(normalizeGuardScope('null')).toEqual(defaultGuardScope());
  });

  it('JSON 字符串合法形状可解析 (localStorage 原始值)', () => {
    const scope = normalizeGuardScope('{"food":"exempt","clothing":"strict"}');
    expect(scope.food).toBe('exempt');
    expect(scope.clothing).toBe('strict');
    expect(scope.electronics).toBe('guard');
  });

  it('非法模式值 / 未知品类键逐键降级, 合法键保留', () => {
    const scope = normalizeGuardScope({ food: 'exempt', beauty: 'yolo', hacks: 'strict' } as unknown);
    expect(scope.food).toBe('exempt');
    expect(scope.beauty).toBe('guard');
    expect(isGuardScopeDefault(scope)).toBe(false);
  });

  it('全默认对象 → isGuardScopeDefault true', () => {
    expect(isGuardScopeDefault(normalizeGuardScope({ food: 'guard' }))).toBe(true);
  });
});

describe('合法性校验', () => {
  it('isGuardScopeCategory: 5 个已知品类 true, other/未知 false', () => {
    for (const c of GUARD_SCOPE_CATEGORIES) expect(isGuardScopeCategory(c)).toBe(true);
    expect(isGuardScopeCategory('other')).toBe(false);
    expect(isGuardScopeCategory('electronics ')).toBe(false);
    expect(isGuardScopeCategory(123)).toBe(false);
  });

  it('isGuardScopeMode: 三态 true, 其余 false', () => {
    for (const m of ['guard', 'exempt', 'strict'] as const) expect(isGuardScopeMode(m)).toBe(true);
    expect(isGuardScopeMode('balanced')).toBe(false);
    expect(isGuardScopeMode(undefined)).toBe(false);
  });
});

describe('buildGuardScopePromptLine', () => {
  it('全默认 → 空串 (prompt filter(Boolean) 掉, 与现状逐字节一致 — AC 回归锚点)', () => {
    expect(buildGuardScopePromptLine(defaultGuardScope())).toBe('');
    expect(buildGuardScopePromptLine(normalizeGuardScope(undefined))).toBe('');
  });

  it('豁免品类 → 注入 exempt 行, 列出品类且要求不追问', () => {
    const scope = { ...defaultGuardScope(), food: 'exempt', home: 'exempt' } as GuardScope;
    const line = buildGuardScopePromptLine(scope);
    expect(line).toContain('[GUARD SCOPE: exempt');
    expect(line).toContain('food');
    expect(line).toContain('home');
    expect(line).toContain('do NOT question the purchase');
    expect(line).not.toContain('GUARD SCOPE: strict');
  });

  it('加严品类 → 注入 strict 行', () => {
    const scope = { ...defaultGuardScope(), beauty: 'strict' } as GuardScope;
    const line = buildGuardScopePromptLine(scope);
    expect(line).toContain('[GUARD SCOPE: strict');
    expect(line).toContain('beauty');
    expect(line).not.toContain('GUARD SCOPE: exempt');
  });

  it('豁免 + 加严并存 → 两行都注入', () => {
    const scope = { ...defaultGuardScope(), food: 'exempt', clothing: 'strict' } as GuardScope;
    const line = buildGuardScopePromptLine(scope);
    expect(line).toContain('[GUARD SCOPE: exempt');
    expect(line).toContain('[GUARD SCOPE: strict');
    expect(line.split('\n\n')).toHaveLength(2);
  });
});

describe('三态判定与地图小结', () => {
  const scope: GuardScope = { ...defaultGuardScope(), food: 'exempt', clothing: 'strict' };

  it('isCategoryExempt / isCategoryStrict', () => {
    expect(isCategoryExempt(scope, 'food')).toBe(true);
    expect(isCategoryStrict(scope, 'food')).toBe(false);
    expect(isCategoryStrict(scope, 'clothing')).toBe(true);
    expect(isCategoryExempt(scope, 'home')).toBe(false);
  });

  it('guardScopeSummary: 3 守护 / 1 豁免 / 1 加严, 共 5', () => {
    expect(guardScopeSummary(scope)).toEqual({ guarded: 3, exempt: 1, strict: 1, total: 5 });
    expect(guardScopeSummary(defaultGuardScope())).toEqual({ guarded: 5, exempt: 0, strict: 0, total: 5 });
  });
});
