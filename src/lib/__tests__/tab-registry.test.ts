/**
 * Tests for tab-registry.ts — central Tab type / order / routing source of truth.
 *
 * 覆盖:
 * - isTabId: 合法/非法/空字符串
 * - TAB_ORDER: 包含所有可见 tab 且顺序正确
 * - TAB_URL_WHITELIST: 包含所有可路由 tab
 */

import { describe, it, expect } from 'vitest';
import { isTabId, TAB_ORDER, TAB_URL_WHITELIST } from '../tab-registry';

describe('isTabId', () => {
  // 所有合法 TabId（含历史/隐藏 tab）均返回 true
  it.each([
    'chat',
    'buddy',
    'insights',
    'profile',
    'butterfly',
    'monitor',
    'family',
    'defense',
  ])('returns true for valid TabId "%s"', (value) => {
    expect(isTabId(value)).toBe(true);
  });

  it('returns true for the spec-listed routable tabs', () => {
    for (const tab of ['chat', 'buddy', 'profile', 'butterfly', 'monitor', 'family']) {
      expect(isTabId(tab)).toBe(true);
    }
  });

  it('returns false for invalid strings', () => {
    expect(isTabId('settings')).toBe(false);
    expect(isTabId('home')).toBe(false);
    expect(isTabId('dashboard')).toBe(false);
    expect(isTabId('random')).toBe(false);
  });

  it('is case-sensitive (uppercase not accepted)', () => {
    expect(isTabId('CHAT')).toBe(false);
    expect(isTabId('Buddy')).toBe(false);
    expect(isTabId('PROFILE')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTabId('')).toBe(false);
  });
});

describe('TAB_ORDER', () => {
  it('contains all expected visible tabs', () => {
    expect(TAB_ORDER).toContain('buddy');
    expect(TAB_ORDER).toContain('defense');
    expect(TAB_ORDER).toContain('profile');
  });

  it('has the correct visual order: chat → buddy → defense → profile (owner 09-06: 4-tab nav)', () => {
    expect([...TAB_ORDER]).toEqual(['chat', 'buddy', 'defense', 'profile']);
  });

  it('contains exactly 4 visible tabs', () => {
    expect(TAB_ORDER).toHaveLength(4);
  });

  it('every entry is a valid TabId', () => {
    for (const tab of TAB_ORDER) {
      expect(isTabId(tab)).toBe(true);
    }
  });
});

describe('TAB_URL_WHITELIST', () => {
  it('contains all routable tabs', () => {
    expect([...TAB_URL_WHITELIST]).toEqual([
      'chat',
      'buddy',
      'profile',
      'butterfly',
      'monitor',
      'family',
      'defense',
    ]);
  });

  it('includes all routable tabs', () => {
    for (const tab of ['chat', 'buddy', 'profile', 'butterfly', 'monitor', 'family', 'defense']) {
      expect(TAB_URL_WHITELIST).toContain(tab);
    }
  });

  it('excludes insights (merged into profile)', () => {
    expect(TAB_URL_WHITELIST).not.toContain('insights');
  });

  it('every whitelisted tab is a valid TabId', () => {
    for (const tab of TAB_URL_WHITELIST) {
      expect(isTabId(tab)).toBe(true);
    }
  });
});
