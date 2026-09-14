import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

/**
 * guard-control i18n 守卫 (batch68-b)
 *
 * 设置页守护总控索引文案: guardControl* 键 zh/en 集合对称、非空;
 * 插值占位符 ({count} / {group}) 双语一致;
 * 隐私红线: 零金额词、零百分比、零碳数值 (索引只出现次数/天数/状态)。
 */

const profileZh = zh.profile as Record<string, unknown>;
const profileEn = en.profile as Record<string, unknown>;

const GUARD_CONTROL_KEYS = Object.keys(profileZh).filter((key) => key.startsWith('guardControl'));

describe('guard control i18n completeness', () => {
  it('guardControl* 键 zh/en 集合对称、非空且成规模', () => {
    expect(GUARD_CONTROL_KEYS.length).toBeGreaterThanOrEqual(25);
    const enKeys = Object.keys(profileEn).filter((key) => key.startsWith('guardControl'));
    expect(new Set(enKeys)).toEqual(new Set(GUARD_CONTROL_KEYS));
    for (const key of GUARD_CONTROL_KEYS) {
      expect(String(profileZh[key]), `zh ${key}`).toBeTruthy();
      expect(String(profileEn[key]), `en ${key}`).toBeTruthy();
    }
  });

  it('四组分组键双语齐备', () => {
    for (const key of ['guardControlGroupChat', 'guardControlGroupCart', 'guardControlGroupPush', 'guardControlGroupEvidence']) {
      expect(profileZh[key], `zh ${key}`).toBeTruthy();
      expect(profileEn[key], `en ${key}`).toBeTruthy();
    }
  });

  it('插值占位符双语一致 ({count} / {group})', () => {
    for (const key of ['guardControlCartPartialHint', 'guardControlCoverageUncovered']) {
      expect(String(profileZh[key]), `zh ${key}`).toContain('{count}');
      expect(String(profileEn[key]), `en ${key}`).toContain('{count}');
    }
    for (const key of ['guardControlJumpAria']) {
      expect(String(profileZh[key]), `zh ${key}`).toContain('{group}');
      expect(String(profileEn[key]), `en ${key}`).toContain('{group}');
    }
  });
});

describe('guard control privacy red line', () => {
  it('全部 key 零金额词、零百分比、零碳数值 (zh+en 逐 key)', () => {
    expect(GUARD_CONTROL_KEYS.length).toBeGreaterThan(0);
    for (const key of GUARD_CONTROL_KEYS) {
      expect(String(profileZh[key]), `zh ${key}`).not.toMatch(/[¥$￥€£%％]|美元|人民币|块钱|元/);
      expect(String(profileEn[key]), `en ${key}`).not.toMatch(/[¥$￥€£%％]|\b(USD|CNY|RMB|dollars?|cents?|percent)\b/i);
      expect(String(profileZh[key]), `zh ${key}`).not.toMatch(/碳|CO2|CO₂|吨/);
      expect(String(profileEn[key]), `en ${key}`).not.toMatch(/\b(carbon|CO2|tonnes?)\b/i);
    }
  });
});
