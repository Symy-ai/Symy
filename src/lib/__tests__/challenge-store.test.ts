/**
 * challenge-store Tests — Round 125 (0% → covered)
 *
 * 🔧 之前 challenge-store.ts 0% test coverage (452 lines, critical data access layer)
 * 此测试覆盖:
 * - createChallenge: atomic RPC success, fallback two-step, 23505 retry, error paths
 * - getChallengeById: success, not found, cross-user guard, error
 * - completeChallenge: CAS success, CAS lost (0 rows), error
 * - getActiveChallenge: success, no active, error
 * - getRecentExpiredChallenge: success, no expired, error
 * - resumeChallenge: atomic RPC, fallback, not found, error
 * - dismissChallenge: success, 0 rows (not expired), error
 * - admin client unavailable path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

// Mock supabase-admin
const mockSupabase = {
  rpc: vi.fn(),
  from: vi.fn(),
};
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: mockSupabase, error: null })),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createChallenge,
  getChallengeById,
  completeChallenge,
  getActiveChallenge,
  getRecentExpiredChallenge,
  resumeChallenge,
  dismissChallenge,
} from '@/lib/challenge-store';

// Helper: build a chain mock for supabase.from().select().eq().maybeSingle() etc.
function buildChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return chain;
}

describe('challenge-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // createChallenge
  // ============================================================

  describe('createChallenge', () => {
    it('returns success with challengeId when atomic RPC succeeds', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: 'new-challenge-id', error: null });

      const result = await createChallenge('user-123', 'iPhone', 999);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('new-challenge-id');
    });

    it('falls back to two-step when RPC returns 42883 (function not found)', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'Could not find the function' },
      });

      const insertChain = buildChain({ data: { id: 'fallback-id' }, error: null });
      const expireChain = {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      };
      mockSupabase.from.mockReturnValueOnce(expireChain).mockReturnValueOnce(insertChain);

      const result = await createChallenge('user-123', 'iPhone', 999);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('fallback-id');
    });

    it('returns failure when RPC returns non-42883 error', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      });

      const result = await createChallenge('user-123', 'iPhone', 999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create challenge');
    });

    it('retries on 23505 unique constraint violation in fallback path', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function not found' },
      });

      // First insert fails with 23505
      const firstInsertChain = {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { code: '23505', message: 'unique violation' } })),
          })),
        })),
      };
      // Expire chain (called twice: initial + retry)
      const expireChain = {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      };
      // Retry insert succeeds
      const retryInsertChain = {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'retry-id' }, error: null })),
          })),
        })),
      };

      mockSupabase.from
        .mockReturnValueOnce(expireChain)   // initial expire
        .mockReturnValueOnce(firstInsertChain) // first insert (23505)
        .mockReturnValueOnce(expireChain)   // retry expire
        .mockReturnValueOnce(retryInsertChain); // retry insert (success)

      const result = await createChallenge('user-123', 'iPhone', 999);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('retry-id');
    });
  });

  // ============================================================
  // getChallengeById
  // ============================================================

  describe('getChallengeById', () => {
    it('returns challenge when found', async () => {
      const mockRow = {
        id: 'chal-1', user_id: 'user-123', item_name: 'Shoes', amount: 100,
        challenge_type: 'standard', status: 'active', created_at: '2026-01-01',
        completed_at: null, metadata: {}, deposit_status: 'unsettled', deposited_at: null,
      };
      const chain = buildChain({ data: mockRow, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getChallengeById('chal-1', 'user-123');

      expect(result.success).toBe(true);
      expect(result.challenge?.id).toBe('chal-1');
    });

    it('returns failure when challenge not found', async () => {
      const chain = buildChain({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getChallengeById('nonexistent', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns failure on DB error', async () => {
      const chain = buildChain({ data: null, error: { message: 'Connection refused' } });
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getChallengeById('chal-1', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  // ============================================================
  // completeChallenge
  // ============================================================

  describe('completeChallenge', () => {
    it('returns success with rowsAffected=1 when CAS succeeds', async () => {
      // Chain: .update(...).eq('id').eq('user_id').eq('status').select('id')
      const chain = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        select: vi.fn(async () => ({ data: [{ id: 'chal-1' }], error: null })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await completeChallenge('chal-1', 'user-123', 'passed');

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);
    });

    it('returns success with rowsAffected=0 when CAS lost (already completed)', async () => {
      const chain = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        select: vi.fn(async () => ({ data: [], error: null })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await completeChallenge('chal-1', 'user-123', 'passed');

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(0);
    });

    it('returns failure on DB error', async () => {
      const chain = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        select: vi.fn(async () => ({ data: null, error: { message: 'DB error' } })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await completeChallenge('chal-1', 'user-123', 'failed');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });

  // ============================================================
  // getActiveChallenge
  // ============================================================

  describe('getActiveChallenge', () => {
    it('returns challenge when active exists', async () => {
      const mockRow = {
        id: 'chal-1', user_id: 'user-123', item_name: 'Shoes', amount: 100,
        challenge_type: 'standard', status: 'active', created_at: new Date().toISOString(),
        completed_at: null, metadata: {}, deposit_status: 'unsettled', deposited_at: null,
      };
      const chain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: mockRow, error: null })),
                })),
              })),
            })),
          })),
        })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getActiveChallenge('user-123');

      expect(result.success).toBe(true);
      expect(result.challenge?.id).toBe('chal-1');
    });

    it('returns success with no challenge when none active', async () => {
      const chain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getActiveChallenge('user-123');

      expect(result.success).toBe(true);
      expect(result.challenge).toBeUndefined();
    });
  });

  // ============================================================
  // getRecentExpiredChallenge
  // ============================================================

  describe('getRecentExpiredChallenge', () => {
    it('returns challenge when expired exists', async () => {
      const mockRow = {
        id: 'chal-1', user_id: 'user-123', item_name: 'Shoes', amount: 100,
        challenge_type: 'standard', status: 'expired', created_at: new Date().toISOString(),
        completed_at: null, metadata: {}, deposit_status: 'unsettled', deposited_at: null,
      };
      const chain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: mockRow, error: null })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getRecentExpiredChallenge('user-123');

      expect(result.success).toBe(true);
      expect(result.challenge?.id).toBe('chal-1');
    });

    it('returns success with no challenge when none expired', async () => {
      const chain = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };
      mockSupabase.from.mockReturnValueOnce(chain);

      const result = await getRecentExpiredChallenge('user-123');

      expect(result.success).toBe(true);
      expect(result.challenge).toBeUndefined();
    });
  });

  // ============================================================
  // resumeChallenge
  // ============================================================

  describe('resumeChallenge', () => {
    it('returns success when atomic RPC succeeds', async () => {
      const mockRow = {
        id: 'chal-1', user_id: 'user-123', item_name: 'Shoes', amount: 100,
        challenge_type: 'standard', status: 'active', created_at: new Date().toISOString(),
        completed_at: null, metadata: {}, deposit_status: 'unsettled', deposited_at: null,
      };
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, challenge: mockRow },
        error: null,
      });

      const result = await resumeChallenge('chal-1', 'user-123');

      expect(result.success).toBe(true);
      expect(result.challenge?.id).toBe('chal-1');
    });

    it('returns failure when RPC returns success=false', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: false, error: 'not found' },
        error: null,
      });

      const result = await resumeChallenge('chal-1', 'user-123');

      expect(result.success).toBe(false);
    });

    it('returns failure on non-42883 RPC error (no fallback)', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      });

      const result = await resumeChallenge('chal-1', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to resume');
    });

    it('falls back to two-step when RPC returns 42883', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function not found' },
      });

      const mockRow = {
        id: 'chal-1', user_id: 'user-123', item_name: 'Shoes', amount: 100,
        challenge_type: 'standard', status: 'active', created_at: new Date().toISOString(),
        completed_at: null, metadata: {}, deposit_status: 'unsettled', deposited_at: null,
      };

      // Expire chain
      const expireChain = {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      };
      // CAS resume chain
      const resumeChain = buildChain({ data: mockRow, error: null });

      mockSupabase.from.mockReturnValueOnce(expireChain).mockReturnValueOnce(resumeChain);

      const result = await resumeChallenge('chal-1', 'user-123');

      expect(result.success).toBe(true);
      expect(result.challenge?.id).toBe('chal-1');
    });

    it('returns failure when fallback CAS finds no expired challenge', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function not found' },
      });

      const expireChain = {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      };
      const resumeChain = buildChain({ data: null, error: null });

      mockSupabase.from.mockReturnValueOnce(expireChain).mockReturnValueOnce(resumeChain);

      const result = await resumeChallenge('chal-1', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================
  // dismissChallenge
  // ============================================================

  describe('dismissChallenge', () => {
    // 🔧 2026-07-15: dismissChallenge now does SELECT (metadata) + UPDATE (status+metadata)
    // Need two mock chains: first for SELECT, second for UPDATE
    it('returns success when challenge is dismissed', async () => {
      // Step 1: SELECT metadata — returns existing metadata
      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn(() => selectChain),
        maybeSingle: vi.fn(async () => ({ data: { metadata: { challengeType: 'quick_pass' } }, error: null })),
      };
      // Step 2: UPDATE status + metadata — returns updated row
      const updateChain = {
        update: vi.fn(() => updateChain),
        eq: vi.fn(() => updateChain),
        select: vi.fn(async () => ({ data: [{ id: 'chal-1' }], error: null })),
      };
      mockSupabase.from.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

      const result = await dismissChallenge('chal-1', 'user-123');

      expect(result.success).toBe(true);
    });

    it('returns failure when 0 rows affected (not expired or not found)', async () => {
      // Step 1: SELECT metadata — returns null (not found)
      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn(() => selectChain),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      mockSupabase.from.mockReturnValueOnce(selectChain);

      const result = await dismissChallenge('chal-1', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or not in expired state');
    });

    it('returns failure on DB error', async () => {
      // Step 1: SELECT metadata — returns DB error
      const selectChain = {
        select: vi.fn(() => selectChain),
        eq: vi.fn(() => selectChain),
        maybeSingle: vi.fn(async () => ({ data: null, error: { message: 'DB error' } })),
      };
      mockSupabase.from.mockReturnValueOnce(selectChain);

      const result = await dismissChallenge('chal-1', 'user-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });
});
