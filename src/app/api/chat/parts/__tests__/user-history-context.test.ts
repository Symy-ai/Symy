import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getUserHistoryContext } from '../user-history-context';
import { createAdminClient } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

function queryResult(data: Array<Record<string, unknown>>, error: unknown = null) {
  return {
    select: vi.fn(() => queryResult(data, error)),
    eq: vi.fn(() => queryResult(data, error)),
    gte: vi.fn(() => queryResult(data, error)),
    in: vi.fn(() => queryResult(data, error)),
    order: vi.fn(() => queryResult(data, error)),
    limit: vi.fn(() => Promise.resolve({ data, error })),
  };
}

function mockHistory(recent: Array<Record<string, unknown>>, gacha: Array<Record<string, unknown>>) {
  vi.mocked(createAdminClient).mockReturnValue({
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'active_challenges') {
          return queryResult(recent);
        }
        return queryResult(gacha);
      }),
    } as unknown as SupabaseClient,
    error: null,
  });
}

describe('getUserHistoryContext amount formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('omits amounts when challenge or gacha values are missing or non-finite', async () => {
    mockHistory(
      [{ item_name: 'Keyboard', amount: null, status: 'passed', completed_at: '2026-01-01T00:00:00Z', metadata: null }],
      [{ decision_description: 'Headphones', amount: Number.NaN, platform: null, created_at: '2026-01-01T00:00:00Z', is_example: false }],
    );

    const context = await getUserHistoryContext('12345678-1234-1234-8234-123456789012');

    expect(context).not.toBeNull();
    expect(context).not.toContain('$null');
    expect(context).not.toContain('$NaN');
    expect(context).toContain('Keyboard (resisted)');
    expect(context).toContain('Headphones (bought');
  });

  it('keeps valid amounts in history and gacha lines', async () => {
    mockHistory(
      [{ item_name: 'Keyboard', amount: 12.5, status: 'passed', completed_at: '2026-01-01T00:00:00Z', metadata: null }],
      [{ decision_description: 'Headphones', amount: 35, platform: 'web', created_at: '2026-01-01T00:00:00Z', is_example: false }],
    );

    const context = await getUserHistoryContext('12345678-1234-1234-8234-123456789012');

    expect(context).toContain('Keyboard $12.5 (resisted)');
    expect(context).toContain('Headphones $35 on web (bought');
  });
});
