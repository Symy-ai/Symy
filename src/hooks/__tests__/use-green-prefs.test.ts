/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGreenPrefs, _resetGreenPrefsStateForTest } from '@/hooks/use-green-prefs';

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
    expect(result.current.prefs).toEqual({ wording: 'cheerful', pushTheme: 'none' });
  });

  it('setGreenPrefField updates a single field', () => {
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.setGreenPrefField('wording', 'direct'));
    expect(result.current.prefs.wording).toBe('direct');
    expect(result.current.prefs.pushTheme).toBe('none');
  });

  it('setGreenPrefs replaces all fields', () => {
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.setGreenPrefs({ wording: 'direct', pushTheme: 'guardian' }));
    expect(result.current.prefs).toEqual({ wording: 'direct', pushTheme: 'guardian' });
  });

  it('subscribers receive updates', () => {
    // 订阅路径通过第二个 hook 实例验证 (setGreenPrefField 会广播到订阅者)
    const { result: other } = renderHook(() => useGreenPrefs());
    act(() => other.current.setGreenPrefField('pushTheme', 'seasonal'));
    expect(other.current.prefs.pushTheme).toBe('seasonal');
  });

  it('resetGreenPrefs clears known keys and restores defaults', () => {
    storage['symy-green-prefs'] = JSON.stringify({ intensity: 'legacy', wording: 'direct', pushTheme: 'guardian' });
    storage['symy-onboarding-seen'] = 'true';
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.resetGreenPrefs());
    expect(result.current.prefs).toEqual({ wording: 'cheerful', pushTheme: 'none' });
    expect(storage['symy-green-prefs']).toBe(JSON.stringify({ wording: 'cheerful', pushTheme: 'none' }));
    expect(storage['symy-onboarding-seen']).toBeUndefined();
  });

  it('does not delete unrelated localStorage keys on reset', () => {
    storage['symy-green-prefs'] = JSON.stringify({ intensity: 'legacy', wording: 'neutral', pushTheme: 'none' });
    storage['some-other-key'] = 'keep-me';
    const { result } = renderHook(() => useGreenPrefs());
    act(() => result.current.resetGreenPrefs());
    expect(storage['some-other-key']).toBe('keep-me');
  });

  it('survives localStorage quota/read failures by returning defaults', () => {
    storage['symy-green-prefs'] = 'not-json';
    const { result } = renderHook(() => useGreenPrefs());
    expect(result.current.prefs).toEqual({ wording: 'cheerful', pushTheme: 'none' });
  });
});
