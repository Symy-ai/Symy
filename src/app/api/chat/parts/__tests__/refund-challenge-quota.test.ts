/**
 * refund-challenge-quota Tests — Round 120 audit fix (AUDIT-4)
 *
 * 🔧 Round 120: 新提取的 helper (从 chat/route.ts 重复 2 处的 inline refund 逻辑提取)
 * 此测试覆盖:
 * - 正常退款 (CAS 成功)
 * - 无额度可退 (count=0)
 * - 跨日 (date 不匹配)
 * - DB 读错误
 * - admin client 不可用
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase-admin
const mockMaybeSingle = vi.fn();
const mockUpdateEq3 = vi.fn();  // last .eq() in update chain
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

// Mock limit-window
vi.mock('@/lib/limit-window', () => ({
  getLimitWindow: vi.fn(() => '2026-07-12'),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { refundChallengeQuota } from '../refund-challenge-quota';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Build a Supabase mock client with proper fluent chaining.
 * Supports:
 *   supabase.from('buddy_state').select('daily_see_it_count, daily_see_it_date').eq('user_id', U).maybeSingle() → { data, error }
 *   supabase.from('buddy_state').update({...}).eq('user_id', U).eq('daily_see_it_count', X).eq('daily_see_it_date', D) → { error }
 */
function buildSupabaseMock(opts: {
  readData?: { daily_see_it_count?: number; daily_see_it_date?: string } | null;
  readError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mockMaybeSingle.mockResolvedValue({
      data: opts.readData,
      error: opts.readError ?? null,
    }),
  };
  const updateChain = {
    eq: vi.fn().mockReturnThis().mockReturnValue({
      eq: vi.fn().mockReturnThis().mockReturnValue({
        eq: mockUpdateEq3.mockResolvedValue({ error: opts.updateError ?? null }),
      }),
    }),
  };
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'buddy_state') {
        // Return select chain or update chain based on what's called next
        // We can't know in advance, so return a proxy that handles both
        return {
          select: vi.fn(() => selectChain),
          update: vi.fn(() => updateChain),
        };
      }
      return {};
    }),
  };
}

describe('refundChallengeQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns refunded=true when CAS update succeeds', async () => {
    const mockSupabase = buildSupabaseMock({
      readData: { daily_see_it_count: 3, daily_see_it_date: '2026-07-12' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: mockSupabase, error: null } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(true);
    expect(result.previousCount).toBe(3);
  });

  it('returns refunded=false when count is 0 (no quota to refund)', async () => {
    const mockSupabase = buildSupabaseMock({
      readData: { daily_see_it_count: 0, daily_see_it_date: '2026-07-12' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: mockSupabase, error: null } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(false);
    expect(result.error).toBe('no_quota_to_refund');
  });

  it('returns refunded=false when date does not match (cross-day)', async () => {
    const mockSupabase = buildSupabaseMock({
      readData: { daily_see_it_count: 3, daily_see_it_date: '2026-07-11' }, // yesterday
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: mockSupabase, error: null } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(false);
    expect(result.error).toBe('no_quota_to_refund');
  });

  it('returns refunded=false when DB read fails', async () => {
    const mockSupabase = buildSupabaseMock({
      readData: null,
      readError: { message: 'Connection refused' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: mockSupabase, error: null } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(false);
    expect(result.error).toContain('db_read_error');
  });

  it('returns refunded=false when admin client is unavailable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: null, error: 'No service key' } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(false);
    expect(result.error).toBe('admin_client_unavailable');
  });

  it('returns refunded=false when CAS update fails', async () => {
    const mockSupabase = buildSupabaseMock({
      readData: { daily_see_it_count: 3, daily_see_it_date: '2026-07-12' },
      updateError: { message: 'Permission denied' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: mockSupabase, error: null } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(false);
    expect(result.error).toContain('db_update_error');
  });

  it('returns refunded=false when CAS lost (0 rows updated — concurrent refund won)', async () => {
    // 🔧 Round 120 audit-6 fix: CAS 失败时返回 refunded=false (不再撒谎)
    const mockSupabase = buildSupabaseMock({
      readData: { daily_see_it_count: 3, daily_see_it_date: '2026-07-12' },
      updateError: null,
    });
    // Override the update chain to return count: 0 (CAS lost)
    mockUpdateEq3.mockResolvedValueOnce({ error: null, count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    vi.mocked(createAdminClient).mockReturnValueOnce({ supabase: mockSupabase, error: null } as any);

    const result = await refundChallengeQuota('user-123');
    expect(result.refunded).toBe(false);
    expect(result.error).toBe('cas_lost_concurrent_refund');
  });
});
