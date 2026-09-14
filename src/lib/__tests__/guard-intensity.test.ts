/**
 * guard-intensity 纯函数单测 (batch48-a)
 *
 * 覆盖: 档位归一化 (缺省=balanced)、三种档位产出不同 prompt 指令、
 * balanced 指令为空串 (现状逐字节一致回归锚点)、拦截卡尾句开关、
 * 绿色替代卡 id → 微挑战品类映射。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GUARD_INTENSITY,
  GUARD_INTENSITIES,
  buildGuardIntensityPromptLine,
  greenAltIdToMicroChallengeCategory,
  isGuardIntensity,
  normalizeGuardIntensity,
  shouldShowAdoptConfirm,
  shouldShowChallengeInvite,
} from '../guard-intensity';

describe('normalizeGuardIntensity', () => {
  it('缺失/损坏输入归一化为 balanced (与现状一致的降级)', () => {
    expect(normalizeGuardIntensity(undefined)).toBe('balanced');
    expect(normalizeGuardIntensity(null)).toBe('balanced');
    expect(normalizeGuardIntensity('extreme')).toBe('balanced');
    expect(normalizeGuardIntensity(42)).toBe('balanced');
    expect(normalizeGuardIntensity('strict')).toBe('strict');
  });

  it('isGuardIntensity 只认三个合法档位', () => {
    for (const level of GUARD_INTENSITIES) expect(isGuardIntensity(level)).toBe(true);
    expect(isGuardIntensity('lockdown')).toBe(false);
  });

  it('默认档是 balanced', () => {
    expect(DEFAULT_GUARD_INTENSITY).toBe('balanced');
    expect(GUARD_INTENSITIES).toEqual(['gentle', 'balanced', 'strict']);
  });
});

describe('buildGuardIntensityPromptLine — persona prompt 档位指令', () => {
  it('三种档位产出互不相同的指令', () => {
    const gentle = buildGuardIntensityPromptLine('gentle');
    const balanced = buildGuardIntensityPromptLine('balanced');
    const strict = buildGuardIntensityPromptLine('strict');
    expect(new Set([gentle, balanced, strict]).size).toBe(3);
  });

  it('balanced 返回空串 — 默认档 prompt 与现状逐字节一致 (AC2 回归锚点)', () => {
    expect(buildGuardIntensityPromptLine('balanced')).toBe('');
  });

  it('gentle 指令含「只一次建议不追问」语义', () => {
    const line = buildGuardIntensityPromptLine('gentle');
    expect(line).toContain('[GUARD INTENSITY: gentle');
    expect(line).toMatch(/ONE alternative suggestion/);
    expect(line).toMatch(/NOT ask follow-up/);
  });

  it('strict 指令含追问 + 24h 微挑战引导', () => {
    const line = buildGuardIntensityPromptLine('strict');
    expect(line).toContain('[GUARD INTENSITY: strict');
    expect(line).toMatch(/follow up/i);
    expect(line).toMatch(/24-hour micro challenge/);
  });
});

describe('拦截卡尾句开关', () => {
  it('仅 strict 档出现微挑战入口 (gentle/balanced 均无)', () => {
    expect(shouldShowChallengeInvite('strict')).toBe(true);
    expect(shouldShowChallengeInvite('balanced')).toBe(false);
    expect(shouldShowChallengeInvite('gentle')).toBe(false);
  });

  it('gentle 隐藏采纳确认追问行; balanced/strict 保持现状', () => {
    expect(shouldShowAdoptConfirm('gentle')).toBe(false);
    expect(shouldShowAdoptConfirm('balanced')).toBe(true);
    expect(shouldShowAdoptConfirm('strict')).toBe(true);
  });
});

describe('greenAltIdToMicroChallengeCategory', () => {
  it('绿色替代卡 id 映射到微挑战品类', () => {
    expect(greenAltIdToMicroChallengeCategory('skincare_hoard')).toBe('beauty');
    expect(greenAltIdToMicroChallengeCategory('refurb_gadget')).toBe('electronics');
    expect(greenAltIdToMicroChallengeCategory('milk_tea')).toBe('food');
    expect(greenAltIdToMicroChallengeCategory('fast_fashion')).toBe('clothing');
    expect(greenAltIdToMicroChallengeCategory('tissues')).toBe('home');
  });

  it('未知 id 保守映射 home (不抛异常)', () => {
    expect(greenAltIdToMicroChallengeCategory('future_entry')).toBe('home');
  });
});
