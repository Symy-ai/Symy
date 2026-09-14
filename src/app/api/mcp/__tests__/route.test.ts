/**
 * Integration tests for /api/mcp (MCP tool entry — POST execute + GET tool list)
 *
 * testgap v5 §十一.2 V2: 双通道认证 + 100 次/小时限流 (Round 26 AUDIT-5 HIGH-2
 * 反 reward farming 修复点)。Critical paths:
 *   - GET/POST 无 cookie 无 secret → 401；secret 错误 → 401
 *   - 同用户第 101 次/小时 → 429（桶边界），跨用户互不影响
 *   - secret 通道: body 缺/坏 user_id → 400；user 不存在 → 403；DB 错误 → 500
 *   - GET 工具列表暴露面 = { tools, openai_format } 且不泄露其他字段
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({ createAuthenticatedClient: vi.fn() }));
vi.mock('@/lib/mcp-tools', () => ({
  MCP_TOOLS: [
    {
      name: 'add_tokens',
      description: 'Add tokens to user',
      parameters: { type: 'object' as const, properties: {}, required: [] },
    },
  ],
  executeMCPTools: vi.fn(async () => [{ toolId: 'call-1', success: true }]),
  getOpenAITools: vi.fn(() => [{ type: 'function', function: { name: 'add_tokens' } }]),
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 100 })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';
import { executeMCPTools } from '@/lib/mcp-tools';
import { checkRateLimit } from '@/lib/distributed-lock';

// src/test/setup.ts 在 route 模块加载前设置 MCP_API_SECRET（route 顶层 const 读取）
// UUID 须过 zod v4 RFC-9562 校验（version 位 [1-8]、variant 位 [89ab]）
const SECRET = 'test-mcp-secret';
const USER_A = '12345678-1234-1234-8234-123456789012';
const USER_B = '87654321-4321-4321-8321-210987654321';

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/mcp', {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined
      ? headers
      : { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

function secretHeaders(extra: Record<string, string> = {}) {
  return { 'X-MCP-Secret': SECRET, ...extra };
}

function secretBody(userId: string = USER_A) {
  return {
    toolCalls: [{ id: 'call-1', name: 'add_tokens', arguments: { user_id: userId, amount: 2 } }],
    user_id: userId,
  };
}

function mockAuthFail() {
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  } as never);
}

function mockAuthSuccess(userId = USER_B) {
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: { from: vi.fn(() => ({})) } as never,
    user: { id: userId },
    error: null,
    mergeCookies: <T>(res: T) => res,
    mergeCookiesOnResponse: <T>(res: T) => res,
    pendingCookies: [],
  } as never);
}

/** secret 通道先查 profiles 验证 user_id 存在（BUG-242） */
function mockAdminProfiles(profile: { id: string } | null, error: unknown = null) {
  vi.mocked(createAdminClient).mockReturnValue({
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: profile, error })),
          })),
        })),
      })),
    },
    error: null,
  } as never);
}

// 按桶计数的限流 mock：同 key 第 maxHits+1 次 allowed=false（桶边界语义）
const rlHits = new Map<string, number>();
function enableBucketRateLimit(maxHits = 100) {
  rlHits.clear();
  vi.mocked(checkRateLimit).mockImplementation(async (key: string) => {
    const hits = (rlHits.get(key) ?? 0) + 1;
    rlHits.set(key, hits);
    return { allowed: hits <= maxHits, remaining: Math.max(0, maxHits - hits) };
  });
}

describe('GET /api/mcp — tool list exposure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockImplementation(
      async () => ({ allowed: true, remaining: 100 }),
    );
  });

  it('returns 401 with no cookie and no secret', async () => {
    mockAuthFail();
    const res = await GET(makeRequest(undefined));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Authentication required');
  });

  it('returns 401 with wrong X-MCP-Secret and no cookie', async () => {
    mockAuthFail();
    const res = await GET(makeRequest(undefined, { 'X-MCP-Secret': 'wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong Bearer secret and no cookie', async () => {
    mockAuthFail();
    const res = await GET(makeRequest(undefined, { Authorization: `Bearer wrong-secret` }));
    expect(res.status).toBe(401);
  });

  it('returns tool list with valid X-MCP-Secret; body exposes only { tools, openai_format }', async () => {
    const res = await GET(makeRequest(undefined, secretHeaders()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(['openai_format', 'tools']);
    expect(json.tools).toHaveLength(1);
    expect(json.tools[0].name).toBe('add_tokens');
    expect(json.openai_format[0].function.name).toBe('add_tokens');
    for (const entry of json.openai_format) {
      expect(Object.keys(entry)).toEqual(['type', 'function']);
    }
  });

  it('returns tool list with Supabase cookie auth (no secret)', async () => {
    mockAuthSuccess();
    const res = await GET(makeRequest(undefined));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tools[0].name).toBe('add_tokens');
  });
});

describe('POST /api/mcp — MCP Secret channel (Letta custom tool callback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockImplementation(
      async () => ({ allowed: true, remaining: 100 }),
    );
    mockAdminProfiles({ id: USER_A });
  });

  it('returns 400 when body lacks user_id (Round 9 zod fix)', async () => {
    const body = secretBody();
    delete (body as Record<string, unknown>).user_id;
    const res = await POST(makeRequest(body, secretHeaders()));
    expect(res.status).toBe(400);
  });

  it('returns 400 when user_id is not a UUID', async () => {
    const body = secretBody('not-a-uuid');
    const res = await POST(makeRequest(body, secretHeaders()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain('user_id');
  });

  it('returns 400 when toolCalls is empty (min(1))', async () => {
    const res = await POST(makeRequest({ toolCalls: [], user_id: USER_A }, secretHeaders()));
    expect(res.status).toBe(400);
  });

  it('returns 403 when user_id does not exist in profiles (BUG-242 cross-user guard)', async () => {
    mockAdminProfiles(null);
    const res = await POST(makeRequest(secretBody(), secretHeaders()));
    expect(res.status).toBe(403);
    expect(executeMCPTools).not.toHaveBeenCalled();
  });

  it('returns 500 when profiles verification query errors', async () => {
    mockAdminProfiles(null, { message: 'db down' });
    const res = await POST(makeRequest(secretBody(), secretHeaders()));
    expect(res.status).toBe(500);
    expect(executeMCPTools).not.toHaveBeenCalled();
  });

  it('executes toolCalls with admin client and body user_id, returns results', async () => {
    const res = await POST(makeRequest(secretBody(), secretHeaders()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([{ toolId: 'call-1', success: true }]);
    expect(executeMCPTools).toHaveBeenCalledTimes(1);
    const [toolCalls, client, userId] = vi.mocked(executeMCPTools).mock.calls[0];
    expect(toolCalls).toEqual(secretBody().toolCalls);
    expect(userId).toBe(USER_A);
    expect(client).toBeDefined();
    // rate limit keyed by body user_id, not absent
    expect(checkRateLimit).toHaveBeenCalledWith(`mcp:user:${USER_A}`, 100, 60 * 60 * 1000);
  });

  it('returns 429 on the 101st call in the hour window for the same user (bucket boundary)', async () => {
    enableBucketRateLimit(100);
    const statuses: number[] = [];
    let lastBody: { error?: string } = {};
    for (let i = 0; i < 101; i++) {
      const res = await POST(makeRequest(secretBody(), secretHeaders()));
      statuses.push(res.status);
      lastBody = await res.json();
    }
    expect(statuses[99]).toBe(200);
    expect(statuses[100]).toBe(429);
    expect(lastBody.error).toContain('rate limit');
  });

  it('rate limit is per-user: another user is unaffected (cross-user isolation)', async () => {
    enableBucketRateLimit(100);
    for (let i = 0; i < 100; i++) {
      await POST(makeRequest(secretBody(USER_A), secretHeaders()));
    }
    const other = await POST(makeRequest(secretBody(USER_B), secretHeaders()));
    expect(other.status).toBe(200);
  });
});

describe('POST /api/mcp — Supabase Auth cookie channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockImplementation(
      async () => ({ allowed: true, remaining: 100 }),
    );
  });

  it('returns 401 with no cookie and no secret', async () => {
    mockAuthFail();
    const res = await POST(makeRequest(secretBody()));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 400 when toolCalls missing/empty', async () => {
    mockAuthSuccess();
    const res = await POST(makeRequest({ toolCalls: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited, without executing tools', async () => {
    mockAuthSuccess();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest({ toolCalls: [{ id: 'c1', name: 'add_tokens', arguments: {} }] }));
    expect(res.status).toBe(429);
    expect(executeMCPTools).not.toHaveBeenCalled();
  });

  it('executes tools with cookie-auth supabase client keyed by user.id', async () => {
    mockAuthSuccess(USER_B);
    const res = await POST(makeRequest({ toolCalls: [{ id: 'c1', name: 'add_tokens', arguments: {} }] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([{ toolId: 'call-1', success: true }]);
    expect(checkRateLimit).toHaveBeenCalledWith(`mcp:user:${USER_B}`, 100, 60 * 60 * 1000);
    const [, client, userId] = vi.mocked(executeMCPTools).mock.calls[0];
    expect(userId).toBe(USER_B);
    expect(client).toBeDefined();
  });
});
