/**
 * DELETE /api/push/unsubscribe — 取消订阅 Web Push 通知
 *
 * 既有: DB 错误不泄露内部 message (500 DB_ERROR)
 * 🔧 R420 断言加固: 原版 1 例 — 92 行 route 其余路径裸奔:
 *   - 无效 JSON → 400 Invalid JSON
 *   - schema 拒非 URL endpoint → 400 Validation failed (issues 透传)
 *   - happy path → 200 { success: true } + eq('user_id')/eq('endpoint') 双条件锚 (P0 RLS 修复锚)
 *   - 表不存在 (42P01) → 503 TABLE_NOT_FOUND (migration 121 未跑)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({ withAuth: vi.fn((handler: (ctx: unknown) => unknown) => handler) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { DELETE } = await import('../route') as { DELETE: (ctx: unknown) => Promise<Response> };

beforeEach(() => vi.clearAllMocks());

/** thenable 链式 supabase mock — delete/eq 记录调用 (R384 定案) */
function makeSupabase(result: { data?: unknown; error?: unknown }) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.delete = vi.fn(() => {
    calls.push('delete');
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    calls.push(`eq:${col}=${String(val)}`);
    return chain;
  });
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { supabase: { from: chain.from }, chain, calls };
}

function makeRequest(body?: string): NextRequest {
  return new NextRequest('http://localhost/api/push/unsubscribe', {
    method: 'DELETE',
    body: body ?? JSON.stringify({ endpoint: 'https://push.example/1' }),
    headers: { 'content-type': 'application/json' },
  });
}

describe('DELETE /api/push/unsubscribe', () => {
  it('does not leak the database error message on delete failure', async () => {
    const error = { code: '42501', message: 'new row violates row-level security policy "push_subscriptions_delete"' };
    const { supabase } = makeSupabase({ data: null, error });
    const response = await DELETE({ user: { id: 'u1' }, supabase, request: makeRequest() });
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to remove subscription', error_code: 'DB_ERROR' });
  });

  it('无效 JSON → 400 Invalid JSON', async () => {
    const { supabase } = makeSupabase({ data: null, error: null });
    const response = await DELETE({ user: { id: 'u1' }, supabase, request: makeRequest('not-json{') });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('Invalid JSON');
  });

  it('非 URL endpoint → 400 Validation failed + issues 透传', async () => {
    const { supabase } = makeSupabase({ data: null, error: null });
    const response = await DELETE({ user: { id: 'u1' }, supabase, request: makeRequest(JSON.stringify({ endpoint: 'not-a-url' })) });
    const json = (await response.json()) as { error: string; issues: { message: string }[] };
    expect(response.status).toBe(400);
    expect(json.error).toBe('Validation failed');
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('happy path → 200 success + 双 eq 条件锚 (P0 RLS 修复锚)', async () => {
    const { supabase, calls } = makeSupabase({ data: null, error: null });
    const response = await DELETE({ user: { id: 'u-owner' }, supabase, request: makeRequest() });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    // 只删自己的订阅 — user_id + endpoint 双条件
    expect(calls).toContain('eq:user_id=u-owner');
    expect(calls).toContain('eq:endpoint=https://push.example/1');
  });

  it('表不存在 42P01 → 503 TABLE_NOT_FOUND (migration 121 未跑)', async () => {
    const { supabase } = makeSupabase({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    const response = await DELETE({ user: { id: 'u1' }, supabase, request: makeRequest() });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error_code: string }).error_code).toBe('TABLE_NOT_FOUND');
  });
});
