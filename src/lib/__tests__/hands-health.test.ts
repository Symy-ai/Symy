/**
 * checkHandsHealth 单测 — batch74-a
 * 覆盖: /health 200 → ok; upstream 5xx → !ok; 网络失败 → status:null 不抛;
 * 60s 缓存 (TTL 内只探一次, 过期重探); 手动 reset 强制重探。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkHandsHealth, resetHandsHealthCache } from '../hands-health';

describe('checkHandsHealth', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetHandsHealthCache();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('probes /health and reports ok with status and latency on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));

    const result = await checkHandsHealth();

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.checkedAt).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hands.symy.ai/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reports not-ok (but no throw) when upstream answers 5xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 503 }));

    const result = await checkHandsHealth();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });

  it('maps network-level failures to status null without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await checkHandsHealth();

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
  });

  it('serves cached result within 60s and re-probes after expiry', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const first = await checkHandsHealth();
    const second = await checkHandsHealth();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    vi.advanceTimersByTime(61_000);
    await checkHandsHealth();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resetHandsHealthCache forces a fresh probe', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await checkHandsHealth();
    resetHandsHealthCache();
    await checkHandsHealth();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
