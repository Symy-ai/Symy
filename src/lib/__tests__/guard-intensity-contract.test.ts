// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GUARD_INTENSITY,
  GUARD_INTENSITIES,
  normalizeGuardIntensity,
} from '@/lib/guard-intensity';
import {
  _resetGuardIntensityStateForTest,
  getGuardIntensity,
} from '@/hooks/use-guard-intensity';
import {
  _resetGreenPrefsStateForTest,
  getGreenPrefs,
} from '@/hooks/use-green-prefs';

describe('guard intensity persistence read contract', () => {
  afterEach(() => {
    _resetGuardIntensityStateForTest();
    _resetGreenPrefsStateForTest();
    window.localStorage.clear();
  });

  it('reads the current three-level contract from the guard key', () => {
    window.localStorage.setItem('symy-guard-intensity', 'strict');
    _resetGuardIntensityStateForTest();

    expect(getGuardIntensity()).toBe('strict');
    expect(DEFAULT_GUARD_INTENSITY).toBe('balanced');
    expect(GUARD_INTENSITIES).toEqual(['gentle', 'balanced', 'strict']);
  });

  it('falls back to balanced for missing or invalid guard values', () => {
    expect(getGuardIntensity()).toBe('balanced');
    expect(normalizeGuardIntensity('lockdown')).toBe('balanced');

    window.localStorage.setItem('symy-guard-intensity', 'firm');
    _resetGuardIntensityStateForTest();
    expect(getGuardIntensity()).toBe('balanced');
  });

  it('reads the current four-level green-prefs intensity contract', () => {
    window.localStorage.setItem(
      'symy-green-prefs',
      JSON.stringify({ intensity: 'firm', wording: 'neutral', pushTheme: 'seasonal' }),
    );
    _resetGreenPrefsStateForTest();

    expect(getGreenPrefs()).toEqual({
      intensity: 'firm',
      wording: 'neutral',
      pushTheme: 'seasonal',
    });
  });

  it('keeps the current green-prefs defaults and permissive merge', () => {
    window.localStorage.setItem('symy-green-prefs', JSON.stringify({ intensity: 'lockdown' }));
    _resetGreenPrefsStateForTest();

    expect(getGreenPrefs()).toEqual({
      intensity: 'lockdown',
      wording: 'cheerful',
      pushTheme: 'none',
    });

    _resetGreenPrefsStateForTest();
    window.localStorage.removeItem('symy-green-prefs');
    expect(getGreenPrefs().intensity).toBe('balanced');
  });

  it('accepts every current green-prefs intensity value', () => {
    for (const intensity of ['balanced', 'gentle', 'firm', 'lockdown'] as const) {
      window.localStorage.setItem('symy-green-prefs', JSON.stringify({ intensity }));
      _resetGreenPrefsStateForTest();
      expect(getGreenPrefs().intensity).toBe(intensity);
    }
  });
});
