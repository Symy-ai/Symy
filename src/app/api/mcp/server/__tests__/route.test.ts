/**
 * Integration tests for POST /api/mcp/server (MCP Streamable HTTP endpoint)
 *
 * 🔧 ARCH fix Round 73 — Audit Finding 4.17:
 *   MCP protocol server had ZERO tests. Critical paths:
 *   - 401 when no auth
 *   - 401 when wrong secret
 *   - 200 on initialize handshake (returns session ID)
 *   - 200 on tools/list (returns tool definitions)
 *   - 200 on ping
 *   - 400 on invalid JSON-RPC (missing jsonrpc version)
 *   - 400 on parse error (malformed JSON)
 *   - 202 on notifications/* (no id)
 *   - 401 with bearer token + wrong secret
 *   - 200 with bearer token mcp:{userId}:{secret} format
 *   - tools/call with user_id mismatch (cross-user guard)
 *   - tools/call with invalid UUID (injection guard)
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/timing-safe-compare', () => ({
  timingSafeCompare: vi.fn((a: string, b: string) => a === b),
}));

vi.mock('@/lib/mcp-tools', () => ({
  MCP_TOOLS: [
    {
      name: 'add_tokens',
      description: 'Add tokens to user',
      parameters: {
        type: 'object' as const,
        properties: { amount: { type: 'number', description: 'tokens' } },
        required: ['amount'],
      },
    },
  ],
  executeMCPTool: vi.fn(async () => ({
    content: [{ type: 'text', text: 'success' }],
  })),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: 'user-123' }, error: null })),
          })),
        })),
      })),
    },
    error: null,
  })),
  getSupabaseAdminDiagnostics: vi.fn(() => ({ hasUrl: true, hasKey: true })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// MCP_API_SECRET is set in src/test/setup.ts at module load (route reads it at import).

import { POST } from '../route';

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/mcp/server', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/mcp/server — auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no auth header present', async () => {
    const res = await POST(makeRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize',
    }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe(-32001);
  });

  it('returns 401 when Authorization Bearer secret is wrong', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {
        Authorization: 'Bearer wrong-secret',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 when Authorization Bearer secret matches MCP_API_SECRET', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.protocolVersion).toBeDefined();
    expect(json.result.serverInfo.name).toBe('symy-mcp-server');
  });

  it('returns 200 when X-MCP-Secret header matches', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {
        'X-MCP-Secret': 'test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('accepts mcp:{userId}:{secret} bearer token format (per-user)', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {
        Authorization: 'Bearer mcp:user-123:test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 when mcp:{userId}:{secret} format has wrong secret', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {
        Authorization: 'Bearer mcp:user-123:wrong-secret',
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/mcp/server — JSON-RPC protocol', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 on invalid JSON (parse error)', async () => {
    const req = new NextRequest('http://localhost/api/mcp/server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-mcp-secret' },
      body: 'not valid json{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe(-32700);
  });

  it('returns 400 when jsonrpc version is missing', async () => {
    const res = await POST(
      makeRequest({ id: 1, method: 'initialize' }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe(-32600);
  });

  it('returns 202 for notifications (no id)', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(202);
  });

  it('returns initialize response with Mcp-Session-Id header', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const sessionId = res.headers.get('Mcp-Session-Id');
    expect(sessionId).toBeTruthy();
    // Should be a UUID
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns tools list for tools/list method', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.tools).toBeInstanceOf(Array);
    expect(json.result.tools.length).toBeGreaterThan(0);
    expect(json.result.tools[0].name).toBe('add_tokens');
  });

  it('returns ping response', async () => {
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 3, method: 'ping' }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBeDefined();
  });
});

describe('POST /api/mcp/server — tools/call security', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects tools/call with user_id mismatch (cross-user guard)', async () => {
    const res = await POST(
      makeRequest({
        jsonrpc: '2.0', id: 4, method: 'tools/call',
        params: {
          name: 'add_tokens',
          arguments: {
            user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', // different UUID
            amount: 10,
          },
        },
      }, {
        // Bearer token with one user, arguments.user_id with another
        Authorization: 'Bearer mcp:12345678-1234-1234-1234-123456789012:test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('mismatch');
  });

  it('rejects tools/call with invalid UUID (injection guard)', async () => {
    const res = await POST(
      makeRequest({
        jsonrpc: '2.0', id: 5, method: 'tools/call',
        params: {
          name: 'add_tokens',
          arguments: {
            user_id: 'not-a-uuid',
            amount: 10,
          },
        },
      }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('Invalid user_id format');
  });

  it('rejects tools/call when user_id is missing', async () => {
    const res = await POST(
      makeRequest({
        jsonrpc: '2.0', id: 6, method: 'tools/call',
        params: {
          name: 'add_tokens',
          arguments: { amount: 10 },
        },
      }, {
        Authorization: 'Bearer test-mcp-secret',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('Missing user_id');
  });
});
