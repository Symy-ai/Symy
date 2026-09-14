import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

/**
 * guardian-style i18n 守卫 (batch61-a)
 *
 * 双语完整性: guardianStyle* 键 zh/en 集合对称且非空;
 * 契约卡荣誉面红线: 只允许时段/次数/天数类承诺 — 零金额词、零百分比,
 * zh+en 逐 key 锁死; 插值占位符 ({count}/{range}) 双语一致。
 */

const profileZh = zh.profile as Record<string, unknown>;
const profileEn = en.profile as Record<string, unknown>;

const GUARDIAN_STYLE_KEYS = Object.keys(profileZh).filter((key) => key.startsWith('guardianStyle'));

describe('guardian style i18n completeness', () => {
  it('guardianStyle* 键 zh/en 集合对称、非空且成规模', () => {
    expect(GUARDIAN_STYLE_KEYS.length).toBeGreaterThanOrEqual(60);
    const enKeys = Object.keys(profileEn).filter((key) => key.startsWith('guardianStyle'));
    expect(new Set(enKeys)).toEqual(new Set(GUARDIAN_STYLE_KEYS));
    for (const key of GUARDIAN_STYLE_KEYS) {
      expect(String(profileZh[key]), `zh ${key}`).toBeTruthy();
      expect(String(profileEn[key]), `en ${key}`).toBeTruthy();
    }
  });

  it('四个预设的标签与描述双语齐备', () => {
    for (const suffix of ['GentleCompanion', 'BalancedGuard', 'StrictCoach', 'NightLightGuard']) {
      for (const key of [`guardianStylePreset${suffix}`, `guardianStylePreset${suffix}Desc`]) {
        expect(profileZh[key], `zh ${key}`).toBeTruthy();
        expect(profileEn[key], `en ${key}`).toBeTruthy();
      }
    }
  });

  it('插值占位符双语一致 ({count} / {range})', () => {
    for (const key of ['guardianStyleContractScopeStrict', 'guardianStyleContractScopeExempt']) {
      expect(String(profileZh[key]), `zh ${key}`).toContain('{count}');
      expect(String(profileEn[key]), `en ${key}`).toContain('{count}');
    }
    for (const key of ['guardianStyleNightSeeOn', 'guardianStyleContractNightOn']) {
      expect(String(profileZh[key]), `zh ${key}`).toContain('{range}');
      expect(String(profileEn[key]), `en ${key}`).toContain('{range}');
    }
  });
});

describe('guardian contract card honor-face red line', () => {
  it('契约卡全部 key 零金额词、零百分比 (zh+en 逐 key)', () => {
    const contractKeys = GUARDIAN_STYLE_KEYS.filter((key) => key.startsWith('guardianStyleContract'));
    expect(contractKeys.length).toBeGreaterThanOrEqual(10);
    for (const key of contractKeys) {
      expect(String(profileZh[key]), `zh ${key}`).not.toMatch(/[¥$￥€£%％]|美元|人民币|块钱|元/);
      expect(String(profileEn[key]), `en ${key}`).not.toMatch(/[¥$￥€£%％]|\b(USD|CNY|RMB|dollars?|percent)\b/i);
    }
  });

  it('契约卡 key 全集双语齐备 (标题描述卡题签名 4 + 身份 3 + 夜间 2 + 节奏 3 + 范围 3)', () => {
    const expected = [
      'guardianStyleContractTitle',
      'guardianStyleContractDesc',
      'guardianStyleContractCardTitle',
      'guardianStyleContractSign',
      'guardianStyleContractIdentityGentle',
      'guardianStyleContractIdentityBalanced',
      'guardianStyleContractIdentityStrict',
      'guardianStyleContractNightOn',
      'guardianStyleContractNightOff',
      'guardianStyleContractPushDaily',
      'guardianStyleContractPushWeekly',
      'guardianStyleContractPushOff',
      'guardianStyleContractScopeStrict',
      'guardianStyleContractScopeExempt',
      'guardianStyleContractScopeAllGuard',
    ];
    const actual = GUARDIAN_STYLE_KEYS.filter((key) => key.startsWith('guardianStyleContract'));
    expect([...actual].sort()).toEqual([...expected].sort());
    for (const key of expected) {
      expect(profileZh[key], `zh ${key}`).toBeTruthy();
      expect(profileEn[key], `en ${key}`).toBeTruthy();
    }
  });
});
