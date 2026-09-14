/**
 * Letta API wrapper tests — timeout + error classification
 *
 * 🔧 架构优化 Round 71: 测试 lettaAPI 安全加固 (Finding 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { lettaAPI, LettaAPIError } from '../letta-mcp-manager';

describe('lettaAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns response on success', async () => {
    const mockResponse = { ok: true, status: 200, text: async () => '{}' };
    mockFetch.mockResolvedValueOnce(mockResponse);

    const result = await lettaAPI('/agents');
    expect(result).toBe(mockResponse);
  });

  it('throws LettaAPIError on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => 'Unauthorized',
    });

    try {
      await lettaAPI('/agents');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LettaAPIError);
      expect((e as LettaAPIError).status).toBe(401);
      expect((e as LettaAPIError).path).toBe('/agents');
    }
  });

  it('throws LettaAPIError on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => '60' },
      text: async () => 'Rate limited',
    });

    await expect(lettaAPI('/agents')).rejects.toThrow(LettaAPIError);
  });

  it('throws LettaAPIError on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => 'Internal server error',
    });

    await expect(lettaAPI('/agents')).rejects.toThrow(LettaAPIError);
  });

  it('includes path in error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => 'Not found',
    });

    try {
      await lettaAPI('/agents/123');
    } catch (e) {
      expect((e as LettaAPIError).path).toBe('/agents/123');
      expect((e as Error).message).toContain('/agents/123');
    }
  });

  it('rethrows non-LettaAPIError network errors', async () => {
    const networkError = new TypeError('Failed to fetch');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(lettaAPI('/agents')).rejects.toThrow('Failed to fetch');
  });
});
