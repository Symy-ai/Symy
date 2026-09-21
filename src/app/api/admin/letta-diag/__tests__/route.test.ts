import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: vi.fn(() => ({ authorized: true, actor: 'admin' })),
}));

import { GET } from '../route';
import { verifyAdminAuth } from '@/lib/admin-auth';

const request = new NextRequest('http://localhost/api/admin/letta-diag');

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = vi.fn();
});

describe('GET /api/admin/letta-diag', () => {
  it('rejects non-admin requests before probing Letta', async () => {
    vi.mocked(verifyAdminAuth).mockReturnValueOnce({
      authorized: false,
      error: 'Invalid admin API key',
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid admin API key' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports upstream ok and redacts configuration values', async () => {
    vi.stubEnv('LETTA_API_KEY', 'secret-key');
    vi.stubEnv('LETTA_BASE_URL', 'https://letta.example.com/');
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_023);

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lettaConfigured: true,
      baseUrl: 'set',
      upstream: 'ok',
      upstreamLatencyMs: 23,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://letta.example.com/v1/agents?limit=1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret-key' },
        cache: 'no-store',
      }),
    );
  });

  it('reports upstream fail for network errors', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(2_004);

    const response = await GET(request);

    expect(await response.json()).toEqual({
      lettaConfigured: false,
      baseUrl: 'unset',
      upstream: 'fail',
      upstreamLatencyMs: 4,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.letta.com/v1/agents?limit=1',
      expect.objectContaining({ headers: undefined }),
    );
  });

  it('reports upstream timeout after five seconds', async () => {
    vi.useFakeTimers();
    vi.mocked(globalThis.fetch).mockImplementationOnce((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
    );

    try {
      const responsePromise = GET(request);
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await responsePromise;

      expect(await response.json()).toEqual({
        lettaConfigured: false,
        baseUrl: 'unset',
        upstream: 'timeout',
        upstreamLatencyMs: 5_000,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
