/**
 * batch60-b — GET/PATCH /api/push/preferences 路由测试
 *
 * 锁: 认证上下文回显/合并写; strict 拒未知字段 (endpoint/keys 不可经此修改);
 * 无订阅行 PATCH 409 不伪造成功; 表缺失 503 保留错误态; PATCH 同步全部订阅行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: vi.fn((handler: (ctx: unknown) => unknown) => handler),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { GET, PATCH } = await import('../route') as {
  GET: (ctx: unknown) => Promise<Response>;
  PATCH: (ctx: unknown) => Promise<Response>;
};

type Result = { data: unknown; error: unknown };

interface TableBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  then: (resolve: (value: Result) => unknown) => Promise<unknown>;
}

/** push_subscriptions 表: GET/PATCH 共用同一 builder; select 读 latestRows, update 全行 */
function setupSubs(opts: { rows?: unknown[]; error?: unknown; updateError?: unknown } = {}) {
  const latestRows = opts.rows ?? [];
  const selectResult: Result = { data: latestRows, error: opts.error ?? null };
  const updateResult: Result = { data: null, error: opts.updateError ?? null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    update: vi.fn(() => selectResultIsUpdate(updateResult)),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(selectResult).then(resolve),
  };
  function selectResultIsUpdate(updateRes: Result): TableBuilder {
    return {
      select: builder.select,
      eq: builder.eq,
      order: builder.order,
      limit: builder.limit,
      update: builder.update,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(updateRes).then(resolve),
    };
  }
  const supabase = { from: vi.fn(() => builder) };
  return { builder, supabase };
}

function authedContext(request: NextRequest | null, supabase: unknown) {
  return { user: { id: 'u1' }, supabase, request };
}

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/push/preferences', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/push/preferences', () => {
  it('returns the normalized latest-row preferences', async () => {
    const { supabase } = setupSubs({ rows: [{ preferences: { missYou: false, frequency: 'weekly' }, updated_at: '2026-01-01' }] });

    const res = await GET(authedContext(null, supabase));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      preferences: { missYou: false, dreamFund: true, challenge: true, weeklyGuardian: true, dailyAlgorithm: true, frequency: 'weekly' },
    });
  });

  it('returns defaults when the user has no subscription rows', async () => {
    const { supabase } = setupSubs({ rows: [] });

    const res = await GET(authedContext(null, supabase));
    const json = await res.json();
    expect(json.preferences.frequency).toBe('daily');
    expect(json.preferences.missYou).toBe(true);
  });

  it('maps a missing table to the honest 503 error state', async () => {
    const { supabase } = setupSubs({ rows: [], error: { code: '42P01', message: 'relation does not exist' } });

    const res = await GET(authedContext(null, supabase));
    expect(res.status).toBe(503);
    expect((await res.json()).error_code).toBe('TABLE_NOT_FOUND');
  });
});

describe('PATCH /api/push/preferences', () => {
  it('merges the patch over stored preferences and writes every subscription row', async () => {
    const { supabase, builder } = setupSubs({
      rows: [{ preferences: { missYou: false, frequency: 'daily' }, updated_at: '2026-01-01' }],
    });

    const res = await PATCH(authedContext(patchRequest({ frequency: 'weekly' }), supabase));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preferences).toEqual({
      missYou: false,
      dreamFund: true,
      challenge: true,
      weeklyGuardian: true,
      dailyAlgorithm: true,
      frequency: 'weekly',
    });
    expect(builder.update).toHaveBeenCalledWith({
      preferences: { missYou: false, dreamFund: true, challenge: true, weeklyGuardian: true, dailyAlgorithm: true, frequency: 'weekly' },
    });
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('rejects unknown fields — endpoint/keys cannot be modified through preferences', async () => {
    const { supabase } = setupSubs({ rows: [{ preferences: {}, updated_at: '2026-01-01' }] });

    for (const body of [{ endpoint: 'https://push.example/x' }, { keys: { p256dh: 'k', auth: 'a' } }, { frequency: 'hourly' }]) {
      const res = await PATCH(authedContext(patchRequest(body), supabase));
      expect(res.status).toBe(400);
    }
  });

  it('returns 409 when there is no subscription row — never fakes a save', async () => {
    const { supabase } = setupSubs({ rows: [] });

    const res = await PATCH(authedContext(patchRequest({ missYou: false }), supabase));
    expect(res.status).toBe(409);
    expect((await res.json()).error_code).toBe('NOT_SUBSCRIBED');
  });

  it('maps a missing table to 503', async () => {
    const { supabase } = setupSubs({ rows: [], error: { code: '42P01', message: 'relation does not exist' } });

    const res = await PATCH(authedContext(patchRequest({ missYou: false }), supabase));
    expect(res.status).toBe(503);
  });
});
