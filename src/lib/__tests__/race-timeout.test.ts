/**
 * Tests for race-timeout.ts — raceWithTimeoutFallback + raceWithTimeoutReject
 *
 * 🔧 ARCH fix (Round 66 ARCH-DEEP-66): 测试覆盖率 — race-timeout 0 tests → 6 tests
 *
 * Note: Uses real timers with short durations (≤30ms). The behavior under test
 * (race between promise and timeout) is deterministic given delays an order of
 * magnitude apart, so fake timers aren't needed and avoid unhandled-rejection
 * warnings from un-awaited pending branches.
 */

import { describe, it, expect } from 'vitest';
import {
  raceWithTimeoutFallback,
  raceWithTimeoutReject,
} from '@/lib/race-timeout';

describe('raceWithTimeoutFallback', () => {
  it('returns promise result when promise resolves before timeout', async () => {
    const promise = Promise.resolve('real-result');
    const result = await raceWithTimeoutFallback(promise, 1_000, 'fallback');
    expect(result).toBe('real-result');
  });

  it('returns fallback when timeout fires first', async () => {
    // pending promise that never resolves on its own — only the timeout fires
    const pending = new Promise<string>(() => {});
    const result = await raceWithTimeoutFallback(pending, 10, 'fallback');
    expect(result).toBe('fallback');
  });

  it('throws when promise rejects before timeout', async () => {
    const promise = Promise.reject(new Error('boom'));
    await expect(
      raceWithTimeoutFallback(promise, 1_000, 'fallback'),
    ).rejects.toThrow('boom');
  });
});

describe('raceWithTimeoutReject', () => {
  it('returns result when promise resolves before timeout', async () => {
    const promise = Promise.resolve(42);
    const result = await raceWithTimeoutReject(
      promise,
      1_000,
      new Error('timeout'),
    );
    expect(result).toBe(42);
  });

  it('throws timeoutError when timeout fires first', async () => {
    const pending = new Promise<string>(() => {});
    await expect(
      raceWithTimeoutReject(pending, 10, new Error('timeout-bang')),
    ).rejects.toThrow('timeout-bang');
  });

  it('throws rejection when promise rejects before timeout', async () => {
    const promise = Promise.reject(new Error('rejection-bang'));
    await expect(
      raceWithTimeoutReject(promise, 1_000, new Error('timeout')),
    ).rejects.toThrow('rejection-bang');
  });
});
