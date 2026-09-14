import { describe, it, expect } from 'vitest';
import { sanitizeDisplay, isSafeDisplayValue, sanitizeHealthDescription } from '@/lib/display-sanitize';

describe('sanitizeDisplay', () => {
  it('returns fallback for undefined', () => {
    expect(sanitizeDisplay(undefined)).toBe('—');
    expect(sanitizeDisplay(undefined, '?')).toBe('?');
  });

  it('returns fallback for null', () => {
    expect(sanitizeDisplay(null)).toBe('—');
  });

  it('returns fallback for NaN', () => {
    expect(sanitizeDisplay(NaN)).toBe('—');
  });

  it('passes through normal strings unchanged', () => {
    expect(sanitizeDisplay('Hello world')).toBe('Hello world');
    expect(sanitizeDisplay('You saw Coffee machine · $89 · 4.5 hours of life')).toBe(
      'You saw Coffee machine · $89 · 4.5 hours of life',
    );
  });

  it('passes through normal numbers', () => {
    expect(sanitizeDisplay(42)).toBe('42');
    expect(sanitizeDisplay(3.14)).toBe('3.14');
  });

  // 🔧 P0-2: The exact bug from the report — "Symy vitality -8 → undefined"
  it('replaces "→ undefined" with "→ ?"', () => {
    const buggy = 'Impulse recorded: $89 on unknown (score: 70). Symy vitality -8 → undefined.';
    const fixed = sanitizeDisplay(buggy);
    expect(fixed).not.toContain('undefined');
    expect(fixed).toContain('→ ?');
  });

  it('replaces standalone "undefined" token', () => {
    expect(sanitizeDisplay('undefined hours of life')).toBe('? hours of life');
  });

  it('replaces "null" token', () => {
    expect(sanitizeDisplay('value: null')).toBe('value: ?');
  });

  it('replaces "NaN" token', () => {
    expect(sanitizeDisplay('score: NaN')).toBe('score: ?');
  });

  it('handles multiple undefined/null/NaN in same string', () => {
    const input = 'vitality undefined → null, score NaN';
    const result = sanitizeDisplay(input);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
    expect(result).not.toContain('NaN');
  });

  it('does not replace "undefined" inside other words (word boundary)', () => {
    // "undefinedly" should NOT have its "undefined" part replaced
    expect(sanitizeDisplay('He was undefinedly confused')).toBe('He was undefinedly confused');
  });

  it('cleans up double question marks', () => {
    expect(sanitizeDisplay('value: undefined null')).not.toContain('??');
  });
});

describe('isSafeDisplayValue', () => {
  it('returns false for undefined/null/NaN', () => {
    expect(isSafeDisplayValue(undefined)).toBe(false);
    expect(isSafeDisplayValue(null)).toBe(false);
    expect(isSafeDisplayValue(NaN)).toBe(false);
  });

  it('returns true for valid values', () => {
    expect(isSafeDisplayValue('hello')).toBe(true);
    expect(isSafeDisplayValue(42)).toBe(true);
    expect(isSafeDisplayValue(0)).toBe(true);
    expect(isSafeDisplayValue('')).toBe(true);
  });
});

describe('sanitizeHealthDescription', () => {
  // 🔧 P0-2 root-cause fix: server-side sanitizer for DB persistence
  it('returns "Event recorded." for undefined', () => {
    expect(sanitizeHealthDescription(undefined)).toBe('Event recorded.');
  });

  it('returns "Event recorded." for null', () => {
    expect(sanitizeHealthDescription(null)).toBe('Event recorded.');
  });

  it('replaces "undefined" with "?" in the exact bug string', () => {
    const buggy = 'Impulse recorded: $89 on unknown (score: 70). Symy vitality -8 → undefined.';
    const fixed = sanitizeHealthDescription(buggy);
    expect(fixed).not.toContain('undefined');
    expect(fixed).toContain('→ ?');
  });

  it('replaces "null" with "?"', () => {
    expect(sanitizeHealthDescription('value: null')).toBe('value: ?');
  });

  it('replaces "NaN" with "?"', () => {
    expect(sanitizeHealthDescription('score: NaN')).toBe('score: ?');
  });

  it('passes through normal descriptions unchanged', () => {
    const normal = 'You didn\'t see Coffee machine · $89 · 1.8 hours of life · clarity -8 → 92';
    expect(sanitizeHealthDescription(normal)).toBe(normal);
  });

  it('handles multiple undefined/null/NaN in same string', () => {
    const input = 'vitality undefined → null, score NaN';
    const result = sanitizeHealthDescription(input);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
    expect(result).not.toContain('NaN');
  });

  it('does not replace "undefined" inside other words (word boundary)', () => {
    expect(sanitizeHealthDescription('He was undefinedly confused')).toBe('He was undefinedly confused');
  });

  it('cleans up double question marks', () => {
    expect(sanitizeHealthDescription('value: undefined null')).not.toContain('??');
  });
});
