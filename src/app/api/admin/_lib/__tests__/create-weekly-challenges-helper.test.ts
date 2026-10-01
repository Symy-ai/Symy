/* eslint-disable require-await -- test mocks use async for API consistency */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createWeeklyChallengesWithFallback } from '../create-weekly-challenges-helper';

function weekStartAsImplemented(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const mondayOffset = date.getDay() === 0 ? 6 : date.getDay() - 1;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function isoAfter(days: number): string {
  const date = weekStartAsImplemented();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function makeSupabase(rpcResults: Array<{ data?: unknown; error?: unknown }>) {
  const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => {
    const result = rpcResults.shift() ?? { data: null, error: null };
    return result;
  });

  return {
    client: {
      rpc,
      from: vi.fn(() => {
        throw new Error('Unexpected from() call');
      }),
    } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

function mockFrom(handlers: Record<string, unknown>) {
  return vi.fn((table: string) => {
    const handler = handlers[table];
    if (!handler) throw new Error(`Unexpected table: ${table}`);
    return handler;
  });
}

function selectChain(result: { data?: unknown; error?: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  };
  return chain;
}

function updateChain(result: { data?: unknown; error?: unknown }) {
  const chain = {
    lt: vi.fn(() => chain),
    eq: vi.fn(async () => result),
  };
  return chain;
}

describe('createWeeklyChallengesWithFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T15:00:00'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('succeeds directly when the new RPC signature works', async () => {
    const { client, rpc } = makeSupabase([{ error: null }]);

    const result = await createWeeklyChallengesWithFallback(client, 1);

    expect(result).toEqual({ success: true, usedFallback: false });
    expect(rpc).toHaveBeenCalledWith('create_weekly_challenges', { p_week_offset: 1 });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('fails without fallback for a non-signature RPC error', async () => {
    const { client, rpc } = makeSupabase([{ error: { message: 'permission denied' } }]);

    const result = await createWeeklyChallengesWithFallback(client, 0);

    expect(result).toEqual({
      success: false,
      usedFallback: false,
      error: 'permission denied',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('deduplicates the current week before calling the legacy RPC', async () => {
    const { client } = makeSupabase([
      { error: { message: 'Could not find the function' } },
    ]);
    const chain = selectChain({ data: [{ id: 'existing' }], error: null });
    const update = vi.fn(() => updateChain({ error: null }));
    const from = mockFrom({
      community_challenges: { select: vi.fn(() => chain), update },
    });
    (client as unknown as { from: typeof from }).from = from;

    const result = await createWeeklyChallengesWithFallback(client, 0);

    expect(result).toEqual({ success: true, usedFallback: true });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ is_active: false });
  });

  it('still reports success when expired cleanup fails in the dedup branch', async () => {
    const { client } = makeSupabase([
      { error: { message: 'unrecognized configuration parameter p_week_offset' } },
    ]);
    const update = vi.fn(() => updateChain({ error: { message: 'cleanup boom' } }));
    const chain = selectChain({ data: [{ id: 1 }], error: null });
    const from = mockFrom({
      community_challenges: { select: vi.fn(() => chain), update },
    });
    (client as unknown as { from: typeof from }).from = from;

    const result = await createWeeklyChallengesWithFallback(client, 0);

    expect(result).toEqual({ success: true, usedFallback: true });
  });

  it('returns the legacy RPC error when current-week creation fails', async () => {
    const { client } = makeSupabase([
      { error: { message: 'Could not find p_week_offset' } },
      { error: { message: 'legacy function failed' } },
    ]);
    const chain = selectChain({ data: [], error: null });
    const from = mockFrom({
      community_challenges: { select: vi.fn(() => chain) },
    });
    (client as unknown as { from: typeof from }).from = from;

    const result = await createWeeklyChallengesWithFallback(client, 0);

    expect(result).toEqual({
      success: false,
      usedFallback: true,
      error: 'legacy function failed',
    });
  });

  it('uses the legacy RPC when the current week is empty', async () => {
    const { client } = makeSupabase([
      { error: { message: 'Could not find the function' } },
      { error: null },
    ]);
    const chain = selectChain({ data: [], error: null });
    const from = mockFrom({
      community_challenges: { select: vi.fn(() => chain) },
    });
    (client as unknown as { from: typeof from }).from = from;

    const result = await createWeeklyChallengesWithFallback(client, 0);

    expect(result).toEqual({ success: true, usedFallback: true });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'create_weekly_challenges');
  });

  it('inserts offset-week challenges and updates inactive flags', async () => {
    const { client } = makeSupabase([
      { error: { message: 'Could not find the function' } },
    ]);
    const query = selectChain({ data: [], error: null });
    const select = vi.fn(() => query);
    const insert = vi.fn(async (_rows: Array<{ start_date: string; end_date: string }>) => ({ error: null }));
    const update = vi.fn(() => updateChain({ error: null }));
    const from = mockFrom({
      community_challenges: { select, insert, update },
    });
    (client as unknown as { from: typeof from }).from = from;

    const result = await createWeeklyChallengesWithFallback(client, 1);

    expect(result).toEqual({ success: true, usedFallback: true });
    const expectedWeekStart = isoAfter(7);
    const expectedWeekEnd = isoAfter(14);
    expect(query.gte).toHaveBeenCalledWith('start_date', expectedWeekStart);
    expect(query.lt).toHaveBeenCalledWith('start_date', expectedWeekEnd);
    const inserted = insert.mock.calls[0]?.[0] as Array<{ start_date: string; end_date: string }>;
    expect(inserted).toHaveLength(3);
    expect(inserted[0].start_date).toBe(expectedWeekStart);
    expect(inserted[0].end_date).toBe(expectedWeekEnd);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('returns the offset-week insert error without cleanup', async () => {
    const { client } = makeSupabase([
      { error: { message: 'Could not find the function' } },
    ]);
    const query = selectChain({ data: [], error: null });
    const select = vi.fn(() => query);
    const insert = vi.fn(async (_rows: Array<{ start_date: string; end_date: string }>) => ({ error: { message: 'insert failed' } }));
    const update = vi.fn(() => ({
      lt: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    }));
    const from = mockFrom({
      community_challenges: { select, insert, update },
    });
    (client as unknown as { from: typeof from }).from = from;

    const result = await createWeeklyChallengesWithFallback(client, 1);

    expect(result).toEqual({
      success: false,
      usedFallback: true,
      error: 'insert failed',
    });
    const expectedWeekStart = isoAfter(7);
    const expectedWeekEnd = isoAfter(14);
    expect(insert).toHaveBeenCalledTimes(1);
    const challenges = insert.mock.calls[0][0] as Array<{ start_date: string; end_date: string }>;
    expect(challenges).toHaveLength(3);
    expect(challenges[0].start_date).toBe(expectedWeekStart);
    expect(challenges[0].end_date).toBe(expectedWeekEnd);
    expect(update).not.toHaveBeenCalled();
  });
});
