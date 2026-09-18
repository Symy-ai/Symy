/**
 * Tests for /api/inventory (batch81-c) — 复用优先物品清单
 *
 * - GET 200: 列表 created_at desc + inventoryEnabled: true
 * - GET 42P01: migration 未执行 → 200 { items: [], inventoryEnabled: false } 优雅降级
 * - POST 201: user_id 恒取 auth (body 注入 user_id 不生效), source 默认 chat
 * - POST zod: item_name 1-100 (trim 后), 100 字边界过 / 101 拒, category 可选 ≤50
 * - POST 42P01 → 503 TABLE_NOT_FOUND (未持久化的写不伪造成功)
 * - DELETE: uuid 校验 400 / 跨用户或不存在 0 行 → 404 / 命中 → 200
 * - RLS 纵深: 查询恒 .eq('user_id', auth uid); migration 四 policy + UPDATE WITH CHECK
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST, DELETE } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

type Chain = Record<string, ReturnType<typeof vi.fn>> & { then: unknown };

const TABLE_MISSING = { code: '42P01', message: 'relation "user_inventory" does not exist' };
const USER = 'user-123';

function makeChain(terminal: () => Promise<unknown> = async () => ({ data: null, error: null })): Chain {
  const chain = {} as Chain;
  const method = () => vi.fn(() => chain);
  chain.from = method();
  chain.select = method();
  chain.eq = method();
  chain.order = method();
  chain.insert = method();
  chain.delete = method();
  chain.single = method();
  // 链式查询被 await 时 (无 single 的 GET / DELETE 路径), 解析为 terminal 结果
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve().then(terminal).then(onFulfilled, onRejected);
  return chain;
}

function authed(chain: Chain) {
  (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    supabase: { from: chain.from },
    user: { id: USER },
    error: null,
    mergeCookies: (r: Response) => r,
    mergeCookiesOnResponse: (r: Response) => r,
  });
}

function makeRequest(method: string, body?: unknown, search = ''): NextRequest {
  return new NextRequest(`http://localhost/api/inventory${search}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/inventory', () => {
  it('200: own items, created_at desc, inventoryEnabled true', async () => {
    const rows = [
      { id: 'inv-2', item_name: '充电线', category: 'electronics', source: 'chat', created_at: '2026-09-19T02:00:00Z' },
      { id: 'inv-1', item_name: '酱油', category: 'food', source: 'chat', created_at: '2026-09-18T02:00:00Z' },
    ];
    const chain = makeChain(async () => ({ data: rows, error: null }));
    authed(chain);
    const res = await GET(makeRequest('GET'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.inventoryEnabled).toBe(true);
    expect(json.items).toHaveLength(2);
    expect(json.items[0].item_name).toBe('充电线');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('42P01 (migration 未执行) → 200 { items: [], inventoryEnabled: false } 不炸', async () => {
    const chain = makeChain(async () => ({ data: null, error: { ...TABLE_MISSING } }));
    authed(chain);
    const res = await GET(makeRequest('GET'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ items: [], inventoryEnabled: false });
  });

  it('other db error → 500', async () => {
    const chain = makeChain(async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }));
    authed(chain);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/inventory', () => {
  it('201: inserts with auth user_id (body 注入的 user_id 不生效) + source 默认 chat', async () => {
    const chain = makeChain(async () => ({
      data: { id: 'inv-9', item_name: '数据线', category: 'electronics', source: 'chat', created_at: '2026-09-19T00:00:00Z' },
      error: null,
    }));
    authed(chain);
    const res = await POST(makeRequest('POST', { item_name: '  数据线  ', category: 'electronics', user_id: 'victim-user' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.item.id).toBe('inv-9');
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: USER, // ← 恒取 auth, 不是 body 里的 'victim-user'
      item_name: '数据线', // ← trim
      category: 'electronics',
      source: 'chat', // ← 默认
    });
  });

  it.each([
    ['missing item_name', {}],
    ['empty string', { item_name: '' }],
    ['whitespace only (trim 后空)', { item_name: '   ' }],
    ['101 chars', { item_name: 'a'.repeat(101) }],
    ['invalid source', { item_name: 'ok', source: 'hacker' }],
    ['category 51 chars', { item_name: 'ok', category: 'c'.repeat(51) }],
  ])('400: %s', async (_label, body) => {
    const chain = makeChain();
    authed(chain);
    const res = await POST(makeRequest('POST', body));
    expect(res.status).toBe(400);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('100 chars (边界) → 201; category 50 chars (边界) → 201', async () => {
    const chain = makeChain(async () => ({ data: { id: 'inv-1' }, error: null }));
    authed(chain);
    const res = await POST(makeRequest('POST', { item_name: 'a'.repeat(100), category: 'c'.repeat(50) }));
    expect(res.status).toBe(201);
  });

  it('invalid JSON → 400', async () => {
    const chain = makeChain();
    authed(chain);
    const req = new NextRequest('http://localhost/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('42P01 → 503 TABLE_NOT_FOUND (不伪造成功)', async () => {
    const chain = makeChain(async () => ({ data: null, error: { ...TABLE_MISSING } }));
    authed(chain);
    const res = await POST(makeRequest('POST', { item_name: '收纳盒' }));
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error_code).toBe('TABLE_NOT_FOUND');
  });

  it('other db error → 500', async () => {
    const chain = makeChain(async () => ({ data: null, error: { code: '23505', message: 'dup' } }));
    authed(chain);
    const res = await POST(makeRequest('POST', { item_name: 'ok' }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/inventory?id=', () => {
  it.each(['not-a-uuid', "'; drop table user_inventory; --", ''])('400 on invalid id (%s) — delete 不发出', async (id) => {
    const chain = makeChain();
    authed(chain);
    const res = await DELETE(makeRequest('DELETE', undefined, `?id=${encodeURIComponent(id)}`));
    expect(res.status).toBe(400);
    expect(chain.delete).not.toHaveBeenCalled();
  });

  it('missing id param → 400', async () => {
    const chain = makeChain();
    authed(chain);
    const res = await DELETE(makeRequest('DELETE'));
    expect(res.status).toBe(400);
    expect(chain.delete).not.toHaveBeenCalled();
  });

  // RLS 断言 (API 级纵深): 别人的行在 user_id 过滤下就是 0 行 → 404
  it('404 when 0 rows deleted (跨用户 / 不存在) — 且恒带 user_id 过滤', async () => {
    const chain = makeChain(async () => ({ count: 0, data: null, error: null }));
    authed(chain);
    const res = await DELETE(makeRequest('DELETE', undefined, '?id=11111111-1111-4111-8111-111111111111'));
    expect(res.status).toBe(404);
    expect(chain.delete).toHaveBeenCalledWith({ count: 'exact' });
    expect(chain.eq).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER);
  });

  it('200 success when 1 row deleted', async () => {
    const chain = makeChain(async () => ({ count: 1, data: null, error: null }));
    authed(chain);
    const res = await DELETE(makeRequest('DELETE', undefined, '?id=11111111-1111-4111-8111-111111111111'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('42P01 → 503 TABLE_NOT_FOUND', async () => {
    const chain = makeChain(async () => ({ count: null, data: null, error: { ...TABLE_MISSING } }));
    authed(chain);
    const res = await DELETE(makeRequest('DELETE', undefined, '?id=11111111-1111-4111-8111-111111111111'));
    expect(res.status).toBe(503);
  });
});

describe('migration 142 RLS contract (静态断言 — 文件只写不执行)', () => {
  const MIGRATION = join(process.cwd(), 'supabase', 'migrations', '142_user_inventory.sql');

  it('migration file exists', () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it('RLS 启用 + 四操作全 policy on auth.uid() = user_id, UPDATE 带 WITH CHECK', () => {
    const sql = readFileSync(MIGRATION, 'utf-8');
    expect(sql).toMatch(/enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/references\s+auth\.users/i);
    // 四操作各一条 policy, 且全部限定 auth.uid() = user_id
    for (const op of ['select', 'insert', 'update', 'delete']) {
      const policy = sql.match(new RegExp(`for\\s+${op}[\\s\\S]*?;`, 'i'));
      expect(policy, `policy for ${op}`).toBeTruthy();
      expect(policy![0]).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    }
    const updatePolicy = sql.match(/for\s+update[\s\S]*?;/i)![0];
    expect(updatePolicy).toMatch(/with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    expect(sql).toMatch(/default\s+'chat'/);
    expect(sql).toMatch(/default\s+now\(\)/);
  });
});
