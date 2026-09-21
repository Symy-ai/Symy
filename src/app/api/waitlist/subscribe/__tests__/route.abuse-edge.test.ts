import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockedFetch = vi.fn();
vi.stubGlobal('fetch', mockedFetch);
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';

let ipCounter = 0;
let now = Date.now();

function makeRequest(body: unknown, ip?: string): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip ?? `192.0.2.${++ipCounter}`,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function restResponse(status: number): Response {
  return new Response(status === 204 ? null : JSON.stringify({ status }), { status });
}

describe('POST /api/waitlist/subscribe — duplicate and degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue(restResponse(201));
    now = Date.now();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  it('returns byte-identical success responses for first and duplicate email inserts', async () => {
    mockedFetch
      .mockResolvedValueOnce(restResponse(201))
      .mockResolvedValueOnce(restResponse(409));
    const first = await POST(makeRequest({ email: 'Same@Example.com' }));
    const duplicate = await POST(makeRequest({ email: 'same@example.com' }));
    expect(first.status).toBe(duplicate.status);
    expect(first.status).toBe(200);
    expect(await first.text()).toBe(await duplicate.text());
  });

  it('returns 201-equivalent success for a PostgREST 201 upstream response', async () => {
    mockedFetch.mockResolvedValueOnce(restResponse(201));

    const response = await POST(makeRequest({ email: 'success@example.com' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('inserts a normalized email through PostgREST without read-before-write', async () => {
    await POST(makeRequest({ email: 'User@Example.com' }));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0][0]).toBe('http://localhost:54321/rest/v1/landing_waitlist');
    expect(mockedFetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email: 'user@example.com', source: 'landing_page' }),
    });
  });

  it('maps a missing table response to calm 503 without leaking the raw body', async () => {
    mockedFetch.mockResolvedValueOnce(new Response('relation missing', { status: 404 }));
    const response = await POST(makeRequest({ email: 'table@example.com' }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Waitlist not available yet',
    });
  });
});

describe('POST /api/waitlist/subscribe — rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue(restResponse(201));
    now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => vi.useRealTimers());

  it('allows five requests then rejects the sixth with 429', async () => {
    const ip = '198.51.100.10';
    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      expect((await POST(makeRequest({ email: `u${requestIndex}@example.com` }, ip))).status).toBe(200);
    }
    const sixth = await POST(makeRequest({ email: 'u5@example.com' }, ip));
    expect(sixth.status).toBe(429);
    await expect(sixth.json()).resolves.toEqual({ error: 'Too many requests' });
    expect(mockedFetch).toHaveBeenCalledTimes(5);
  });

  it('keeps first-hop IPs independent and falls back to unknown when no IP is present', async () => {
    const exhausted = '198.51.100.11';
    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      await POST(makeRequest({ email: `x${requestIndex}@example.com` }, exhausted));
    }
    const neighbour = await POST(makeRequest(
      { email: 'neighbour@example.com' },
      `${exhausted}, 10.0.0.1`,
    ));
    expect(neighbour.status).toBe(429);
    expect(mockedFetch).toHaveBeenCalledTimes(5);

    const unknown = await POST(new NextRequest('http://localhost/api/waitlist/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com' }),
    }));
    expect(unknown.status).toBe(200);
  });

  it('reopens the window after ten minutes', async () => {
    const ip = '198.51.100.12';
    for (let requestIndex = 0; requestIndex < 5; requestIndex += 1) {
      await POST(makeRequest({ email: `w${requestIndex}@example.com` }, ip));
    }
    expect((await POST(makeRequest({ email: 'w5@example.com' }, ip))).status).toBe(429);
    vi.setSystemTime(now + 10 * 60 * 1000 + 1);
    expect((await POST(makeRequest({ email: 'w6@example.com' }, ip))).status).toBe(200);
  });
});
