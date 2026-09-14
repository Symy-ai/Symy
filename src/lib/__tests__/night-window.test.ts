import { describe, it, expect } from 'vitest';
import {
  NIGHT_WINDOW_OPTIONS,
  NIGHT_WINDOW_PRESETS,
  DEFAULT_NIGHT_WINDOW,
  normalizeNightWindow,
  nightWindowToHours,
} from '../night-window';
import { DEFAULT_LATE_NIGHT_HOURS } from '../impulse-window';

describe('night-window presets', () => {
  it('standard preset hours are byte-identical to the impulse-window default late-night set', () => {
    expect([...NIGHT_WINDOW_OPTIONS.standard.hours].sort((a, b) => a - b)).toEqual(
      [...DEFAULT_LATE_NIGHT_HOURS].sort((a, b) => a - b),
    );
    expect(NIGHT_WINDOW_OPTIONS.standard.rangeLabel).toBe('22:00–05:00');
  });

  it('early covers 21–23 and nightOwl covers 0–4, off is empty', () => {
    expect(NIGHT_WINDOW_OPTIONS.early.hours).toEqual([21, 22, 23]);
    expect(NIGHT_WINDOW_OPTIONS.nightOwl.hours).toEqual([0, 1, 2, 3, 4]);
    expect(NIGHT_WINDOW_OPTIONS.off.hours).toEqual([]);
  });

  it('normalize: valid passthrough, invalid/missing falls back to standard', () => {
    for (const preset of NIGHT_WINDOW_PRESETS) expect(normalizeNightWindow(preset)).toBe(preset);
    expect(normalizeNightWindow('garbage')).toBe(DEFAULT_NIGHT_WINDOW);
    expect(normalizeNightWindow(null)).toBe(DEFAULT_NIGHT_WINDOW);
    expect(normalizeNightWindow(undefined)).toBe(DEFAULT_NIGHT_WINDOW);
  });

  it('off maps back to the default hours (stats keep the baseline window)', () => {
    expect(nightWindowToHours('off')).toBe(DEFAULT_LATE_NIGHT_HOURS);
    expect(nightWindowToHours('nightOwl')).toEqual([0, 1, 2, 3, 4]);
  });
});
