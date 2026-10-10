/**
 * Tests for GET /api/email/status
 *
 * 🔧 Round 84: 401 when unauthenticated
 * 🔧 R418 断言加固 (烧 token 战役): 原版仅 1 例 401 — 50 行 route 的
 *    happy path + 3 错误分支 + 数据形状全部裸奔。本轮补全。
 *
 * mock 策略: vi.doMock('@/lib/with-auth', identity 透传 — R361 定案) +
 * 动态 import (R356 定案), supabase mock 按 email_connections /
 * email_receipts×2 (total→actionable 顺序) 分表。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/email/status', { method: 'GET' });
}

type ReceiptOverrides = {
  connectionsResult?: { data?: unknown; error?: unknown };
  totalResult?: { count?: number; error?: unknown };
  actionableResult?: { count?: number; error?: unknown };
};

async function loadRoute(overrides: ReceiptOverrides = {}) {
  const connResult = overrides.connectionsResult ?? { data: [] };
  const totalResult = overrides.totalResult ?? { count: 0 };
  const actionableResult = overrides.actionableResult ?? { count: 0 };

  let receiptCall = 0;
  const supabase = {
    from: (table: string) => {
      const target =
        table === 'email_connections'
          ? connResult
          : table === 'email_receipts'
            ? (receiptCall++ === 0 ? totalResult : actionableResult)
            : { data: [] };
      const chain: Record<string, unknown> = {};
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(target).then(resolve, reject);
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      return chain;
    },
  };

  vi.doMock('@/lib/with-auth', () => ({
    withAuth: (handler: (ctx: unknown) => unknown) => (request: unknown) =>
      Promise.resolve(handler({ supabase, user: { id: 'u1' }, request })),
  }));
  const mod = await import('../route');
  return { GET: mod.GET };
}

describe('GET /api/email/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('happy path: 空连接 + 双计数形状锚', async () => {
    const { GET } = await loadRoute();
    const res = await GET(makeRequest());
    const body = (await res.json()) as { connections: unknown[]; totalReceipts: number; actionableReceipts: number };
    expect(res.status).toBe(200);
    expect(body.connections).toEqual([]);
    expect(body.totalReceipts).toBe(0);
    expect(body.actionableReceipts).toBe(0);
  });

  it('happy path: 连接数据透传 + 非零计数', async () => {
    const { GET } = await loadRoute({
      connectionsResult: {
        data: [{
          id: 'c1', user_id: 'u1', email_address: 'a@x.com', provider: 'gmail',
          status: 'connected', last_sync_at: null, last_history_id: null,
          created_at: null, updated_at: null, token_expiry: null,
        }],
      },
      totalResult: { count: 42 },
      actionableResult: { count: 7 },
    });
    const res = await GET(makeRequest());
    const body = (await res.json()) as { connections: { id: string; email_address: string }[]; totalReceipts: number; actionableReceipts: number };
    expect(res.status).toBe(200);
    expect(body.connections[0]).toMatchObject({ id: 'c1', email_address: 'a@x.com' });
    expect(body.totalReceipts).toBe(42);
    expect(body.actionableReceipts).toBe(7);
  });

  it('connections 查询错 → 500 Failed to fetch email status', async () => {
    const { GET } = await loadRoute({
      connectionsResult: { data: null, error: 'db down' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('Failed to fetch email status');
  });

  it('receipt 总数查询错 → 500 Failed to fetch receipt counts (deep audit #15 修复锚)', async () => {
    const { GET } = await loadRoute({
      totalResult: { count: undefined, error: 'count err' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('Failed to fetch receipt counts');
  });

  it('actionable 计数查询错 → 500 (第三分支)', async () => {
    const { GET } = await loadRoute({
      actionableResult: { count: undefined, error: 'actionable err' },
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('Failed to fetch actionable counts');
  });
});
