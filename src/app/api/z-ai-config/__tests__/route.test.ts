/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * Tests for GET /api/z-ai-config
 *
 * 🔧 2026-07-15: Updated to mock withAuth instead of createAuthenticatedClient
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock withAuth — extract the handler and call it with mock context
let mockAuthResult: { user: { id: string } | null; error: string | null } = {
  user: { id: 'user-123' },
  error: null,
};

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => { // eslint-disable-next-line require-await -- mock returns promise
      if (!mockAuthResult.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockAuthResult.user, supabase: {} });
    };
  },
}));

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';
import { readFile } from 'fs/promises';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/z-ai-config', { method: 'GET' });
}

function authedMock() {
  mockAuthResult = { user: { id: 'user-123' }, error: null };
}

function unauthedMock() {
  mockAuthResult = { user: null, error: 'Not authenticated' };
}

describe('GET /api/z-ai-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthResult = { user: { id: 'user-123' }, error: null };
  });

  it('returns 401 when unauthenticated (BUG-283 security fix)', async () => {
    unauthedMock();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 200 with config from file (without apiKey/token — C3 + 2026-07-21 security fix)', async () => {
    authedMock();
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
      baseUrl: 'https://api.example.com',
      apiKey: 'secret-key-that-should-not-be-exposed',
      chatId: 'chat-123',
      userId: 'user-456',
      token: 'token-789',
    }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.baseUrl).toBe('https://api.example.com');
    expect(json.chatId).toBe('chat-123');
    expect(json.userId).toBe('user-456');
    // 🔧 2026-07-21 audit fix: token (付费 Z.AI API key) 绝不返回给客户端,
    //    否则任意 authenticated user 可盗用付费额度。apiKey 同理 (C3 fix)。
    expect(json.token).toBeUndefined();
    expect(json.apiKey).toBeUndefined();
  });

  it('returns 500 when config file has invalid JSON', async () => {
    authedMock();
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('not valid json');

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it('returns 500 when config file is missing required fields', async () => {
    authedMock();
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
      baseUrl: 'https://api.example.com',
    }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
