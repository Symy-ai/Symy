// mcp/server — MCP JSON-RPC 端点（此前 0 测试, 542行最后无测文件）
// 入口面: 双路径secret认证401/JSON-RPC格式zod/notifications→202/
// initialize握手。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/timing-safe-compare', () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/sse', () => ({
  sendSSEEvent: vi.fn(),
  closeSSE: vi.fn(),
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
}));
vi.mock('@/lib/mcp-tools/mcp-auth', () => ({
  MCP_SERVER_INSTRUCTIONS: 'test instructions',
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: null, error: null }),
  getSupabaseAdminDiagnostics: vi.fn().mockReturnValue({ configured: false }),
}));
vi.mock('@/lib/mcp-tools', () => ({
  executeMCPTool: vi.fn(),
  MCP_TOOLS: [],
}));

// setup.ts 全局设 MCP_API_SECRET='test-mcp-secret'
import { POST } from '../route';

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/mcp/server', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('POST /api/mcp/server — JSON-RPC 入口', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无 secret → 401 jsonrpc 错误形态', async () => {
    const res = await POST(req({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
  });

  it('错误 secret → 401', async () => {
    const res = await POST(req({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('X-MCP-Secret 旧路径也认证 (兼容)', async () => {
    const res = await POST(req({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { 'x-mcp-secret': 'test-mcp-secret' }));
    expect(res.status).toBe(200);
  });

  it('非 JSON → 400 Parse error (-32700)', async () => {
    const res = await POST(req('{bad json', { 'x-mcp-secret': 'test-mcp-secret' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('jsonrpc 版本错 → 400 Invalid Request (-32600)', async () => {
    const res = await POST(req({ jsonrpc: '1.0', id: 1, method: 'x' }, { 'x-mcp-secret': 'test-mcp-secret' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });

  it('notifications/* 无 id → 202 Accepted', async () => {
    const res = await POST(req({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'x-mcp-secret': 'test-mcp-secret' }));
    expect(res.status).toBe(202);
  });

  it('initialize → 200 带协议版本', async () => {
    const res = await POST(req({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { 'x-mcp-secret': 'test-mcp-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.result).toBeTruthy();
  });
});
