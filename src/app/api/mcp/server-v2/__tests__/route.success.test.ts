/**
 * POST /api/mcp/server-v2 success wiring contract (batch96-c)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mcp-tools/mcp-auth', () => ({
  authenticateMcpRequest: vi.fn(() => ({ authenticated: true })),
  verifyTargetUser: vi.fn(),
  MCP_SERVER_INSTRUCTIONS: 'test instructions',
}));
vi.mock('@/lib/mcp-tools', () => ({
  MCP_TOOLS: [{
    name: 'add_tokens',
    description: 'Add tokens',
    parameters: {
      type: 'object' as const,
      properties: { amount: { type: 'number' } },
      required: ['amount'],
    },
  }],
  executeMCPTool: vi.fn(),
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: { from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
    error: null,
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  handleRequest: vi.fn(),
  serverConnect: vi.fn(),
  registerTool: vi.fn(),
  transportConstructor: vi.fn(),
  serverConstructor: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: mocks.transportConstructor,
}));
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mocks.serverConstructor,
}));

import { POST } from '../route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/mcp/server-v2', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-mcp-secret' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

describe('POST /api/mcp/server-v2 success wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleRequest.mockResolvedValue(new Response('MCP handled'));
    mocks.serverConnect.mockResolvedValue(undefined);
    mocks.transportConstructor.mockImplementation(function TransportStub() {
      return { handleRequest: mocks.handleRequest };
    });
    mocks.serverConstructor.mockImplementation(function ServerStub() {
      return { registerTool: mocks.registerTool, connect: mocks.serverConnect };
    });
  });

  it('creates stateless transport, threads token user to the SDK, and returns its response', async () => {
    const request = makeRequest();

    await expect(POST(request)).resolves.toBeInstanceOf(Response);

    expect(mocks.transportConstructor).toHaveBeenCalledWith({
      sessionIdGenerator: undefined,
    });
    expect(mocks.serverConnect).toHaveBeenCalledTimes(1);
    expect(mocks.handleRequest).toHaveBeenCalledWith(request, {
      authInfo: {
        token: 'test-mcp-secret',
        clientId: 'letta-agent',
        scopes: [],
        extra: { userId: undefined },
      },
    });
    expect(mocks.serverConstructor).toHaveBeenCalledTimes(1);
    expect(mocks.registerTool).toHaveBeenCalledTimes(1);
  });
});
