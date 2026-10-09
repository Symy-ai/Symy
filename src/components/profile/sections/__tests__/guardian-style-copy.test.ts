import { describe, expect, it } from 'vitest';

import {
  CATEGORY_LABEL_KEY,
  CONTRACT_IDENTITY_KEY,
  CONTRACT_NIGHT_KEY,
  CONTRACT_PUSH_KEY,
  INTENSITY_LABEL_KEY,
  INTENSITY_SEE_KEY,
  INTENSITY_WONT_KEY,
  NIGHT_LABEL_KEY,
  NIGHT_SEE_KEY,
  NIGHT_WONT_KEY,
  PRESET_DESC_KEY,
  PRESET_LABEL_KEY,
  PRESET_SEE_KEY,
  PRESET_WONT_KEY,
  PUSH_LABEL_KEY,
  PUSH_SEE_KEY,
  PUSH_WONT_KEY,
  SCOPE_MODE_LABEL_KEY,
} from '../guardian-style-copy';

/**
 * guardian-style-copy.ts (136行) — 向导文案 key 映射 (batch61-a 纯数据)。
 *
 * 锁定:
 * - 四预设×3 表 (label/desc/see/wont) 全覆盖
 * - 夜间档合并律: 三开启档共用 SeeOn/WontSeeOn, off 单独
 * - 契约卡三表 (identity/night/push)
 * - key 前缀律 (profile.*)
 */
describe('guardian-style-copy key 映射', () => {
  const presets = ['gentleCompanion', 'balancedGuard', 'strictCoach', 'nightLightGuard'] as const;

  it('四预设×4 表全覆盖 (label/desc/see/wont)', () => {
    for (const p of presets) {
      expect(PRESET_LABEL_KEY[p]).toContain('profile.guardianStylePreset');
      expect(PRESET_DESC_KEY[p]).toContain('Desc');
      expect(PRESET_SEE_KEY[p]).toContain('profile.guardianStyleSee');
      expect(PRESET_WONT_KEY[p]).toContain('WontSee');
    }
    expect(Object.keys(PRESET_LABEL_KEY)).toHaveLength(4);
  });

  it('夜间合并律: 三开启档共用 On, off 单独 (见/ wont 双表+label 四档)', () => {
    expect(NIGHT_LABEL_KEY.early).not.toBe(NIGHT_LABEL_KEY.standard); // label 四档各异
    expect(NIGHT_SEE_KEY.early).toBe(NIGHT_SEE_KEY.standard); // see 共用
    expect(NIGHT_SEE_KEY.nightOwl).toBe(NIGHT_SEE_KEY.early);
    expect(NIGHT_SEE_KEY.off).not.toBe(NIGHT_SEE_KEY.early);
    expect(NIGHT_WONT_KEY.early).toBe(NIGHT_WONT_KEY.nightOwl);
    expect(NIGHT_WONT_KEY.off).not.toBe(NIGHT_WONT_KEY.early);
  });

  it('强度三档×3 表+推送三档×3 表+品类五+模式三', () => {
    expect(Object.keys(INTENSITY_LABEL_KEY)).toHaveLength(3);
    expect(Object.keys(INTENSITY_SEE_KEY)).toHaveLength(3);
    expect(Object.keys(INTENSITY_WONT_KEY)).toHaveLength(3);
    expect(Object.keys(PUSH_LABEL_KEY)).toHaveLength(3);
    expect(Object.keys(PUSH_SEE_KEY)).toHaveLength(3);
    expect(Object.keys(PUSH_WONT_KEY)).toHaveLength(3);
    expect(Object.keys(CATEGORY_LABEL_KEY)).toHaveLength(5);
    expect(Object.keys(SCOPE_MODE_LABEL_KEY)).toHaveLength(3);
  });

  it('契约卡三表+key 前缀律', () => {
    expect(Object.keys(CONTRACT_IDENTITY_KEY)).toHaveLength(3);
    expect(CONTRACT_NIGHT_KEY.early).toBe(CONTRACT_NIGHT_KEY.standard); // 契约夜间同合并律
    expect(CONTRACT_PUSH_KEY.daily).toContain('profile.guardianStyleContractPush');
    for (const table of [PRESET_LABEL_KEY, INTENSITY_LABEL_KEY, NIGHT_LABEL_KEY, PUSH_LABEL_KEY, CATEGORY_LABEL_KEY, SCOPE_MODE_LABEL_KEY]) {
      for (const key of Object.values(table)) {
        expect(key.startsWith('profile.')).toBe(true);
      }
    }
  });
});
