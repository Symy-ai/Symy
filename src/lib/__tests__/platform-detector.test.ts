/**
 * Tests for platform-detector.ts — auto-detect purchase platform.
 *
 * 🔧 Round 82 F3 方案 B: Test coverage for platform detection.
 *    - detectPlatformFromText: keyword matching (English + Chinese)
 *    - findPlatformFromImpulseEvents: DB query (mocked)
 *    - autoDetectPlatform: combined strategy (impulse_events first, then text)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { detectPlatformFromText, autoDetectPlatform } from '../platform-detector';

describe('detectPlatformFromText', () => {
  it('returns null for empty/undefined text', () => {
    expect(detectPlatformFromText('')).toBeNull();
    expect(detectPlatformFromText(undefined as unknown as string)).toBeNull();
  });

  it('detects TikTok from English text', () => {
    expect(detectPlatformFromText('I bought a jacket from TikTok shop')).toBe('tiktok_shop');
    expect(detectPlatformFromText('tiktok live was so tempting')).toBe('tiktok_shop');
  });

  it('detects TikTok from Chinese text', () => {
    expect(detectPlatformFromText('在抖音直播间买的')).toBe('tiktok_shop');
    expect(detectPlatformFromText('抖音上看到这个就买了')).toBe('tiktok_shop');
  });

  it('detects Instagram', () => {
    expect(detectPlatformFromText('Saw an ad on Instagram')).toBe('instagram');
    expect(detectPlatformFromText('insta ad caught me')).toBe('instagram');
  });

  it('detects Amazon', () => {
    expect(detectPlatformFromText('Bought on Amazon')).toBe('amazon');
    expect(detectPlatformFromText('亚马逊上买的')).toBe('amazon');
  });

  it('detects Shein', () => {
    expect(detectPlatformFromText('Saw a dress on Shein')).toBe('shein');
    expect(detectPlatformFromText('found it on shein')).toBe('shein');
  });

  it('detects JD', () => {
    expect(detectPlatformFromText('京东买的')).toBe('jd');
    expect(detectPlatformFromText('ordered from jd.com')).toBe('jd');
  });

  it('detects Pinduoduo', () => {
    expect(detectPlatformFromText('拼多多上买的')).toBe('pinduoduo');
    expect(detectPlatformFromText('pdd had a deal')).toBe('pinduoduo');
  });

  it('detects generic livestream', () => {
    expect(detectPlatformFromText('bought from a livestream')).toBe('livestream');
    expect(detectPlatformFromText('直播间抢的')).toBe('livestream');
  });

  it('detects generic ad', () => {
    expect(detectPlatformFromText('saw an ad and bought')).toBe('ad');
    expect(detectPlatformFromText('广告推给我的')).toBe('ad');
  });

  it('returns null when no platform keyword found', () => {
    expect(detectPlatformFromText('I bought a jacket')).toBeNull();
    expect(detectPlatformFromText('just got it')).toBeNull();
    expect(detectPlatformFromText('花了50块')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectPlatformFromText('TIKTOK SHOP')).toBe('tiktok_shop');
    expect(detectPlatformFromText('Amazon')).toBe('amazon');
    expect(detectPlatformFromText('INSTAGRAM')).toBe('instagram');
  });

  it('prioritizes TikTok over generic livestream', () => {
    // "tiktok livestream" should match tiktok_shop (higher priority)
    expect(detectPlatformFromText('bought from tiktok livestream')).toBe('tiktok_shop');
  });
});

describe('autoDetectPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when supabaseClient is null and no chatText', async () => {
    const result = await autoDetectPlatform(null, 'user-123', 100);
    expect(result).toBeNull();
  });

  it('uses keyword detection when supabaseClient is null but chatText is provided', async () => {
    const result = await autoDetectPlatform(null, 'user-123', 100, 'bought on tiktok');
    expect(result).toBe('tiktok_shop');
  });

  it('returns null when supabaseClient is null and chatText has no keywords', async () => {
    const result = await autoDetectPlatform(null, 'user-123', 100, 'bought a jacket');
    expect(result).toBeNull();
  });

  it('returns null for invalid amount (NaN, negative, zero)', async () => {
    const fakeSupabase = {
      from: vi.fn(() => fakeSupabase),
      select: vi.fn(() => fakeSupabase),
      eq: vi.fn(() => fakeSupabase),
      gte: vi.fn(() => fakeSupabase),
      lte: vi.fn(() => fakeSupabase),
      order: vi.fn(() => fakeSupabase),
      limit: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    expect(await autoDetectPlatform(fakeSupabase, 'user-123', NaN)).toBeNull();
    expect(await autoDetectPlatform(fakeSupabase, 'user-123', -1)).toBeNull();
    expect(await autoDetectPlatform(fakeSupabase, 'user-123', 0)).toBeNull();
  });

  it('falls back to keyword detection when impulse_events query returns no data', async () => {
    const fakeSupabase = {
      from: vi.fn(() => fakeSupabase),
      select: vi.fn(() => fakeSupabase),
      eq: vi.fn(() => fakeSupabase),
      gte: vi.fn(() => fakeSupabase),
      lte: vi.fn(() => fakeSupabase),
      order: vi.fn(() => fakeSupabase),
      limit: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await autoDetectPlatform(fakeSupabase, 'user-123', 100, 'bought on amazon');
    expect(result).toBe('amazon');
  });

  it('returns null when impulse_events query errors and no keyword match', async () => {
    const fakeSupabase = {
      from: vi.fn(() => fakeSupabase),
      select: vi.fn(() => fakeSupabase),
      eq: vi.fn(() => fakeSupabase),
      gte: vi.fn(() => fakeSupabase),
      lte: vi.fn(() => fakeSupabase),
      order: vi.fn(() => fakeSupabase),
      limit: vi.fn(async () => ({ data: null, error: { message: 'table not found' } })),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;

    const result = await autoDetectPlatform(fakeSupabase, 'user-123', 100, 'bought a jacket');
    expect(result).toBeNull();
  });
});
