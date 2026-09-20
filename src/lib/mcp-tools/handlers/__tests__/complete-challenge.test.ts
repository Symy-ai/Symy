/**
 * Tests for complete_challenge handler — the highest-stakes untested code in the codebase.
 *
 * 🔧 Round 120 AUDIT-9: 0% test coverage → comprehensive suite
 *
 * What this file covers (Round 120 fixes + audit findings):
 *   1. Variable Reward — atomic RPC path (4 tiers + applyBuddyStateDelta failure downgrade)
 *      → AUDIT-2 P0 #1 fix: failure must downgrade to basic (no lying to user)
 *   2. Variable Reward — fallback 5-step path (4 tiers + failure downgrade)
 *   3. CAS rollback (AUDIT-6 P0 #1 fix): deposit_status='unsettled' (NOT null) on rollback
 *   4. Lock release (AUDIT-1 P1 #4): isToolCallInProgress + releaseToolCallLock in finally
 *   5. Dedup detection: isDuplicateHealthEvent true path
 *   6. Input validation: missing args, invalid saved_amount, challenge_id not found, etc.
 *   7. Invitation reward: awarded vs not awarded
 *   8. Failed status path (atomic + fallback)
 *   9. CAS rowsAffected=0 / cas_failed=true / unknown RPC state fail-closed
 *
 * Mocking strategy:
 *   - vi.mock('@/lib/mcp-tools/handlers/_shared') — applyBuddyStateDelta, isToolCallInProgress,
 *     releaseToolCallLock, isDuplicateHealthEvent, getUserLocale, logger
 *   - vi.mock('@/lib/supabase-admin') — createAdminClient (returns { supabase, error })
 *   - vi.mock('@/lib/health-impact') — createHealthEvent
 *   - vi.mock('@/lib/user-hourly-rate') — getUserHourlyRate
 *   - vi.mock('@/lib/invitation-reward') — processInvitationReward
 *   - vi.mock('@/lib/companion-rpc') — fireReplenishDailyNeed, fireBumpIntimacy, fireAddProactiveMessage
 *   - vi.mock('@/lib/platform-detector') — autoDetectPlatform
 *   - vi.mock('@/lib/challenge-store') — getChallengeById, completeChallenge
 *   - vi.spyOn(Math, 'random') to control variable reward tier
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Mocks — must be hoisted above imports
// ============================================================

vi.mock('@/lib/mcp-tools/handlers/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp-tools/handlers/_shared')>();
  return {
    ...actual,
    isToolCallInProgress: vi.fn(() => false),
    releaseToolCallLock: vi.fn(),
    // 🔧 P0-1/P0-2 fix (2026-07-18): mock distributed lock — always acquire
    acquireDistributedToolCallLock: vi.fn(async () => true),
    releaseDistributedToolCallLock: vi.fn(async () => undefined),
    isDuplicateHealthEvent: vi.fn(async () => false),
    // Default: applyBuddyStateDelta succeeds. Per-test can override via mockResolvedValueOnce.
    applyBuddyStateDelta: vi.fn(async () => ({
      success: true,
      tokens: 100,
      vitality: 60,
      level: 5,
      xp: 50,
      xpToNext: 100,
      streak: 1,
      totalSaved: 200,
      challengesCompleted: 3,
      badges: [],
      dreamFunds: [],
      error: undefined,
    })),
    getUserLocale: vi.fn(async () => 'en'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    deltaRpcHealth: { shouldTry: vi.fn(() => true), markAvailable: vi.fn(), markFailed: vi.fn(), reset: vi.fn() },
  };
});

vi.mock('@/lib/health-impact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/health-impact')>();
  return {
    ...actual,
    createHealthEvent: vi.fn(async () => ({ success: true, eventId: 'test-event-id' })),
  };
});

// supabase-admin mock — returns AdminClientResult shape { supabase, error }
// We expose mutable references so per-test can swap the rpc impl.
// vi.hoisted ensures these are defined BEFORE the vi.mock factory runs.
const { mockAdminRpc, mockAdminUpdate, mockGetChallengeById, mockCompleteChallenge } = vi.hoisted(() => ({
  mockAdminRpc: vi.fn(),
  mockAdminUpdate: vi.fn(),
  mockGetChallengeById: vi.fn(),
  mockCompleteChallenge: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      rpc: mockAdminRpc,
      from: vi.fn(() => ({
        update: (payload: Record<string, unknown>) => {
          mockAdminUpdate(payload);
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
              // Single-eq terminal shape used by some call sites
            })),
          };
        },
      })),
    },
    error: null,
  })),
}));

vi.mock('@/lib/user-hourly-rate', () => ({
  getUserHourlyRate: vi.fn(async () => 20),
}));

vi.mock('@/lib/invitation-reward', () => ({
  processInvitationReward: vi.fn(async () => ({
    awarded: false,
    refereePremiumDaysAwarded: 0,
    referrerUserId: null,
    referrerPremiumDaysAwarded: 0,
    
    toastMessageKey: '',
  })),
}));

vi.mock('@/lib/companion-rpc', () => ({
  fireReplenishDailyNeed: vi.fn(async () => undefined),
  fireBumpIntimacy: vi.fn(async () => undefined),
  fireAddProactiveMessage: vi.fn(async () => undefined),
  fireAddProactiveMessageWithVariety: vi.fn(async () => undefined),
}));

vi.mock('@/lib/platform-detector', () => ({
  autoDetectPlatform: vi.fn(async () => 'amazon'),
}));

// 🔧 P1-5 fix (2026-07-18): rollVariableReward is now seeded (deterministic).
// Tests use Math.random() spy — mock the helper to use Math.random() so
// existing tests work unchanged.
vi.mock('@/lib/mcp-tools/handlers/complete-challenge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp-tools/handlers/complete-challenge')>();
  return {
    ...actual,
    // Override rollVariableReward to use Math.random() (test-controlled via vi.spyOn)
    rollVariableReward: vi.fn((_seed?: string) => {
      const roll = Math.random();
      if (roll < 0.02) return { tier: 'golden' as const, bonusTokens: 20, bonusVitality: 10 };
      if (roll < 0.10) return { tier: 'item' as const, bonusTokens: 10, bonusVitality: 5 };
      if (roll < 0.30) return { tier: 'card' as const, bonusTokens: 5, bonusVitality: 0 };
      return { tier: 'basic' as const, bonusTokens: 0, bonusVitality: 0 };
    }),
  };
});

vi.mock('@/lib/challenge-store', () => ({
  getChallengeById: mockGetChallengeById,
  completeChallenge: mockCompleteChallenge,
}));

// ============================================================
// Imports (after mocks)
// ============================================================

import { handleCompleteChallenge } from '../complete_challenge';
import {
  applyBuddyStateDelta,
  isToolCallInProgress,
  isDuplicateHealthEvent,
  releaseToolCallLock,
  acquireDistributedToolCallLock,
  releaseDistributedToolCallLock,
} from '../_shared';
import { createHealthEvent } from '@/lib/health-impact';
import { processInvitationReward } from '@/lib/invitation-reward';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  fireReplenishDailyNeed,
  fireBumpIntimacy,
  fireAddProactiveMessage,
  fireAddProactiveMessageWithVariety,
} from '@/lib/companion-rpc';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { autoDetectPlatform } from '@/lib/platform-detector';
import { getChallengeById, completeChallenge } from '@/lib/challenge-store';

// ============================================================
// Helpers
// ============================================================

const USER_ID = '11111111-2222-3333-4444-555555555555';
const CHALLENGE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

type ActiveChallengeRow = {
  id: string;
  user_id: string;
  item_name: string;
  amount: number;
  challenge_type: 'quick_pass' | 'standard' | 'boss';
  status: 'active' | 'passed' | 'failed' | 'expired';
  created_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  deposit_status: 'unsettled' | 'processing' | 'deposited' | 'skipped';
  deposited_at: string | null;
};

function makeActiveChallengeRow(overrides: Partial<ActiveChallengeRow> = {}): ActiveChallengeRow {
  return {
    id: CHALLENGE_ID,
    user_id: USER_ID,
    item_name: 'Sneakers',
    amount: 50,
    challenge_type: 'standard',
    status: 'active',
    created_at: new Date(Date.now() - 60_000).toISOString(),
    completed_at: null,
    metadata: {},
    deposit_status: 'unsettled',
    deposited_at: null,
    ...overrides,
  };
}

/** Build a ctx for handleCompleteChallenge. ctx.supabase is used for non-admin queries. */
function makeCtx(overrides: Partial<{
  toolCallId: string;
  args: Record<string, unknown>;
  userId: string;
}> = {}) {
  const ctxSupabaseFrom = vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  }));
  return {
    toolCallId: overrides.toolCallId || 'test-call-1',
    args: overrides.args || {},
    userId: overrides.userId || USER_ID,
    supabase: {
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: ctxSupabaseFrom,
    } as any,
  };
}

/** Configure mockGetChallengeById to return an active standard challenge for $50. */
function setupActiveChallenge(overrides: Partial<ActiveChallengeRow> = {}) {
  mockGetChallengeById.mockResolvedValue({
    success: true,
    challenge: makeActiveChallengeRow(overrides),
  });
}

/** Configure mockAdminRpc to simulate atomic RPC success. */
function setupAtomicRpcSuccess(result: Record<string, unknown> = {}) {
  mockAdminRpc.mockResolvedValue({
    data: {
      success: true,
      tokens: 100,
      vitality: 60,
      level: 5,
      completed_event_id: 'evt-atomic-1',
      ...result,
    },
    error: null,
  });
}

/** Configure mockAdminRpc to simulate "function not found" → triggers 5-step fallback. */
function setupAtomicRpcFunctionMissing() {
  mockAdminRpc.mockResolvedValue({
    data: null,
    error: { code: '42883', message: 'Could not find the function complete_challenge_atomic' },
  });
}

/** Configure mockCompleteChallenge (5-step CAS) to succeed with rowsAffected=1. */
function setupCompleteChallengeCasSuccess() {
  mockCompleteChallenge.mockResolvedValue({ success: true, rowsAffected: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  // vi.clearAllMocks() only clears call history, NOT implementations.
  // We need mockReset() on hoisted mocks to clear mockResolvedValue state from
  // prior tests (otherwise e.g. mockCompleteChallenge.mockResolvedValue({success:false})
  // from a CAS edge case test leaks into the next describe block).
  // After mockReset(), tests MUST re-establish their own mock implementations.
  mockAdminRpc.mockReset();
  mockAdminUpdate.mockReset();
  mockGetChallengeById.mockReset();
  mockCompleteChallenge.mockReset();

  // Reset default mock behaviors
  vi.mocked(isToolCallInProgress).mockReturnValue(false);
  vi.mocked(isDuplicateHealthEvent).mockResolvedValue(false);
  // 🔧 P0-1/P0-2 fix (2026-07-18): reset distributed lock mocks too
  vi.mocked(acquireDistributedToolCallLock).mockResolvedValue(true);
  vi.mocked(releaseDistributedToolCallLock).mockResolvedValue(undefined);
  vi.mocked(applyBuddyStateDelta).mockResolvedValue({
    success: true,
    tokens: 100,
    vitality: 60,
    level: 5,
    xp: 50,
    xpToNext: 100,
    streak: 1,
    totalSaved: 200,
    challengesCompleted: 3,
    badges: [],
    dreamFunds: [],
    error: undefined,
  });
  vi.mocked(processInvitationReward).mockResolvedValue({
    awarded: false,
    refereePremiumDaysAwarded: 0,
    referrerUserId: null,
    referrerPremiumDaysAwarded: 0,
    
    toastMessageKey: '',
  });
  // Reset companion RPC mocks to default (success). Without this, a
  // mockRejectedValue from a prior test persists across tests because
  // vi.clearAllMocks() does NOT reset implementations.
  vi.mocked(fireReplenishDailyNeed).mockResolvedValue(undefined);
  vi.mocked(fireBumpIntimacy).mockResolvedValue(undefined);
  vi.mocked(fireAddProactiveMessage).mockResolvedValue(undefined);
  vi.mocked(fireAddProactiveMessageWithVariety).mockResolvedValue(undefined);
  // Default: no admin RPC calls expected unless test sets one up
  mockAdminRpc.mockResolvedValue({ data: null, error: null });
  // 🔧 ARCH fix (2026-07-18): reset createAdminClient mock implementation.
  //    The rollback test sets mockImplementation(() => throw) which persists
  //    across tests (vi.clearAllMocks only clears call history, not impls).
  //    Without this reset, subsequent tests crash with "createAdminClient crashed".
  vi.mocked(createAdminClient).mockReturnValue({
    supabase: {
      rpc: mockAdminRpc,
      from: vi.fn(() => ({
        update: (p: Record<string, unknown>) => {
          mockAdminUpdate(p);
          return { eq: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })) };
        },
      })),
    },
    error: null,
  } as any);
  // Default: getChallengeById returns "not found" — tests that need a valid
  // challenge MUST call setupActiveChallenge(). This makes tests explicit about
  // their precondition instead of relying on leaked mock state.
  mockGetChallengeById.mockResolvedValue({
    success: false,
    error: 'not found (default — call setupActiveChallenge() to override)',
  });
  // Default: completeChallenge (5-step CAS) returns success with rowsAffected=1.
  // Tests that need different behavior can override.
  mockCompleteChallenge.mockResolvedValue({ success: true, rowsAffected: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
  // 🔧 P0-1/P0-2 fix (2026-07-18): restoreAllMocks resets vi.fn implementations
  //    to their factory defaults. The distributed lock mocks default to
  //    `vi.fn(async () => true)` / `vi.fn(async () => undefined)`, but
  //    restoreAllMocks may clear them. Re-establish here to be safe.
  vi.mocked(acquireDistributedToolCallLock).mockResolvedValue(true);
  vi.mocked(releaseDistributedToolCallLock).mockResolvedValue(undefined);
});

// ============================================================
// 1. Variable Reward — Atomic RPC path (4 tiers)
// ============================================================

describe('Variable Reward — atomic RPC path', () => {
  beforeEach(() => {
    setupActiveChallenge();
    setupAtomicRpcSuccess();
  });

  it('returns golden tier (2% roll) with +20 tokens +10 vitality when applyBuddyStateDelta succeeds', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // < 0.02 → golden

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('golden');
    expect(result.result.bonusTokens).toBe(20);
    expect(result.result.bonusVitality).toBe(10);
    expect(result.result.bonusApplied).toBe(true);
    // tokenReward = base (4 for standard) + bonus 20 = 24
    expect(result.result.tokenReward).toBe(24);
    // vitalityReward = base (5 for standard) + bonus 10 = 15
    expect(result.result.vitalityReward).toBe(15);
    // Message includes golden tier text
    expect(result.message).toContain('GOLDEN GUARD');
    expect(result.message).toContain('+20 tokens');
    // applyBuddyStateDelta called twice: once for variable reward bonus
    // (main reward was inside atomic RPC, not applyBuddyStateDelta)
    expect(applyBuddyStateDelta).toHaveBeenCalledTimes(1);
    const deltaCall = vi.mocked(applyBuddyStateDelta).mock.calls[0];
    expect(deltaCall?.[1]).toEqual({ tokenDelta: 20, vitalityDelta: 10 });
  });

  it('returns item tier (8% roll, <0.10) with +10 tokens +5 vitality when applyBuddyStateDelta succeeds', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // 0.02 ≤ x < 0.10 → item

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('item');
    expect(result.result.bonusTokens).toBe(10);
    expect(result.result.bonusVitality).toBe(5);
    expect(result.result.bonusApplied).toBe(true);
    // standard base token = 4, bonus 10 → 14
    expect(result.result.tokenReward).toBe(14);
    // standard base vitality = 5, bonus 5 → 10
    expect(result.result.vitalityReward).toBe(10);
    expect(result.message).toContain('Bonus reward');
    expect(result.message).toContain('+10 tokens');
  });

  it('returns card tier (20% roll, <0.30) with +5 tokens only when applyBuddyStateDelta succeeds', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.20); // 0.10 ≤ x < 0.30 → card

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('card');
    expect(result.result.bonusTokens).toBe(5);
    expect(result.result.bonusVitality).toBe(0);
    expect(result.result.bonusApplied).toBe(true);
    // standard base token = 4, bonus 5 → 9
    expect(result.result.tokenReward).toBe(9);
    // standard base vitality = 5, no bonus → 5
    expect(result.result.vitalityReward).toBe(5);
    expect(result.message).toContain('Bonus +5 tokens');
    // applyBuddyStateDelta called with tokenDelta=5, vitalityDelta=0
    const deltaCall = vi.mocked(applyBuddyStateDelta).mock.calls[0];
    expect(deltaCall?.[1]).toEqual({ tokenDelta: 5, vitalityDelta: 0 });
  });

  it('returns basic tier (70% roll) with bonusApplied=false, bonusTokens=0, no applyBuddyStateDelta call', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.50); // ≥ 0.30 → basic

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('basic');
    expect(result.result.bonusTokens).toBe(0);
    expect(result.result.bonusVitality).toBe(0);
    expect(result.result.bonusApplied).toBe(false);
    // standard base only
    expect(result.result.tokenReward).toBe(4);
    expect(result.result.vitalityReward).toBe(5);
    // No bonus applyBuddyStateDelta call (basic tier skips the bonus)
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    // Message should NOT contain golden/item/card tier text
    expect(result.message).not.toContain('GOLDEN');
    expect(result.message).not.toContain('Bonus');
  });

  // ============================================================
  // 🔧 Round 120 AUDIT-2 P0 #1 fix — CRITICAL test
  // ============================================================
  it('CRITICAL: applyBuddyStateDelta failure downgrades to basic tier — bonusApplied=false, bonusTokens=0, no lying to user', async () => {
    // Roll lands on golden, but applyBuddyStateDelta fails
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // golden
    vi.mocked(applyBuddyStateDelta).mockRejectedValueOnce(new Error('DB connection lost'));

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    // CRITICAL assertions: the fix — no lying
    expect(result.result.rewardTier).toBe('basic'); // downgraded
    expect(result.result.bonusTokens).toBe(0); // zeroed
    expect(result.result.bonusVitality).toBe(0); // zeroed
    expect(result.result.bonusApplied).toBe(false); // FAILED, not lied
    // tokenReward = base only (no bonus)
    expect(result.result.tokenReward).toBe(4); // standard base
    expect(result.result.vitalityReward).toBe(5); // standard base
    // Message must NOT contain golden/item/card text — user should not see bonus promises
    expect(result.message).not.toContain('GOLDEN');
    expect(result.message).not.toContain('Bonus');
    // applyBuddyStateDelta was attempted (and threw)
    expect(applyBuddyStateDelta).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 2. Variable Reward — Fallback 5-step path (4 tiers + failure)
// ============================================================

describe('Variable Reward — fallback 5-step path', () => {
  beforeEach(() => {
    setupActiveChallenge();
    setupAtomicRpcFunctionMissing(); // forces fallback to 5-step
    setupCompleteChallengeCasSuccess();
  });

  it('returns golden tier (+20 tokens +10 vitality) on fallback path', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // golden

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('golden');
    expect(result.result.bonusTokens).toBe(20);
    expect(result.result.bonusVitality).toBe(10);
    expect(result.result.bonusApplied).toBe(true);
    // fallback path: newTokens = result.tokens (100) + bonusTokens (20) = 120
    expect(result.result.newTokens).toBe(120);
    expect(result.result.newVitality).toBe(70); // 60 + 10
    expect(result.message).toContain('GOLDEN GUARD');
    // applyBuddyStateDelta called twice: main reward + bonus
    expect(applyBuddyStateDelta).toHaveBeenCalledTimes(2);
    // Second call is the bonus one
    const bonusCall = vi.mocked(applyBuddyStateDelta).mock.calls[1];
    expect(bonusCall?.[1]).toEqual({ tokenDelta: 20, vitalityDelta: 10 });
  });

  it('returns item tier (+10 tokens +5 vitality) on fallback path', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('item');
    expect(result.result.bonusTokens).toBe(10);
    expect(result.result.bonusVitality).toBe(5);
    expect(result.result.bonusApplied).toBe(true);
    expect(result.result.newTokens).toBe(110); // 100 + 10
    expect(result.result.newVitality).toBe(65); // 60 + 5
  });

  it('returns card tier (+5 tokens only) on fallback path', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.20);

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('card');
    expect(result.result.bonusTokens).toBe(5);
    expect(result.result.bonusApplied).toBe(true);
    expect(result.result.newTokens).toBe(105); // 100 + 5
    expect(result.result.newVitality).toBe(60); // no vitality bonus
  });

  it('returns basic tier (no bonus) on fallback path — applyBuddyStateDelta called once (main only)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.50);

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.rewardTier).toBe('basic');
    expect(result.result.bonusTokens).toBe(0);
    expect(result.result.bonusApplied).toBe(false);
    // Only ONE applyBuddyStateDelta call (the main one) — basic tier skips bonus
    expect(applyBuddyStateDelta).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL: applyBuddyStateDelta failure on fallback path downgrades to basic (no lying to user)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // golden roll
    // First call (main reward) succeeds; second call (bonus) fails
    vi.mocked(applyBuddyStateDelta)
      .mockResolvedValueOnce({
        success: true,
        tokens: 100,
        vitality: 60,
        level: 5,
        xp: 50,
        xpToNext: 100,
        streak: 1,
        totalSaved: 200,
        challengesCompleted: 3,
        badges: [],
        dreamFunds: [],
      })
      .mockRejectedValueOnce(new Error('DB connection lost'));

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    // CRITICAL: downgraded, not lied
    expect(result.result.rewardTier).toBe('basic');
    expect(result.result.bonusTokens).toBe(0);
    expect(result.result.bonusVitality).toBe(0);
    expect(result.result.bonusApplied).toBe(false);
    // newTokens = result.tokens (100) + (bonusApplied ? bonusTokens : 0) = 100 + 0 = 100
    expect(result.result.newTokens).toBe(100);
    expect(result.result.newVitality).toBe(60);
    expect(result.message).not.toContain('GOLDEN');
    expect(result.message).not.toContain('Bonus');
  });
});

// ============================================================
// 3. CAS rollback — applyBuddyStateDelta fails AFTER CAS commit
//    (Round 120 AUDIT-6 P0 #1 fix: deposit_status='unsettled' NOT null)
// ============================================================

describe('CAS rollback — applyBuddyStateDelta failure after CAS commit', () => {
  beforeEach(() => {
    setupActiveChallenge();
    setupAtomicRpcFunctionMissing(); // forces 5-step fallback
    setupCompleteChallengeCasSuccess(); // CAS succeeds → commit
    vi.spyOn(Math, 'random').mockReturnValue(0.50); // basic tier — keeps test focused on rollback
  });

  it('CRITICAL (AUDIT-6 P0 #1): rollback sets deposit_status="unsettled" (NOT null)', async () => {
    // Main applyBuddyStateDelta fails AFTER CAS commit → triggers rollback
    vi.mocked(applyBuddyStateDelta).mockResolvedValueOnce({
      success: false,
      error: 'DB connection lost',
      tokens: 0,
      vitality: 0,
      level: 0,
      xp: 0,
      xpToNext: 100,
      streak: 0,
      totalSaved: 0,
      challengesCompleted: 0,
      badges: [],
      dreamFunds: [],
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    // 🔧 ARCH fix (2026-07-18): message includes "rolled back" on success
    expect(result.message).toContain('rolled back');

    // CRITICAL: verify rollback UPDATE was called
    // 🔧 ARCH fix: rollbackChallengeStatusOnFailure creates its own admin client,
    //    so the rollback payload is the LAST mockAdminUpdate call (not the first,
    //    which is the metadata update from updateChallengeMetadataWithPlatform).
    expect(mockAdminUpdate).toHaveBeenCalled();
    const allCalls = mockAdminUpdate.mock.calls;
    const rollbackPayload = allCalls[allCalls.length - 1][0] as Record<string, unknown>;
    // AUDIT-6 P0 #1 fix: deposit_status must be 'unsettled' (NOT null)
    expect(rollbackPayload.deposit_status).toBe('unsettled');
    expect(rollbackPayload.deposit_status).not.toBeNull();
    expect(rollbackPayload.status).toBe('active');
    expect(rollbackPayload.completed_at).toBeNull();
  });

  it('rollback failure is logged but does not crash handler', async () => {
    vi.mocked(applyBuddyStateDelta).mockResolvedValueOnce({
      success: false,
      error: 'DB timeout',
      tokens: 0,
      vitality: 0,
      level: 0,
      xp: 0,
      xpToNext: 100,
      streak: 0,
      totalSaved: 0,
      challengesCompleted: 0,
      badges: [],
      dreamFunds: [],
    });
    // 🔧 ARCH fix (2026-07-18): rollbackChallengeStatusOnFailure now creates
    //    its own admin client internally. To make rollback fail, we mock
    //    createAdminClient to throw on the rollback call.
    //    The first createAdminClient call is for the atomic RPC attempt
    //    (which fails with function-missing → fallback to 5-step).
    //    The second createAdminClient call is for updateChallengeMetadataWithPlatform.
    //    The third createAdminClient call is for rollbackChallengeStatusOnFailure.
    //    We make ALL calls return a valid client EXCEPT we make the rollback
    //    helper's internal createAdminClient throw.
    //    Easier approach: mock createAdminClient to throw on every call after
    //    the first — the rollback will fail and be logged.
    let callCount = 0;
    const adminClientMock = vi.mocked(createAdminClient);
    adminClientMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // First 2 calls: return valid client (atomic RPC + metadata update)
        return {
          supabase: {
            rpc: mockAdminRpc,
            from: vi.fn(() => ({
              update: (p: Record<string, unknown>) => {
                mockAdminUpdate(p);
                return { eq: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })) };
              },
            })),
          },
          error: null,
        } as any;
      }
      // 3rd+ calls (rollback): throw
      throw new Error('createAdminClient crashed');
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    // Should not throw — rollback failure is caught internally
    const result = await handleCompleteChallenge(ctx);
    expect(result.success).toBe(false);
    // 🔧 ARCH fix (2026-07-18): message now says "rollback FAILED" when
    //    rollback fails (was "rolled back" in old code which was misleading).
    expect(result.message).toContain('rollback FAILED');
  });
});

// ============================================================
// 4. Lock release (AUDIT-1 P1 #4)
// ============================================================

describe('Lock release — isToolCallInProgress + releaseToolCallLock', () => {
  it('returns already-completed message when isToolCallInProgress returns true (duplicate in-progress)', async () => {
    // getChallengeById is called BEFORE isToolCallInProgress check (handler line 71-151),
    // so we MUST provide a valid challenge for the dedup lock check to be reached.
    setupActiveChallenge();
    vi.mocked(isToolCallInProgress).mockReturnValue(true);

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.alreadyCompleted).toBe(true);
    // 🔧 ARCH fix (2026-07-18): unified message — was "just completed", now
    // uses buildAlreadyCompletedMessage helper (same wording for all dedup paths).
    expect(result.message).toContain('already completed');
    expect(result.message).toContain('respond as if celebrating again');
    // Must NOT call atomic RPC or execute main flow
    expect(mockAdminRpc).not.toHaveBeenCalled();
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(completeChallenge).not.toHaveBeenCalled();
    // Note: releaseToolCallLock is NOT called here because the early return
    // happens BEFORE the try/finally block. The lock is held by the FIRST
    // caller (who returned false from isToolCallInProgress), not this caller.
    expect(releaseToolCallLock).not.toHaveBeenCalled();
  });

  it('releaseToolCallLock is always called in finally block on normal path', async () => {
    setupActiveChallenge();
    setupAtomicRpcSuccess();
    vi.spyOn(Math, 'random').mockReturnValue(0.50);

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    await handleCompleteChallenge(ctx);

    expect(releaseToolCallLock).toHaveBeenCalledTimes(1);
    // Verify the lockKey passed matches expected format: cc:userId:challengeId
    const lockKey = vi.mocked(releaseToolCallLock).mock.calls[0][0];
    expect(lockKey).toBe(`cc:${USER_ID}:${CHALLENGE_ID}`);
  });

  it('🔧 P0-5 fix (2026-07-18): releaseToolCallLock is called even when companion RPC fails (no throw)', async () => {
    setupActiveChallenge();
    setupAtomicRpcSuccess();
    vi.spyOn(Math, 'random').mockReturnValue(0.50);
    // 🔧 OLD behavior: fireReplenishDailyNeed rejecting → Promise.all rejects
    //    → handler throws → AI gets 500 → retry → "already completed" confusion.
    // 🔧 NEW behavior: fireCompletionCompanionEffects catches the rejection.
    //    Handler still succeeds. Lock is released in finally.
    vi.mocked(fireReplenishDailyNeed).mockRejectedValue(new Error('companion RPC down'));

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    // Handler should SUCCEED (not throw) — companion failure is non-blocking
    const result = await handleCompleteChallenge(ctx);
    expect(result.success).toBe(true);
    // Lock must still be released
    expect(releaseToolCallLock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 5. Dedup detection — isDuplicateHealthEvent
// ============================================================

describe('Dedup detection — isDuplicateHealthEvent', () => {
  it('returns already-completed message when isDuplicateHealthEvent returns true', async () => {
    setupActiveChallenge();
    vi.mocked(isDuplicateHealthEvent).mockResolvedValue(true);

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.alreadyCompleted).toBe(true);
    expect(result.message).toContain('already completed');
    // Must NOT call atomic RPC or execute main flow
    expect(mockAdminRpc).not.toHaveBeenCalled();
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    // Lock still released
    expect(releaseToolCallLock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 6. Input validation
// ============================================================

describe('Input validation', () => {
  it('rejects missing user_id (empty userId in ctx)', async () => {
    // userId is read from ctx.userId — handler does not explicitly check,
    // but downstream calls (getChallengeById) require it. Test the propagation.
    mockGetChallengeById.mockResolvedValue({
      success: false,
      error: 'userId required',
    });

    const ctx = makeCtx({
      userId: '',
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('returns error when challenge_id is not found in active_challenges', async () => {
    mockGetChallengeById.mockResolvedValue({
      success: false,
      error: 'Challenge not found or does not belong to this user',
    });

    // 🔧 P1-6 fix (2026-07-18): use valid UUID format (was 'nonexistent-id')
    //    validateChallengeId now rejects non-UUID strings.
    const ctx = makeCtx({
      args: { challenge_id: '11111111-2222-3333-4444-555555555555', locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(result.message).toContain('retry with explicit');
    // Should not call atomic RPC, applyBuddyStateDelta, or companion RPC
    expect(mockAdminRpc).not.toHaveBeenCalled();
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(fireReplenishDailyNeed).not.toHaveBeenCalled();
  });

  it('returns already-completed message when challenge status is "passed" (not active)', async () => {
    setupActiveChallenge({ status: 'passed', completed_at: new Date().toISOString() });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.alreadyCompleted).toBe(true);
    expect(result.message).toContain('already completed earlier');
    // No reward application
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid saved_amount (NaN) in legacy mode', async () => {
    const ctx = makeCtx({
      args: { challenge_type: 'standard', saved_amount: 'not-a-number', locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('saved_amount');
    expect(result.message).toContain('> 0');
  });

  it('rejects saved_amount <= 0 in legacy mode', async () => {
    const ctx = makeCtx({
      args: { challenge_type: 'standard', saved_amount: 0, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('saved_amount');
  });

  it('auto-corrects challenge_type based on saved_amount threshold (legacy mode)', async () => {
    // saved_amount=300 → boss (>$200); AI passed 'quick_pass' → should be corrected to 'boss'
    const ctx = makeCtx({
      args: { challenge_type: 'quick_pass', saved_amount: 300, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    // Boss path: base token=10, vitality=10, xp=50, badge 'boss_slayer'
    expect(result.success).toBe(true);
    expect(result.result.challengeType).toBe('boss');
    expect(result.result.tokenReward).toBe(10);
    expect(result.result.vitalityReward).toBe(10);
    expect(result.result.badgeAwarded).toBe('boss_slayer');
  });

  it('challenge_id mode takes priority over legacy challenge_type arg', async () => {
    setupActiveChallenge({ challenge_type: 'standard', amount: 50 });
    setupAtomicRpcSuccess();
    vi.spyOn(Math, 'random').mockReturnValue(0.50);

    const ctx = makeCtx({
      args: {
        challenge_id: CHALLENGE_ID,
        challenge_type: 'quick_pass', // should be ignored — challenge_id wins
        saved_amount: 999, // should be ignored
        locale: 'en',
      },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    // challenge_id mode → uses challenge from DB (standard, $50)
    expect(result.result.challengeType).toBe('standard');
    expect(result.result.savedAmount).toBe(50);
    expect(result.result.atomic).toBe(true);
  });
});

// ============================================================
// 7. Invitation reward (Round 120 fix)
// ============================================================

describe('Invitation reward', () => {
  beforeEach(() => {
    setupActiveChallenge();
    setupAtomicRpcFunctionMissing(); // use fallback path — only path that reaches processInvitationReward
    setupCompleteChallengeCasSuccess();
    vi.spyOn(Math, 'random').mockReturnValue(0.50);
  });

  it('sets inviteRewardToast when processInvitationReward returns awarded=true', async () => {
    vi.mocked(processInvitationReward).mockResolvedValueOnce({
      awarded: true,
      refereePremiumDaysAwarded: 30,
      referrerUserId: 'referrer-uuid',
      referrerPremiumDaysAwarded: 30,
      
      toastMessageKey: 'chat.inviteRewardToast',
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.inviteRewardToast).toBe('chat.inviteRewardToast');
    expect(processInvitationReward).toHaveBeenCalledWith(USER_ID);
  });

  it('inviteRewardToast is null when processInvitationReward returns awarded=false', async () => {
    vi.mocked(processInvitationReward).mockResolvedValueOnce({
      awarded: false,
      refereePremiumDaysAwarded: 0,
      referrerUserId: null,
      referrerPremiumDaysAwarded: 0,
      
      toastMessageKey: '',
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.inviteRewardToast).toBeNull();
  });

  it('invitation reward error is non-blocking — handler still succeeds', async () => {
    vi.mocked(processInvitationReward).mockRejectedValueOnce(new Error('invitations table missing'));

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    // Should not fail the whole handler
    expect(result.success).toBe(true);
    expect(result.result.inviteRewardToast).toBeNull();
  });
});

// ============================================================
// 8. Failed status path (status='failed' — user bought the item)
// ============================================================

describe('Failed status (status="failed") — user bought the item', () => {
  it('atomic RPC path: returns "Challenge failed" message, no rewards', async () => {
    setupActiveChallenge();
    setupAtomicRpcSuccess({ success: true, rewards_applied: false });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, status: 'failed', locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.status).toBe('failed');
    expect(result.result.rewardApplied).toBe(false);
    expect(result.message).toContain('Challenge failed');
    expect(result.message).toContain('record_impulse');
    // Should NOT apply variable reward in failed path
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    // Should create challenge_failed health event
    expect(createHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'challenge_failed' }),
    );
    // Companion RPC: failed path uses intimacy +1 (not +3)
    expect(fireBumpIntimacy).toHaveBeenCalledWith(USER_ID, 1);
  });

  it('fallback 5-step path: returns "Challenge failed" message, no rewards', async () => {
    setupActiveChallenge();
    setupAtomicRpcFunctionMissing();
    setupCompleteChallengeCasSuccess();

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, status: 'failed', locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.status).toBe('failed');
    expect(result.result.rewardApplied).toBe(false);
    expect(result.message).toContain('Challenge failed');
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(createHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'challenge_failed' }),
    );
  });
});

// ============================================================
// 9. CAS edge cases — rowsAffected=0, cas_failed, unknown state
// ============================================================

describe('CAS edge cases', () => {
  it('atomic RPC cas_failed=true → returns already-completed (concurrent request won)', async () => {
    setupActiveChallenge();
    mockAdminRpc.mockResolvedValue({
      data: { success: false, cas_failed: true },
      error: null,
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.alreadyCompleted).toBe(true);
    // 🔧 ARCH fix (2026-07-18): unified message — was "already completed by a
    // concurrent request", now uses buildAlreadyCompletedMessage helper.
    expect(result.message).toContain('already completed');
    expect(result.message).toContain('respond as if celebrating again');
    // No rewards applied
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('atomic RPC returns unknown state (success=false, cas_failed not true) → fail-closed, no fallthrough', async () => {
    setupActiveChallenge();
    mockAdminRpc.mockResolvedValue({
      data: { success: false }, // no cas_failed flag
      error: null,
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    // Round 27 R25-13 fix: fail-closed, NOT fall through to 5-step (would double-apply)
    expect(result.success).toBe(false);
    expect(result.message).toContain('unknown state');
    // MUST NOT call applyBuddyStateDelta (no double-apply)
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    // MUST NOT call completeChallenge (5-step fallback)
    expect(completeChallenge).not.toHaveBeenCalled();
  });

  it('atomic RPC returns non-"function missing" error → returns error, no fallback', async () => {
    setupActiveChallenge();
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('duplicate key');
    // MUST NOT fall back to 5-step
    expect(completeChallenge).not.toHaveBeenCalled();
  });

  it('5-step CAS rowsAffected=0 → returns already-completed (concurrent request won)', async () => {
    setupActiveChallenge();
    setupAtomicRpcFunctionMissing();
    mockCompleteChallenge.mockResolvedValue({ success: true, rowsAffected: 0 });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.alreadyCompleted).toBe(true);
    // 🔧 ARCH fix (2026-07-18): unified message — was "already completed by a
    // concurrent request", now uses buildAlreadyCompletedMessage helper.
    expect(result.message).toContain('already completed');
    expect(result.message).toContain('respond as if celebrating again');
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('5-step CAS returns success=false (DB error) → returns failure', async () => {
    setupActiveChallenge();
    setupAtomicRpcFunctionMissing();
    mockCompleteChallenge.mockResolvedValue({ success: false, error: 'connection refused' });

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('connection refused');
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });
});

// ============================================================
// 10. Atomic RPC metadata update — deposit_status='unsettled'
//     (only on passed path with savedAmount > 0)
// ============================================================

describe('Atomic RPC passed path — deposit_status metadata', () => {
  beforeEach(() => {
    setupActiveChallenge();
    setupAtomicRpcSuccess();
    vi.spyOn(Math, 'random').mockReturnValue(0.50);
  });

  it('updates active_challenges with deposit_status="unsettled" on passed path', async () => {
    // 🔧 ARCH fix (2026-07-18): metadata update now uses adminSupabase (not ctx.supabase)
    //    via updateChallengeMetadataWithPlatform helper. Track via mockAdminUpdate.
    mockAdminUpdate.mockClear();
    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    await handleCompleteChallenge(ctx);

    // Verify deposit_status='unsettled' in the metadata update payload
    expect(mockAdminUpdate).toHaveBeenCalled();
    const metadataPayload = mockAdminUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(metadataPayload?.deposit_status).toBe('unsettled');
    expect(metadataPayload?.metadata).toHaveProperty('challenge_duration');
    expect(metadataPayload?.metadata).toHaveProperty('platform');
    expect(metadataPayload?.metadata).toHaveProperty('completed_at_ts');
  });

  it('does NOT set deposit_status on failed path (no money to deposit)', async () => {
    // 🔧 ARCH fix (2026-07-18): same as above — uses adminSupabase via helper.
    mockAdminUpdate.mockClear();
    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, status: 'failed', locale: 'en' },
    });

    await handleCompleteChallenge(ctx);

    // Failed path: update payload should NOT contain deposit_status
    expect(mockAdminUpdate).toHaveBeenCalled();
    const metadataPayload = mockAdminUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(metadataPayload).not.toHaveProperty('deposit_status');
    expect(metadataPayload?.metadata).toHaveProperty('challenge_duration');
  });
});

// ============================================================
// 11. Companion RPC calls (P1-5 mechanism closure)
// ============================================================

describe('Companion RPC — P1-5 mechanism closure', () => {
  beforeEach(() => {
    setupActiveChallenge();
    setupAtomicRpcSuccess();
    vi.spyOn(Math, 'random').mockReturnValue(0.50);
  });

  it('atomic RPC passed path calls fireReplenishDailyNeed(clarity,20) + fireBumpIntimacy(3) + fireAddProactiveMessageWithVariety', async () => {
    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    await handleCompleteChallenge(ctx);

    expect(fireReplenishDailyNeed).toHaveBeenCalledWith(USER_ID, 'clarity', 20);
    expect(fireBumpIntimacy).toHaveBeenCalledWith(USER_ID, 3);
    // 🔧 message-variety fix: 改用 fireAddProactiveMessageWithVariety, 只传 userId + trigger
    //   旧代码: 硬编码 completed_1 → 同一条消息重复出现（已废弃 2026-09-05）
    //   修复: 内部从 pool 随机选, 避开最近 10 条
    expect(fireAddProactiveMessageWithVariety).toHaveBeenCalledWith(
      USER_ID,
      'challenge_completed',
    );
  });

  it('🔧 P0-5 fix (2026-07-18): companion RPC failure is CAUGHT — handler still succeeds, lock released', async () => {
    // 🔧 OLD behavior: bare `await Promise.all([...])` — if ANY of the 3 RPCs
    //    rejected, Promise.all rejected, handler threw 500 EVEN THOUGH the
    //    challenge was already committed. AI retried → hit dedup → returned
    //    "already completed" → user saw no reward confirmation.
    // 🔧 NEW behavior: fireCompletionCompanionEffects wraps in try/catch.
    //    Challenge completion succeeds even if companion RPCs are down.
    vi.mocked(fireReplenishDailyNeed).mockRejectedValue(new Error('companion RPC down'));

    const ctx = makeCtx({
      args: { challenge_id: CHALLENGE_ID, locale: 'en' },
    });

    // Handler should SUCCEED (not throw) — challenge is already committed
    const result = await handleCompleteChallenge(ctx);
    expect(result.success).toBe(true);
    // Lock must still be released
    expect(releaseToolCallLock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 12. Legacy mode (no challenge_id) — bypasses atomic RPC + 5-step
// ============================================================

describe('Legacy mode — no challenge_id', () => {
  it('skips atomic RPC + 5-step fallback, goes directly to applyBuddyStateDelta', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.50);

    const ctx = makeCtx({
      args: { challenge_type: 'standard', saved_amount: 50, locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.challengeType).toBe('standard');
    expect(result.result.savedAmount).toBe(50);
    // atomic: false (no challengeId → no atomic RPC path)
    expect(result.result.atomic).toBeUndefined();
    // Neither getChallengeById nor completeChallenge should be called
    expect(getChallengeById).not.toHaveBeenCalled();
    expect(completeChallenge).not.toHaveBeenCalled();
    // But applyBuddyStateDelta IS called (main reward)
    expect(applyBuddyStateDelta).toHaveBeenCalledTimes(1);
    // Health event created
    expect(createHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'challenge_completed' }),
    );
  });

  // 🔧 wool v10 ① fix: legacy + failed 旧缺陷 — 直落 applyBuddyStateDelta 全额发奖
  //    + challenge_completed 事件。现与 Mode A 同语义: 零奖励 + challenge_failed 审计。
  it('status="failed" applies ZERO rewards — audit-only challenge_failed event, failed return shape', async () => {
    const ctx = makeCtx({
      args: { challenge_type: 'standard', saved_amount: 50, status: 'failed', locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    // buildFailedReturn normalized shape (same as Mode A fallback failed path)
    expect(result.success).toBe(true);
    expect(result.result.status).toBe('failed');
    expect(result.result.rewardApplied).toBe(false);
    expect(result.result.challengeId).toBeUndefined();
    expect(result.result.atomic).toBe(false);
    expect(result.message).toContain('Challenge failed');
    expect(result.message).toContain('No rewards applied');
    expect(result.message).toContain('record_impulse');

    // 零奖励: 奖励入账与邀请奖励都不得触发
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(processInvitationReward).not.toHaveBeenCalled();

    // 审计: challenge_failed 事件, 奖励 override 归零, triggerId 用 type+amount (无 challengeId)
    expect(createHealthEvent).toHaveBeenCalledTimes(1);
    expect(createHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'challenge_failed',
        triggerId: `cf:${USER_ID}:standard:50`,
        vitalityOverride: 0,
        tokenOverride: 0,
      }),
    );

    // 陪伴效应走 failed 语义 (intimacy +1 / 'challenge_failed' trigger, 非 passed 的 +3)
    expect(fireBumpIntimacy).toHaveBeenCalledWith(USER_ID, 1);
    expect(fireAddProactiveMessageWithVariety).toHaveBeenCalledWith(USER_ID, 'challenge_failed');
  });

  it('status="failed": createHealthEvent throwing is non-blocking — still failed shape with healthEventCreated=false', async () => {
    vi.mocked(createHealthEvent).mockRejectedValueOnce(new Error('health_events table missing'));

    const ctx = makeCtx({
      args: { challenge_type: 'standard', saved_amount: 50, status: 'failed', locale: 'en' },
    });

    const result = await handleCompleteChallenge(ctx);

    expect(result.success).toBe(true);
    expect(result.result.status).toBe('failed');
    expect(result.result.rewardApplied).toBe(false);
    expect(result.result.healthEventCreated).toBe(false);
    // 审计失败也不得回退到发奖励
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });
});
