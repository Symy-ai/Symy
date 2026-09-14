/**
 * Tests for mcp-tools/handlers/_shared.ts — pure helper functions
 *
 * 🔧 ARCH fix (Round 75 ARCH-DEEP-75): 测试覆盖率 — _shared.ts 0 tests → +N tests
 *
 * Scope: ONLY pure functions (no DB / no Supabase / no fetch).
 *   - isToolCallInProgress / releaseToolCallLock (in-memory Set ops)
 *   - resetDeltaRpcAvailability (resets module-level flag)
 *   - Constants: RPC_RETRY_INTERVAL_MS, BuddyDeltaParams type
 *
 * Skipped (require DB mocks):
 *   - applyBuddyStateDelta / applyBuddyStateDeltaLegacy
 *   - isDuplicateHealthEvent
 *   - getBuddyStateForRead
 *   - getUserLocale
 *   - acquireDistributedToolCallLock / releaseDistributedToolCallLock
 *
 * Note: inProgressToolCalls is a module-level Set. Tests must release locks
 * in finally blocks to avoid leaking state across tests. beforeEach also
 * cleans up by clearing the Set (via releaseToolCallLock on known keys).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isToolCallInProgress,
  releaseToolCallLock,
  resetDeltaRpcAvailability,
  RPC_RETRY_INTERVAL_MS,
} from '@/lib/mcp-tools/handlers/_shared';

// ============================================================
// isToolCallInProgress / releaseToolCallLock — in-memory Set
// ============================================================

describe('isToolCallInProgress', () => {
  // Clean up any locks created by tests (the Set is module-level).
  // Use unique keys per test to avoid cross-test contamination.
  const usedKeys: string[] = [];

  beforeEach(() => {
    // Release any locks from previous tests
    for (const k of usedKeys) {
      releaseToolCallLock(k);
    }
    usedKeys.length = 0;
  });

  it('returns false for a fresh key (first call)', () => {
    const key = 'test-fresh-key-1';
    usedKeys.push(key);
    expect(isToolCallInProgress(key)).toBe(false);
  });

  it('returns true for a key already in progress (second call)', () => {
    const key = 'test-dup-key-2';
    usedKeys.push(key);
    expect(isToolCallInProgress(key)).toBe(false); // first call
    expect(isToolCallInProgress(key)).toBe(true);  // second call → duplicate
  });

  it('returns true for repeated calls after first (3rd, 4th, ...)', () => {
    const key = 'test-repeat-key-3';
    usedKeys.push(key);
    isToolCallInProgress(key); // first
    isToolCallInProgress(key); // second → true
    expect(isToolCallInProgress(key)).toBe(true); // third → still true
    expect(isToolCallInProgress(key)).toBe(true); // fourth → still true
  });

  it('treats different keys as independent locks', () => {
    const keyA = 'test-independent-A-4';
    const keyB = 'test-independent-B-4';
    usedKeys.push(keyA, keyB);
    expect(isToolCallInProgress(keyA)).toBe(false);
    expect(isToolCallInProgress(keyB)).toBe(false);
    // Now both should be locked
    expect(isToolCallInProgress(keyA)).toBe(true);
    expect(isToolCallInProgress(keyB)).toBe(true);
  });

  it('handles empty string key (defensive)', () => {
    const key = '';
    usedKeys.push(key);
    expect(isToolCallInProgress(key)).toBe(false);
    expect(isToolCallInProgress(key)).toBe(true);
    releaseToolCallLock(key);
    expect(isToolCallInProgress(key)).toBe(false);
  });
});

describe('releaseToolCallLock', () => {
  const usedKeys: string[] = [];

  beforeEach(() => {
    for (const k of usedKeys) {
      releaseToolCallLock(k);
    }
    usedKeys.length = 0;
  });

  it('releases the lock so the next call is treated as fresh', () => {
    const key = 'test-release-key-1';
    usedKeys.push(key);
    expect(isToolCallInProgress(key)).toBe(false); // first call
    expect(isToolCallInProgress(key)).toBe(true);  // second call → dup
    releaseToolCallLock(key);
    expect(isToolCallInProgress(key)).toBe(false); // after release → fresh
  });

  it('is idempotent — releasing a non-locked key is a no-op', () => {
    const key = 'test-idempotent-key-2';
    usedKeys.push(key);
    // Never acquired — release should not throw
    expect(() => releaseToolCallLock(key)).not.toThrow();
    expect(() => releaseToolCallLock(key)).not.toThrow(); // double-release
    // And the key is still acquirable
    expect(isToolCallInProgress(key)).toBe(false);
  });

  it('only releases the specified key (not other keys)', () => {
    const keyA = 'test-isolation-A-3';
    const keyB = 'test-isolation-B-3';
    usedKeys.push(keyA, keyB);
    isToolCallInProgress(keyA); // lock A
    isToolCallInProgress(keyB); // lock B
    releaseToolCallLock(keyA);  // release only A
    expect(isToolCallInProgress(keyA)).toBe(false); // A is free
    expect(isToolCallInProgress(keyB)).toBe(true);  // B still locked
  });

  it('allows re-acquire → release → re-acquire cycle', () => {
    const key = 'test-cycle-key-4';
    usedKeys.push(key);
    // Cycle 1
    expect(isToolCallInProgress(key)).toBe(false);
    releaseToolCallLock(key);
    // Cycle 2
    expect(isToolCallInProgress(key)).toBe(false);
    releaseToolCallLock(key);
    // Cycle 3
    expect(isToolCallInProgress(key)).toBe(false);
  });
});

// ============================================================
// resetDeltaRpcAvailability — module-level flag reset
// ============================================================

describe('resetDeltaRpcAvailability', () => {
  it('is a function (exported)', () => {
    expect(typeof resetDeltaRpcAvailability).toBe('function');
  });

  it('does not throw when called', () => {
    expect(() => resetDeltaRpcAvailability()).not.toThrow();
  });

  it('can be called multiple times safely (idempotent)', () => {
    expect(() => {
      resetDeltaRpcAvailability();
      resetDeltaRpcAvailability();
      resetDeltaRpcAvailability();
    }).not.toThrow();
  });
});

// ============================================================
// RPC_RETRY_INTERVAL_MS constant
// ============================================================

describe('RPC_RETRY_INTERVAL_MS', () => {
  it('is a positive number (milliseconds)', () => {
    expect(typeof RPC_RETRY_INTERVAL_MS).toBe('number');
    expect(RPC_RETRY_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('equals 10 minutes (600_000 ms) per BUG-110 fix design', () => {
    // Documented design: retry RPC every 10 minutes to avoid permanently stuck flag.
    expect(RPC_RETRY_INTERVAL_MS).toBe(10 * 60 * 1000);
    expect(RPC_RETRY_INTERVAL_MS).toBe(600_000);
  });
});
