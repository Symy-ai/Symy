import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({ vapid: vi.fn() }));

vi.mock('@/lib/push/web-push-config', () => ({ getVapidPublicKey: M.vapid }));
vi.mock('@/lib/with-auth', () => ({
  // identity 透传 (R361 定案)
  withAuth: (fn: (args: unknown) => unknown, _opts?: unknown) => fn,
}));

import { GET as rootGET } from '@/app/api/route';
import { GET as vapidGET } from '../../../push/vapid-public-key/route';
import { DELETE as disconnectDELETE } from '../route';

/**
 * 小件三连打包: api/route (5行) + push/vapid-public-key (20行) + email/disconnect (31行)。
 *
 * 锁定:
 * - api root: Hello, world! 探活
 * - vapid: 有 key 200 / 无 key 503 (推送未配置)
 * - disconnect: 缺参 400 / 删成功 200 / RLS user 双过滤锚 / 失败 500
 */
describe('GET /api (root 探活)', () => {
  it('返回 Hello, world!', async () => {
    const r = (await rootGET()) as Response;
    expect(await r.json()).toEqual({ message: 'Hello, world!' });
  });
});

describe('GET /api/push/vapid-public-key', () => {
  beforeEach(() => vi.clearAllMocks());

  it('有 key → 200 回传', async () => {
    M.vapid.mockReturnValueOnce('BK-public-key-xyz');
    const r = (await vapidGET()) as Response;
    expect(await r.json()).toEqual({ publicKey: 'BK-public-key-xyz' });
  });

  it('无 key → 503 未配置', async () => {
    M.vapid.mockReturnValueOnce(undefined);
    const r = (await vapidGET()) as Response;
    expect(r.status).toBe(503);
  });
});

describe('DELETE /api/email/disconnect', () => {
  it('缺 connectionId → 400', async () => {
    const r = (await disconnectDELETE({ request: { nextUrl: { searchParams: new URLSearchParams() } } } as never)) as Response;
    expect(r.status).toBe(400);
  });

  it('删成功 → 200+user 双过滤锚', async () => {
    const calls: unknown[][] = [];
    const chain: Record<string, unknown> = {
      delete: vi.fn(() => chain),
      eq: vi.fn((c: string, v: unknown) => {
        calls.push([c, v]);
        return chain; // 恒链式 — 终值由 thenable 兜底
      }),
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    const r = (await disconnectDELETE({
      request: { nextUrl: { searchParams: new URLSearchParams('connectionId=conn-1') } },
      supabase: { from: () => chain },
      user: { id: 'u1' },
    } as never)) as Response;
    expect(await r.json()).toEqual({ success: true });
    // RLS 锚: id + user_id 双过滤 (防越权删他人连接)
    expect(calls).toContainEqual(['id', 'conn-1']);
    expect(calls).toContainEqual(['user_id', 'u1']);
  });

  it('删除失败 → 500', async () => {
    const chain = {
      delete: () => chain,
      eq: () => chain,
      then: (resolve: (v: unknown) => void) => resolve({ error: { message: 'rls' } }),
    };
    const r = (await disconnectDELETE({
      request: { nextUrl: { searchParams: new URLSearchParams('connectionId=conn-1') } },
      supabase: { from: () => chain },
      user: { id: 'u1' },
    } as never)) as Response;
    expect(r.status).toBe(500);
  });
});
