import { describe, expect, it } from 'vitest';
import { resolveStoryLocale } from '../story-locale';

describe('resolveStoryLocale', () => {
  it('prefers the request (UI) locale over the stored profile locale', () => {
    expect(resolveStoryLocale('zh', 'en')).toBe('zh');
    expect(resolveStoryLocale('en', 'zh')).toBe('en');
  });

  it('falls back to the profile locale when the request has none', () => {
    expect(resolveStoryLocale(undefined, 'zh')).toBe('zh');
    expect(resolveStoryLocale(undefined, null)).toBeUndefined();
  });

  it('returns undefined when both sources are missing (server falls back to English)', () => {
    expect(resolveStoryLocale(undefined, undefined)).toBeUndefined();
    expect(resolveStoryLocale('', null)).toBeUndefined();
  });
});
