/**
 * Tests for guest-rate-limiter.ts — 未登录用户 IP 限流
 *
 * 覆盖:
 * - getClientIP: 三级 header 回退、多 IP 取末位、空 header 返回 'unknown'
 * - checkGuestLimit: 首次允许、第 3 次超限、计数递增、不同 IP 独立
 * - getGuestRemaining: 首次满额、递减、超限为 0、不递增计数
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIP, checkGuestLimit, getGuestRemaining, _resetGuestStoreForTesting } from '../guest-rate-limiter';

/** 构造只含 headers 的 mock NextRequest */
function makeReq(headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  } as unknown as NextRequest;
}

describe('getClientIP', () => {
  it('reads x-vercel-forwarded-for first (highest priority)', () => {
    const req = makeReq({
      'x-vercel-forwarded-for': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8',
      'x-real-ip': '9.10.11.12',
    });
    expect(getClientIP(req)).toBe('1.2.3.4');
  });

  it('falls back to x-forwarded-for when x-vercel-forwarded-for absent', () => {
    const req = makeReq({
      'x-forwarded-for': '5.6.7.8',
      'x-real-ip': '9.10.11.12',
    });
    expect(getClientIP(req)).toBe('5.6.7.8');
  });

  it('falls back to x-real-ip when no forwarded-for headers present', () => {
    const req = makeReq({ 'x-real-ip': '9.10.11.12' });
    expect(getClientIP(req)).toBe('9.10.11.12');
  });

  it('takes the last IP from a comma-separated multi-IP list (.pop())', () => {
    const req = makeReq({
      'x-forwarded-for': '203.0.113.1, 198.51.100.2, 192.0.2.3',
    });
    expect(getClientIP(req)).toBe('192.0.2.3');
  });

  it('takes the last IP from x-vercel-forwarded-for multi-IP list', () => {
    const req = makeReq({
      'x-vercel-forwarded-for': '203.0.113.1, 198.51.100.2',
    });
    expect(getClientIP(req)).toBe('198.51.100.2');
  });

  it('trims surrounding whitespace from the extracted IP', () => {
    const req = makeReq({ 'x-real-ip': '  9.10.11.12  ' });
    expect(getClientIP(req)).toBe('9.10.11.12');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIP(makeReq({}))).toBe('unknown');
  });
});

describe('checkGuestLimit', () => {
  beforeEach(() => {
    _resetGuestStoreForTesting();
  });

  it('allows the first request (count → 1, remaining → 1)', () => {
    const result = checkGuestLimit('1.1.1.1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.limit).toBe(2);
  });

  it('allows the second request (count → 2, remaining → 0)', () => {
    checkGuestLimit('1.1.1.1'); // 1st
    const result = checkGuestLimit('1.1.1.1'); // 2nd
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('denies the third request — over the limit', () => {
    checkGuestLimit('1.1.1.1'); // 1st
    checkGuestLimit('1.1.1.1'); // 2nd
    const result = checkGuestLimit('1.1.1.1'); // 3rd → blocked
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(2);
  });

  it('increments count on each allowed request', () => {
    const r1 = checkGuestLimit('2.2.2.2');
    expect(r1.remaining).toBe(1); // count=1
    const r2 = checkGuestLimit('2.2.2.2');
    expect(r2.remaining).toBe(0); // count=2
  });

  it('counts independently per IP — different IPs do not interfere', () => {
    checkGuestLimit('a'); // a=1
    checkGuestLimit('b'); // b=1
    checkGuestLimit('a'); // a=2

    // 'a' is now exhausted, 'b' still has one left
    expect(checkGuestLimit('a').allowed).toBe(false); // a over limit
    expect(checkGuestLimit('b').allowed).toBe(true);  // b still allowed
  });

  it('keeps count at the limit after a denied request (no increment)', () => {
    checkGuestLimit('c'); // 1
    checkGuestLimit('c'); // 2
    checkGuestLimit('c'); // denied, count stays 2
    // Subsequent calls still denied without further increment side-effects
    expect(checkGuestLimit('c').allowed).toBe(false);
  });
});

describe('getGuestRemaining', () => {
  beforeEach(() => {
    _resetGuestStoreForTesting();
  });

  it('returns the full limit for a fresh IP (no record)', () => {
    const result = getGuestRemaining('3.3.3.3');
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(2);
  });

  it('returns 1 remaining after one use', () => {
    checkGuestLimit('3.3.3.3'); // consumes 1
    const result = getGuestRemaining('3.3.3.3');
    expect(result.remaining).toBe(1);
  });

  it('returns 0 remaining when the limit is reached', () => {
    checkGuestLimit('3.3.3.3'); // 1
    checkGuestLimit('3.3.3.3'); // 2
    checkGuestLimit('3.3.3.3'); // denied
    expect(getGuestRemaining('3.3.3.3').remaining).toBe(0);
  });

  it('does not increment the count', () => {
    checkGuestLimit('3.3.3.3'); // count=1
    getGuestRemaining('3.3.3.3'); // no-op
    getGuestRemaining('3.3.3.3'); // no-op
    // count must still be 1 → next check still allowed with remaining 0
    const result = checkGuestLimit('3.3.3.3');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('returns full limit for an unknown IP without creating a record', () => {
    expect(getGuestRemaining('never-seen').remaining).toBe(2);
    // verify no record was created: a subsequent checkGuestLimit is still the "first"
    const first = checkGuestLimit('never-seen');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1); // first-use, not affected by the peek
  });
});
