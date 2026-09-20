import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/timing-safe-compare', () => ({
  timingSafeCompare: vi.fn((provided: string, expected: string) => provided === expected),
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { authenticateMcpRequest, verifyTargetUser } from '../mcp-auth';

const secret = process.env.MCP_API_SECRET || '';
type TestSupabaseClient = Parameters<typeof verifyTargetUser>[2];

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/mcp/server-v2', { headers });
}

function makeSupabase(profile: unknown, error: unknown = null) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: profile, error }));
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  } as unknown as TestSupabaseClient;
  return { supabase, maybeSingle };
}

describe('authenticateMcpRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a pure-secret bearer token', () => {
    expect(authenticateMcpRequest(makeRequest({ Authorization: `Bearer ${secret}` })))
      .toEqual({ authenticated: true });
    expect(timingSafeCompare).toHaveBeenCalledWith(secret, secret);
  });

  it('accepts a per-user bearer token and extracts the token user', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const result = authenticateMcpRequest(makeRequest({
      Authorization: `Bearer mcp:${userId}:${secret}`,
    }));
    expect(result).toEqual({ authenticated: true, tokenUserId: userId });
    expect(timingSafeCompare).toHaveBeenCalledWith(secret, secret);
  });

  it('accepts the legacy X-MCP-Secret header', () => {
    expect(authenticateMcpRequest(makeRequest({ 'X-MCP-Secret': secret })))
      .toEqual({ authenticated: true });
  });

  it('rejects a request without auth headers', () => {
    expect(authenticateMcpRequest(makeRequest())).toEqual({
      authenticated: false,
      error: 'Invalid or missing authentication',
    });
    expect(timingSafeCompare).not.toHaveBeenCalled();
  });

  it('rejects wrong secrets without authenticating', () => {
    expect(authenticateMcpRequest(makeRequest({ Authorization: 'Bearer wrong' })))
      .toEqual({ authenticated: false, error: 'Invalid or missing authentication' });
    expect(timingSafeCompare).toHaveBeenCalledWith('wrong', secret);
  });

  it('rejects empty and malformed bearer tokens', () => {
    for (const token of ['', 'mcp:user', `mcp:user:${secret}:extra`, 'Basic secret']) {
      expect(authenticateMcpRequest(makeRequest({ Authorization: `Bearer ${token}` })))
        .toEqual({ authenticated: false, error: 'Invalid or missing authentication' });
    }
  });

  it('rejects the legacy header when the configured secret is empty', async () => {
    const original = process.env.MCP_API_SECRET;
    vi.resetModules();
    process.env.MCP_API_SECRET = '';

    try {
      const { authenticateMcpRequest: authenticate } = await import('../mcp-auth');
      expect(authenticate(makeRequest({ 'X-MCP-Secret': '' }))).toEqual({
        authenticated: false,
        error: 'Invalid or missing authentication',
      });
    } finally {
      process.env.MCP_API_SECRET = original;
    }
  });
});

describe('verifyTargetUser', () => {
  beforeEach(() => vi.clearAllMocks());

  const userId = '22222222-2222-4222-8222-222222222222';

  it('uses the scoped token user when arguments omit user_id', async () => {
    const { supabase, maybeSingle } = makeSupabase({ id: userId, letta_agent_id: 'agent' });
    await expect(verifyTargetUser(undefined, userId, supabase)).resolves.toEqual({
      valid: true,
      userId,
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('rejects an argument user that differs from the token user before DB access', async () => {
    const otherId = '33333333-3333-4333-8333-333333333333';
    const { supabase, maybeSingle } = makeSupabase(null);
    const result = await verifyTargetUser(otherId, userId, supabase);
    expect(result).toEqual({
      valid: false,
      error: 'user_id mismatch: authenticated as 22222222... but arguments specify different user. Cross-user operations are not allowed.',
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('rejects missing and invalid user ids before database access', async () => {
    const { supabase, maybeSingle } = makeSupabase({ id: 'unused' });
    await expect(verifyTargetUser('not-a-uuid', undefined, supabase))
      .resolves.toMatchObject({
        valid: false,
        error: 'Invalid user_id format: must be a valid UUID.',
      });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('rejects a valid user when the database client is unavailable', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    await expect(verifyTargetUser(userId, undefined, false as unknown as TestSupabaseClient))
      .resolves.toMatchObject({ valid: false, error: 'Database client unavailable.' });
  });

  it('requires an existing user and an agent for pure-secret authentication', async () => {
    await expect(verifyTargetUser(userId, undefined, makeSupabase(null).supabase))
      .resolves.toMatchObject({ valid: false, error: 'User not found in database.' });
    await expect(verifyTargetUser(userId, undefined, makeSupabase({ id: userId }).supabase))
      .resolves.toMatchObject({
        valid: false,
        error: 'User not eligible for MCP tool calls (no agent configured).',
      });
  });

  it('does not require an agent for token-scoped authentication', async () => {
    const { supabase } = makeSupabase({ id: userId, letta_agent_id: null });
    await expect(verifyTargetUser(userId, userId, supabase)).resolves.toEqual({
      valid: true,
      userId,
    });
  });

  it('converts database failures into opaque identity errors', async () => {
    const { supabase } = makeSupabase(null, new Error('connection refused'));
    await expect(verifyTargetUser(userId, undefined, supabase))
      .resolves.toMatchObject({ valid: false, error: 'Failed to verify user identity.' });
  });
});
