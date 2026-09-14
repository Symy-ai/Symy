/**
 * guardian-style 预设映射纯函数测试 (batch61-a)
 *
 * 验收红线: 每个预设的映射结果在此逐字段锁死; 微调 patch 不半写、不改入参。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GUARDIAN_STYLE_PRESET,
  GUARDIAN_STYLE_PRESETS,
  applyGuardianStylePlanPatch,
  buildGuardianStylePlan,
  isGuardianStylePreset,
  normalizeGuardianStylePreset,
  type GuardianStylePlan,
} from '@/lib/guardian-style';
import { GUARD_SCOPE_CATEGORIES, type GuardScope } from '@/lib/guard-scope';
import type { GuardIntensity } from '@/lib/guard-intensity';

function expectScope(plan: GuardianStylePlan, mode: 'guard' | 'exempt' | 'strict') {
  for (const category of GUARD_SCOPE_CATEGORIES) {
    expect(plan.guardScope[category], category).toBe(mode);
  }
}

describe('guardian-style 预设 → 计划映射 (逐字段锁死)', () => {
  it('温柔陪伴 gentleCompanion: gentle / standard / weekly / 全 guard', () => {
    const plan = buildGuardianStylePlan('gentleCompanion');
    expect(plan.guardIntensity).toBe('gentle');
    expect(plan.nightWindow).toBe('standard');
    expect(plan.pushFrequency).toBe('weekly');
    expectScope(plan, 'guard');
  });

  it('均衡守护 balancedGuard: balanced / standard / daily / 全 guard (= app 默认)', () => {
    const plan = buildGuardianStylePlan('balancedGuard');
    expect(plan.guardIntensity).toBe('balanced');
    expect(plan.nightWindow).toBe('standard');
    expect(plan.pushFrequency).toBe('daily');
    expectScope(plan, 'guard');
  });

  it('严格教练 strictCoach: strict / early / daily / 全 strict', () => {
    const plan = buildGuardianStylePlan('strictCoach');
    expect(plan.guardIntensity).toBe('strict');
    expect(plan.nightWindow).toBe('early');
    expect(plan.pushFrequency).toBe('daily');
    expectScope(plan, 'strict');
  });

  it('夜间轻守 nightLightGuard: gentle / nightOwl / off / 全 guard', () => {
    const plan = buildGuardianStylePlan('nightLightGuard');
    expect(plan.guardIntensity).toBe('gentle');
    expect(plan.nightWindow).toBe('nightOwl');
    expect(plan.pushFrequency).toBe('off');
    expectScope(plan, 'guard');
  });

  it('四个预设两两互异', () => {
    const serializations = GUARDIAN_STYLE_PRESETS.map((preset) => JSON.stringify(buildGuardianStylePlan(preset)));
    expect(new Set(serializations).size).toBe(GUARDIAN_STYLE_PRESETS.length);
  });

  it('每次调用返回全新 guardScope 引用, 预设之间不共享可变状态', () => {
    const a = buildGuardianStylePlan('gentleCompanion');
    const b = buildGuardianStylePlan('gentleCompanion');
    expect(a.guardScope).not.toBe(b.guardScope);
    // 类型上只读, 断言引用独立需绕过只读视图模拟外部篡改
    (a.guardScope as { food: string }).food = 'exempt';
    expect(b.guardScope.food).toBe('guard');
  });
});

describe('guardian-style 预设归一化', () => {
  it('垃圾输入 → balancedGuard (与 app 默认一致)', () => {
    expect(DEFAULT_GUARDIAN_STYLE_PRESET).toBe('balancedGuard');
    expect(normalizeGuardianStylePreset(undefined)).toBe('balancedGuard');
    expect(normalizeGuardianStylePreset(null)).toBe('balancedGuard');
    expect(normalizeGuardianStylePreset(42)).toBe('balancedGuard');
    expect(normalizeGuardianStylePreset('StrictCoach')).toBe('balancedGuard');
    expect(normalizeGuardianStylePreset({ preset: 'strictCoach' })).toBe('balancedGuard');
  });

  it('合法值原样通过, isGuardianStylePreset 正确收窄', () => {
    for (const preset of GUARDIAN_STYLE_PRESETS) {
      expect(normalizeGuardianStylePreset(preset)).toBe(preset);
      expect(isGuardianStylePreset(preset)).toBe(true);
    }
    expect(isGuardianStylePreset('balanced')).toBe(false);
    expect(isGuardianStylePreset('')).toBe(false);
  });
});

describe('applyGuardianStylePlanPatch 微调合并', () => {
  const base = buildGuardianStylePlan('balancedGuard');

  it('只改被 patch 的字段, 其余字段原样', () => {
    const next = applyGuardianStylePlanPatch(base, { guardIntensity: 'strict' });
    expect(next.guardIntensity).toBe('strict');
    expect(next.nightWindow).toBe(base.nightWindow);
    expect(next.pushFrequency).toBe(base.pushFrequency);
    expect(next.guardScope).toEqual(base.guardScope);
  });

  it('纯函数: 入参 plan 与其 guardScope 不被改动', () => {
    const snapshot = JSON.stringify(base);
    applyGuardianStylePlanPatch(base, {
      guardIntensity: 'gentle',
      nightWindow: 'off',
      pushFrequency: 'off',
      guardScope: GUARD_SCOPE_CATEGORIES.reduce<GuardScope>(
        (acc, category) => ({ ...acc, [category]: 'strict' }),
        {} as GuardScope,
      ),
    });
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('guardScope 单品类微调: 目标品类变档, 其余品类与原计划不动', () => {
    const next = applyGuardianStylePlanPatch(base, { guardScope: { ...base.guardScope, food: 'exempt' } });
    expect(next.guardScope.food).toBe('exempt');
    expect(next.guardScope.electronics).toBe('guard');
    expect(base.guardScope.food).toBe('guard');
  });

  it('guardScope patch 为整表替换语义: 缺失品类经 normalize 落回 guard', () => {
    const next = applyGuardianStylePlanPatch(base, { guardScope: { food: 'strict' } as unknown as GuardScope });
    expect(next.guardScope.food).toBe('strict');
    expect(next.guardScope.electronics).toBe('guard');
    expect(next.guardScope.clothing).toBe('guard');
  });

  it('非法 patch 值整字段忽略, 不半写', () => {
    const next = applyGuardianStylePlanPatch(base, {
      guardIntensity: 'extreme' as unknown as GuardIntensity,
      nightWindow: 'midnight' as unknown as GuardianStylePlan['nightWindow'],
      pushFrequency: 'hourly' as unknown as GuardianStylePlan['pushFrequency'],
      guardScope: 'garbage' as unknown as GuardScope,
    });
    expect(next.guardIntensity).toBe(base.guardIntensity);
    expect(next.nightWindow).toBe(base.nightWindow);
    expect(next.pushFrequency).toBe(base.pushFrequency);
    expect(next.guardScope).toEqual(base.guardScope);
  });

  it('空 patch 返回等值副本', () => {
    const next = applyGuardianStylePlanPatch(base, {});
    expect(next).toEqual(base);
    expect(next).not.toBe(base);
  });
});
