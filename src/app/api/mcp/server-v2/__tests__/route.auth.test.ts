import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mcp-tools/mcp-auth', () => ({
  authenticateMcpRequest: vi.fn(),
  verifyTargetUser: vi.fn(),
  MCP_SERVER_INSTRUCTIONS: 'test instructions',
}));
vi.mock('@/lib/mcp-tools', () => ({
  MCP_TOOLS: [
    {
      name: 'add_tokens',
      description: 'Add tokens',
      parameters: {
        type: 'object' as const,
        properties: { amount: { type: 'number' } },
        required: ['amount'],
      },
    },
  ],
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

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));
vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: vi.fn(),
}));

import { authenticateMcpRequest } from '@/lib/mcp-tools/mcp-auth';
import { POST } from '../route';

const mockedAuthenticate = vi.mocked(authenticateMcpRequest);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/mcp/server-v2', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-mcp-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
  });
}

describe('POST /api/mcp/server-v2 auth wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authenticates the incoming request before creating any MCP machinery', async () => {
    mockedAuthenticate.mockReturnValue({ authenticated: true });
    await expect(POST(makeRequest())).resolves.toBeInstanceOf(Response);
    expect(mockedAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockedAuthenticate.mock.calls[0]?.[0]).toBeInstanceOf(NextRequest);
  });

  it('returns the helper error as JSON-RPC 401 without handling transport', async () => {
    mockedAuthenticate.mockReturnValue({
      authenticated: false,
      error: 'Invalid or missing authentication',
    });
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: 'Invalid or missing authentication' },
    });
  });
});
