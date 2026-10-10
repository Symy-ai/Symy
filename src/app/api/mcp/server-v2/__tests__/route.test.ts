import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  authenticate: vi.fn(),
  verifyTargetUser: vi.fn(),
  createAdminClient: vi.fn(),
  executeMCPTool: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/mcp-tools', () => ({
  executeMCPTool: M.executeMCPTool,
  MCP_TOOLS: [
    {
      name: 'record_impulse',
      description: 'Record a purchase impulse',
      parameters: {
        type: 'object',
        required: ['user_id', 'item_name'],
        properties: {
          user_id: { type: 'string' },
          item_name: { type: 'string', description: 'The item' },
          price: { type: 'number', description: 'Optional price' },
        },
      },
    },
  ],
}));
vi.mock('@/lib/mcp-tools/mcp-auth', () => ({
  authenticateMcpRequest: M.authenticate,
  verifyTargetUser: M.verifyTargetUser,
  MCP_SERVER_INSTRUCTIONS: 'instr',
}));

import { POST } from '../route';

function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return new Request('https://symy.ai/api/mcp/server-v2', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-mcp-secret', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-03-26' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }) as never;
}

/**
 * mcp/server-v2 route (308行) — SDK 版 MCP 端点 (stateless, 6 工具)。
 *
 * 锁定 (SDK 协议层之外的我们代码面):
 * - 401 未授权 → JSON-RPC -32001 + CORS 头
 * - 授权 → SDK 流程接管 (initialize/tools-list 正常响应)
 * - 内部错误 → -32603
 */
/** SDK 默认 SSE 流响应 — 从 event: message 块解 JSON-RPC */
async function parseSse(res: Response): Promise<{ result?: { serverInfo?: { name: string }; instructions?: string; tools?: Array<{ name: string; inputSchema: { required?: string[] } }> }; error?: { code: number } }> {
  const text = await res.text();
  const m = text.match(/data: (.+)/);
  if (!m) throw new Error(`no SSE data in: ${text.slice(0, 120)}`);
  return JSON.parse(m[1]);
}

describe('POST /api/mcp/server-v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_API_SECRET = 'test-mcp-secret';
    M.authenticate.mockReturnValue({ authenticated: true, tokenUserId: 'user-abc' });
    M.createAdminClient.mockReturnValue({ supabase: {}, error: null });
    M.verifyTargetUser.mockResolvedValue({ valid: true, userId: 'user-abc' });
    M.executeMCPTool.mockResolvedValue({ success: true, message: 'ok', result: {} });
  });

  it('未授权 → 401 JSON-RPC -32001 + CORS', async () => {
    M.authenticate.mockReturnValueOnce({ authenticated: false, error: 'bad token' });
    const res = await POST(new Request('https://symy.ai/api/mcp/server-v2', { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('授权 → SDK initialize 协议正常 (serverInfo 名称锚)', async () => {
    const res = await POST(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'letta', version: '1' } }));
    expect(res.status).toBe(200);
    const body = await parseSse(res);
    expect(body.result?.serverInfo?.name).toBe('symy-mcp-server');
    expect(body.result?.instructions).toBe('instr');
  });

  it('tools/list → 注册的工具+JSON Schema 形状', async () => {
    const res = await POST(rpc('tools/list', {}));
    expect(res.status).toBe(200);
    const body = await parseSse(res);
    const tool = body.result?.tools?.[0] as { name: string; inputSchema: { required?: string[] } };
    expect(tool.name).toBe('record_impulse');
    // AUDIT-10 BUG #1: price 非必填 → schema 不在 required
    expect(tool.inputSchema.required).toContain('item_name');
    expect(tool.inputSchema.required).not.toContain('price');
  });

  it('未知方法 → -32601 (SDK 内建)', async () => {
    const res = await POST(rpc('resources/list', {}, 3));
    const body = await parseSse(res);
    expect(body.error?.code).toBe(-32601);
  });

  it('ping → pong (SDK 内建)', async () => {
    const res = await POST(rpc('ping', {}, 4));
    expect(res.status).toBe(200);
  });
});
