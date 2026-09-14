/**
 * Tests for POST /api/reuse/adoption (batch56-c)
 *
 * - POST 400: unknown/missing categoryId
 * - POST dedup: same trigger_id already recorded → success + deduplicated, no insert
 * - POST 200: inserts audit row (event_type mindful_recovery, zero vitality/token
 *   change, metadata.kind='reuse_adoption' — 守护风格画像复用轨数据源)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';

type Chain = Record<string, ReturnType<typeof vi.fn>> & { then: unknown };

function makeChain(terminal: () => Promise<unknown> = async () => ({ data: null, error: null })): Chain {
  const chain = {} as Chain;
  const method = () => vi.fn(() => chain);
  chain.from = method();
  chain.select = method();
  chain.eq = method();
  chain.limit = method();
  chain.maybeSingle = method();
  chain.insert = method();
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve().then(terminal).then(onFulfilled, onRejected);
  return chain;
}

function authed(chain: Chain) {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: {},
    user: { id: 'user-123' },
    error: null,
    mergeCookies: (r: Response) => r,
    mergeCookiesOnResponse: (r: Response) => r,
  });
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    supabase: { from: chain.from },
    error: null,
  });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reuse/adoption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/reuse/adoption', () => {
  it('400 on unknown categoryId', async () => {
    const chain = makeChain();
    authed(chain);
    const res = await POST(makePostRequest({ categoryId: 'not_a_real_category' }));
    expect(res.status).toBe(400);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('400 on missing categoryId', async () => {
    const chain = makeChain();
    authed(chain);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('deduplicates when trigger_id already recorded (no insert)', async () => {
    const chain = makeChain(async () => ({ data: [{ id: 'evt-1' }], error: null }));
    authed(chain);
    const res = await POST(makePostRequest({ categoryId: 'tool_rental' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deduplicated).toBe(true);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('inserts audit row with zero side effects and reuse_adoption marker', async () => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null }; // dedup check
      if (call === 2) return { data: { vitality: 72 }, error: null }; // buddy_state
      return { data: null, error: null }; // insert
    });
    authed(chain);
    const res = await POST(makePostRequest({ categoryId: 'tool_rental', estSaved: 15 }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const row = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(row.event_type).toBe('mindful_recovery');
    expect(row.vitality_change).toBe(0);
    expect(row.token_change).toBe(0);
    expect(row.trigger_id).toContain('reuse-adoption:tool_rental:');
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.kind).toBe('reuse_adoption');
    expect(meta.categoryId).toBe('tool_rental');
    expect(meta.estSaved).toBe(15);
  });

  it('500 on insert error', async () => {
    let call = 0;
    const chain = makeChain(async () => {
      call += 1;
      if (call === 1) return { data: [], error: null };
      if (call === 2) return { data: { vitality: 72 }, error: null };
      return { data: null, error: { message: 'boom' } };
    });
    authed(chain);
    const res = await POST(makePostRequest({ categoryId: 'books_media' }));
    expect(res.status).toBe(500);
  });
});
