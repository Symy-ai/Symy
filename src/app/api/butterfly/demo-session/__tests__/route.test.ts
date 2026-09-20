import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET, POST } from '../route';

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(),
}));

import { checkRateLimit } from '@/lib/distributed-lock';

const mockedCheckRateLimit = vi.mocked(checkRateLimit);

function postRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

function getRequest(sessionId?: string): NextRequest {
  return { url: `http://localhost/api/butterfly/demo-session${sessionId ? `?sessionId=${sessionId}` : ''}` } as NextRequest;
}

function validBody() {
  return {
    decisionType: 'resisted',
    decisionDescription: 'Skipped a mechanical keyboard',
    amount: 123.45,
    platform: 'web',
    locale: 'en',
  };
}

describe('POST /api/butterfly/demo-session', () => {
  beforeEach(() => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it('rate-limits the extracted client IP before creating a session', async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    const response = await POST(postRequest(validBody(), {
      'x-vercel-forwarded-for': '198.51.100.10, 198.51.100.11',
    }));

    expect(response.status).toBe(429);
    expect(mockedCheckRateLimit).toHaveBeenCalledWith('demo-session:198.51.100.11', 10, 3_600_000);
  });

  it.each([-1, 1_000_000_001, Number.NaN])('rejects amount %s with validation errors', async (amount) => {
    const response = await POST(postRequest({ ...validBody(), amount }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Validation failed');
    expect(body.issues.some((issue: { path: string }) => issue.path === 'amount')).toBe(true);
  });

  it('creates an in-memory demo session under the demo user', async () => {
    const response = await POST(postRequest(validBody(), { 'x-real-ip': '203.0.113.9' }));
    expect(response.status).toBe(200);
    const { session } = await response.json();
    expect(mockedCheckRateLimit).toHaveBeenCalledWith('demo-session:203.0.113.9', 10, 3_600_000);
    expect(session.userId).toBe('demo-user');
    expect(session.isExample).toBeUndefined();
    expect(session.decisionDescription).toBe('Skipped a mechanical keyboard');
    expect(session.status).toBe('active');
  });
});

describe('GET /api/butterfly/demo-session', () => {
  it('returns an existing demo session by id', async () => {
    const created = await POST(postRequest(validBody()));
    const { session } = await (await created.json()) as { session: { id: string } };
    const response = await GET(getRequest(session.id));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ session: { id: session.id } });
  });

  it('returns null when the session does not exist', async () => {
    const response = await GET(getRequest('missing-session'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: null });
  });
});
