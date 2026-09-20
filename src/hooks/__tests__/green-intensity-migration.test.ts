// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetGuardIntensityStateForTest,
  getGuardIntensity,
  migrateLegacyGreenIntensity,
} from '@/hooks/use-guard-intensity';
import {
  _resetGreenPrefsStateForTest,
  getGreenPrefs,
} from '@/hooks/use-green-prefs';

describe('migrateLegacyGreenIntensity (batch95-a 强度收敛迁移)', () => {
  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetGreenPrefsStateForTest();
    window.localStorage.clear();
  });

  it('maps legacy firm choice to strict when no explicit guard choice exists', () => {
    window.localStorage.setItem(
      'symy-green-prefs',
      JSON.stringify({ intensity: 'firm', wording: 'neutral', pushTheme: 'seasonal' }),
    );

    expect(migrateLegacyGreenIntensity()).toBe(true);
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    expect(getGuardIntensity()).toBe('strict');
    // 迁移后绿色偏好强度归位默认档 — 保证一次性, 用户之后显式改档不被反复覆盖
    expect(getGreenPrefs().intensity).toBe('balanced');
    expect(getGreenPrefs().wording).toBe('neutral');
    expect(getGreenPrefs().pushTheme).toBe('seasonal');
  });

  it('maps legacy lockdown choice to strict as well', () => {
    window.localStorage.setItem(
      'symy-green-prefs',
      JSON.stringify({ intensity: 'lockdown', wording: 'direct', pushTheme: 'none' }),
    );

    expect(migrateLegacyGreenIntensity()).toBe(true);
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('strict');
    expect(getGreenPrefs().intensity).toBe('balanced');
  });

  it('respects an explicit guard-intensity choice and does not overwrite it', () => {
    window.localStorage.setItem('symy-guard-intensity', 'gentle');
    window.localStorage.setItem(
      'symy-green-prefs',
      JSON.stringify({ intensity: 'firm', wording: 'cheerful', pushTheme: 'none' }),
    );

    expect(migrateLegacyGreenIntensity()).toBe(false);
    expect(window.localStorage.getItem('symy-guard-intensity')).toBe('gentle');
    expect(getGreenPrefs().intensity).toBe('firm');
  });

  it('is a no-op for non-elevated green intensities', () => {
    for (const intensity of ['balanced', 'gentle'] as const) {
      window.localStorage.setItem(
        'symy-green-prefs',
        JSON.stringify({ intensity, wording: 'cheerful', pushTheme: 'none' }),
      );

      expect(migrateLegacyGreenIntensity()).toBe(false);
      expect(window.localStorage.getItem('symy-guard-intensity')).toBeNull();
    }
  });

  it('is a no-op when green prefs are absent', () => {
    expect(migrateLegacyGreenIntensity()).toBe(false);
    expect(window.localStorage.getItem('symy-guard-intensity')).toBeNull();
  });
});
