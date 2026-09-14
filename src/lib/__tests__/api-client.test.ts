/**
 * Tests for API Client (api-client.ts)
 *
 * Covers:
 * - ApiError class: construction, properties, name
 * - apiFetch: success, error responses, body serialization, headers, timeout, abort signal
 * - apiFetchVoid: success, error responses, void return
 * - Edge cases: 204 No Content, JSON parse errors, network errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiFetchVoid, ApiError } from '@/lib/api-client';
/* eslint-disable require-await -- test mocks use async for API consistency */

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper: create a mock Response
function makeResponse(
  body: unknown,
  init: { status?: number; ok?: boolean; statusText?: string } = {},
): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText: init.statusText ?? '',
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => bodyStr,
  } as Response;
}

describe('ApiError', () => {
  it('constructs with status, message, and body', () => {
    const err = new ApiError(404, 'Not found', { detail: 'resource missing' });
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.body).toEqual({ detail: 'resource missing' });
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError(500, 'Server error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('body is optional', () => {
    const err = new ApiError(400, 'Bad request');
    expect(err.body).toBeUndefined();
  });
});

describe('apiFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns parsed JSON on success', async () => {
    const mockData = { sessions: [{ id: '1' }] };
    mockFetch.mockResolvedValue(makeResponse(mockData));

    const result = await apiFetch<{ sessions: Array<{ id: string }> }>('/api/sessions');
    expect(result).toEqual(mockData);
  });

  it('sends GET request by default', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBeUndefined(); // GET is default
  });

  it('sends POST request with JSON body', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', {
      method: 'POST',
      body: { name: 'test', value: 42 },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'test', value: 42 }));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('includes credentials: include', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('sets Content-Type: application/json by default', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('allows custom headers to override Content-Type', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', {
      headers: { 'Content-Type': 'text/plain' },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('text/plain');
  });

  it('throws ApiError on non-2xx with JSON error body', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Resource not found' }, { status: 404 }));

    await expect(apiFetch('/api/test')).rejects.toThrow(ApiError);
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      status: 404,
      message: 'Resource not found',
    });
  });

  it('throws ApiError with HTTP status when error body has no "error" field', async () => {
    mockFetch.mockResolvedValue(makeResponse({ detail: 'something' }, { status: 500 }));

    try {
      await apiFetch('/api/test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).message).toBe('HTTP 500');
    }
  });

  it('falls back to text body when JSON parse fails', async () => {
    const response = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new Error('Not JSON'); },
      text: async () => '<html>Bad Gateway</html>',
    } as unknown as Response;
    mockFetch.mockResolvedValue(response);

    try {
      await apiFetch('/api/test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).body).toBe('<html>Bad Gateway</html>');
    }
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, { status: 204 }));

    const result = await apiFetch<void>('/api/test');
    expect(result).toBeUndefined();
  });

  it('respects caller abort signal (already aborted)', async () => {
    const controller = new AbortController();
    controller.abort();

    // fetch will be called but immediately fail due to aborted signal
    mockFetch.mockImplementation((_url, _init) => {
      return Promise.reject(new DOMException('The user aborted a request', 'AbortError'));
    });

    await expect(
      apiFetch('/api/test', { signal: controller.signal, timeoutMs: 0 }),
    ).rejects.toThrow();
  });

  it('passes caller signal listener and cleans up', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    // 🔧 2026-07-15 (ARCH-11 #29): dedupe=false to ensure callerSignal is passed
    //    (dedupe=true ignores callerSignal to prevent A abort from affecting B)
    await apiFetch('/api/test', { signal: controller.signal, timeoutMs: 0, dedupe: false });

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('timeoutMs=0 disables timeout', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', { timeoutMs: 0 });

    // Just verify no crash — can't easily test "no setTimeout" without mocking timers
    expect(mockFetch).toHaveBeenCalled();
  });

  it('propagates network errors (fetch rejection)', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/test')).rejects.toThrow(TypeError);
  });

  it('handles empty body in POST (body=undefined)', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', { method: 'POST' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('serializes body=0 (falsy but defined)', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', { method: 'POST', body: 0 });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe('0');
  });

  it('serializes body=false (falsy but defined)', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', { method: 'POST', body: false });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe('false');
  });

  it('serializes body=null', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    await apiFetch('/api/test', { method: 'POST', body: null });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe('null');
  });
});

describe('apiFetchVoid', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns void on success', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    const result = await apiFetchVoid('/api/test');
    expect(result).toBeUndefined();
  });

  it('does not parse response body on success', async () => {
    // Verify it doesn't call .json() on success
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn(),
      text: vi.fn(),
    } as unknown as Response;
    mockFetch.mockResolvedValue(response);

    await apiFetchVoid('/api/test');

    expect(response.json).not.toHaveBeenCalled();
  });

  it('throws ApiError on non-2xx with JSON error body', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'Validation failed' }, { status: 422 }));

    try {
      await apiFetchVoid('/api/test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(422);
      expect((err as ApiError).message).toBe('Validation failed');
    }
  });

  it('throws ApiError with string body fallback', async () => {
    const response = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new Error('Not JSON'); },
      text: async () => 'Bad Gateway Error',
    } as unknown as Response;
    mockFetch.mockResolvedValue(response);

    try {
      await apiFetchVoid('/api/test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).message).toBe('Bad Gateway Error');
    }
  });

  it('throws ApiError with HTTP status when body is empty', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('Not JSON'); },
      text: async () => '',
    } as unknown as Response;
    mockFetch.mockResolvedValue(response);

    try {
      await apiFetchVoid('/api/test');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).message).toBe('HTTP 500');
    }
  });

  it('sends DELETE request', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, { status: 204 }));

    await apiFetchVoid('/api/test/123', { method: 'DELETE' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('DELETE');
  });

  it('handles 204 No Content (no body parsing)', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, { status: 204 }));

    await expect(apiFetchVoid('/api/test')).resolves.toBeUndefined();
  });

  it('cleans up caller signal listener on success', async () => {
    mockFetch.mockResolvedValue(makeResponse({}));

    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    await apiFetchVoid('/api/test', { signal: controller.signal, timeoutMs: 0 });

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('cleans up caller signal listener on error', async () => {
    mockFetch.mockResolvedValue(makeResponse({ error: 'fail' }, { status: 500 }));

    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    await expect(
      apiFetchVoid('/api/test', { signal: controller.signal, timeoutMs: 0 }),
    ).rejects.toThrow(ApiError);

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
