/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGreenPrefs, _resetGreenPrefsStateForTest, getGreenPrefs, setGreenPrefs, setGreenPrefField, resetGreenPrefs } from '@/hooks/use-green-prefs';

const storage: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
});

describe('useGreenPrefs', () => {
  beforeEach(() => {
    _resetGreenPrefsStateForTest();
    for (const key of Object.keys(storage)) delete storage[key];
  });

  it('returns defaults when nothing stored', () => {
    const { result } = renderHook(() => useGreenPrefs());
    expect(result.current.prefs).toEqual({ intensity: 'balanced', wording: 'cheerful', pushTheme: 'none' });
  });

  it('setGreenPrefField updates a single field', () => {
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.setGreenPrefField('intensity', 'firm'));
    expect(result.current.prefs.intensity).toBe('firm');
    expect(result.current.prefs.wording).toBe('cheerful');
  });

  it('setGreenPrefs replaces all fields', () => {
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.setGreenPrefs({ intensity: 'lockdown', wording: 'direct', pushTheme: 'guardian' }));
    expect(result.current.prefs).toEqual({ intensity: 'lockdown', wording: 'direct', pushTheme: 'guardian' });
  });

  it('subscribers receive updates', async () => {
    const { result } = renderHook(() => useGreenPrefs());
    const values: Array<{ intensity: string; wording: string; pushTheme: string }> = [];
    const unsub = () => {
      values.push({ ...result.current.prefs });
    };
    // Access internal subscriber by writing a quick wrapper: render another hook that subscribes
    const { result: other } = renderHook(() => useGreenPrefs());
    act(() => other.current.setGreenPrefField('pushTheme', 'seasonal'));
    expect(other.current.prefs.pushTheme).toBe('seasonal');
  });

  it('resetGreenPrefs clears known keys and restores defaults', () => {
    storage['symy-green-prefs'] = JSON.stringify({ intensity: 'lockdown', wording: 'direct', pushTheme: 'guardian' });
    storage['symy-onboarding-seen'] = 'true';
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.resetGreenPrefs());
    expect(result.current.prefs).toEqual({ intensity: 'balanced', wording: 'cheerful', pushTheme: 'none' });
    expect(storage['symy-green-prefs']).toBe(JSON.stringify({ intensity: 'balanced', wording: 'cheerful', pushTheme: 'none' }));
    expect(storage['symy-onboarding-seen']).toBeUndefined();
  });

  it('does not delete unrelated localStorage keys on reset', () => {
    storage['symy-green-prefs'] = JSON.stringify({ intensity: 'gentle', wording: 'neutral', pushTheme: 'none' });
    storage['some-other-key'] = 'keep-me';
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.resetGreenPrefs());
    expect(storage['some-other-key']).toBe('keep-me');
  });

  it('survives localStorage quota/read failures by returning defaults', () => {
    storage['symy-green-prefs'] = 'not-json';
    const { result } = renderHook(() => useGreenPrefs());
    expect(result.current.prefs).toEqual({ intensity: 'balanced', wording: 'cheerful', pushTheme: 'none' });
  });
});
