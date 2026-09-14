import { describe, it, expect } from 'vitest';
import {
  deriveGuardianStylePreset,
  summarizeCartGuard,
  summarizeChatGuard,
  summarizeEvidenceGuard,
  summarizeGuardSettings,
  summarizePushGuard,
  type GuardPushSnapshot,
} from '../guard-settings-summary';
import { defaultGuardScope } from '../guard-scope';

const ALL_CHANNELS_ON: GuardPushSnapshot['channels'] = {
  missYou: true,
  dreamFund: true,
  challenge: true,
  weeklyGuardian: true,
};

const PUSH_ON: GuardPushSnapshot = { subscribed: true, frequency: 'daily', channels: ALL_CHANNELS_ON };

describe('deriveGuardianStylePreset — 四渠道反查守护风格', () => {
  it('与预设计划全维度一致时命中该预设', () => {
    // balancedGuard = balanced / standard / daily / 全 guard (app 默认)
    expect(deriveGuardianStylePreset('balanced', 'standard', 'daily', defaultGuardScope())).toBe('balancedGuard');
    expect(deriveGuardianStylePreset('gentle', 'standard', 'weekly', defaultGuardScope())).toBe('gentleCompanion');
    // strictCoach = strict / early / daily / 全 strict
    const allStrict = { ...defaultGuardScope() };
    for (const key of Object.keys(allStrict) as (keyof typeof allStrict)[]) allStrict[key] = 'strict';
    expect(deriveGuardianStylePreset('strict', 'early', 'daily', allStrict)).toBe('strictCoach');
    expect(deriveGuardianStylePreset('gentle', 'nightOwl', 'off', defaultGuardScope())).toBe('nightLightGuard');
  });

  it('任一维度偏离预设即记 custom', () => {
    const oneExempt = { ...defaultGuardScope(), food: 'exempt' as const };
    expect(deriveGuardianStylePreset('balanced', 'standard', 'daily', oneExempt)).toBe('custom');
    expect(deriveGuardianStylePreset('gentle', 'standard', 'daily', defaultGuardScope())).toBe('custom');
  });
});

describe('summarizeChatGuard — 对话守护', () => {
  it('总开关关 → off; 任一源 unknown → unknown', () => {
    expect(summarizeChatGuard(false, 'strict', 'standard')).toBe('off');
    expect(summarizeChatGuard('unknown', 'strict', 'standard')).toBe('unknown');
    expect(summarizeChatGuard(true, 'unknown', 'standard')).toBe('unknown');
    expect(summarizeChatGuard(true, 'balanced', 'unknown')).toBe('unknown');
  });

  it('温和强度或深夜档 off → partial; 其余全开 → on', () => {
    expect(summarizeChatGuard(true, 'gentle', 'standard')).toBe('partial');
    expect(summarizeChatGuard(true, 'balanced', 'off')).toBe('partial');
    expect(summarizeChatGuard(true, 'balanced', 'standard')).toBe('on');
    expect(summarizeChatGuard(true, 'strict', 'nightOwl')).toBe('on');
  });
});

describe('summarizeCartGuard — 购物车守护', () => {
  it('全 guard → on; 个别豁免 → partial 带计数; 全豁免 → off', () => {
    expect(summarizeCartGuard(defaultGuardScope())).toEqual({ status: 'on', exemptCount: 0 });
    expect(summarizeCartGuard({ ...defaultGuardScope(), food: 'exempt', beauty: 'exempt' })).toEqual({
      status: 'partial',
      exemptCount: 2,
    });
    const allExempt = { ...defaultGuardScope() };
    for (const key of Object.keys(allExempt) as (keyof typeof allExempt)[]) allExempt[key] = 'exempt';
    expect(summarizeCartGuard(allExempt)).toEqual({ status: 'off', exemptCount: 5 });
  });

  it('unknown → unknown', () => {
    expect(summarizeCartGuard('unknown')).toEqual({ status: 'unknown', exemptCount: null });
  });
});

describe('summarizePushGuard — 推送守护', () => {
  it('订阅 + daily + 四通道全开 → on', () => {
    expect(summarizePushGuard(PUSH_ON)).toBe('on');
  });

  it('未订阅 → off', () => {
    expect(summarizePushGuard({ ...PUSH_ON, subscribed: false })).toBe('off');
  });

  it('订阅但通道部分关或节奏 off → partial', () => {
    expect(
      summarizePushGuard({ subscribed: true, frequency: 'daily', channels: { ...ALL_CHANNELS_ON, missYou: false } }),
    ).toBe('partial');
    expect(summarizePushGuard({ ...PUSH_ON, frequency: 'off' })).toBe('partial');
    expect(summarizePushGuard({ ...PUSH_ON, frequency: 'weekly' })).toBe('on');
  });

  it('unknown → unknown', () => {
    expect(summarizePushGuard('unknown')).toBe('unknown');
  });
});

describe('summarizeEvidenceGuard — 资料与证据', () => {
  it('0 条 off / 1–4 条 partial / ≥5 条 on / unknown', () => {
    expect(summarizeEvidenceGuard({ totalEvents: 0 })).toBe('off');
    expect(summarizeEvidenceGuard({ totalEvents: 1 })).toBe('partial');
    expect(summarizeEvidenceGuard({ totalEvents: 4 })).toBe('partial');
    expect(summarizeEvidenceGuard({ totalEvents: 5 })).toBe('on');
    expect(summarizeEvidenceGuard({ totalEvents: 120 })).toBe('on');
    expect(summarizeEvidenceGuard('unknown')).toBe('unknown');
  });
});

describe('summarizeGuardSettings — 总控聚合', () => {
  const baseInput = {
    greenGuardEnabled: true,
    guardIntensity: 'balanced' as const,
    nightWindow: 'standard' as const,
    guardScope: defaultGuardScope(),
    push: PUSH_ON,
    evidence: { totalEvents: 9 },
    coverage: { health: 'healthy' as const, uncoveredCategories: 0 },
  };

  it('默认全开场景: 风格命中 balancedGuard, 四组全 on, 覆盖透传', () => {
    const summary = summarizeGuardSettings(baseInput);
    expect(summary.style).toEqual({ kind: 'preset', preset: 'balancedGuard' });
    expect(summary.groups).toEqual({ chat: 'on', cart: 'on', push: 'on', evidence: 'on' });
    expect(summary.coverage).toEqual({ health: 'healthy', uncoveredCategories: 0 });
    expect(summary.cartExemptCount).toBe(0);
  });

  it('push 源失败只污染 push 组与风格行, 其余组与覆盖不受牵连', () => {
    const summary = summarizeGuardSettings({ ...baseInput, push: 'unknown' });
    expect(summary.style).toEqual({ kind: 'unknown' });
    expect(summary.groups.push).toBe('unknown');
    expect(summary.groups.chat).toBe('on');
    expect(summary.groups.cart).toBe('on');
    expect(summary.groups.evidence).toBe('on');
    expect(summary.coverage).toEqual({ health: 'healthy', uncoveredCategories: 0 });
  });

  it('覆盖源失败 → 覆盖为 null, 组状态照常', () => {
    const summary = summarizeGuardSettings({ ...baseInput, coverage: 'unknown' });
    expect(summary.coverage).toBeNull();
    expect(summary.groups.chat).toBe('on');
  });

  it('总开关关闭时混合配置保留豁免计数, 索引统一按 off 呈现', () => {
    const summary = summarizeGuardSettings({
      ...baseInput,
      greenGuardEnabled: false,
      guardScope: { ...defaultGuardScope(), food: 'exempt' },
      push: { subscribed: true, frequency: 'daily', channels: { ...ALL_CHANNELS_ON, challenge: false } },
      evidence: { totalEvents: 2 },
    });
    expect(summary.groups).toEqual({ chat: 'off', cart: 'off', push: 'off', evidence: 'off' });
    expect(summary.cartExemptCount).toBe(1);
    expect(summary.style).toEqual({ kind: 'custom' });
  });
});
