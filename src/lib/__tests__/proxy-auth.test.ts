/**
 * Tests for Proxy Auth (proxy-auth.ts)
 *
 * Covers:
 * - extractAndValidateApiKey: Azure api-key, OpenAI Bearer, OpenAI raw, missing, wrong
 * - getCorsOrigin: allowed origins, disallowed origins, missing origin
 * - getCorsHeaders: structure, values
 * - handleOptions: 204 response with CORS headers
 *
 * Note: Sets PROXY_API_SECRET env var before import.
 */

import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';

// Set proxy secret BEFORE importing the module
process.env.PROXY_API_SECRET = 'test-proxy-secret-12345';
delete process.env.MCP_API_SECRET;

const { extractAndValidateApiKey, getCorsOrigin, getCorsHeaders, handleOptions } = await import('@/lib/proxy-auth');

// Helper: create a mock NextRequest
function makeRequest(
  headers: Record<string, string> = {},
  url = 'https://symy.ai/api/v1/chat/completions',
): NextRequest {
  return {
    url,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

describe('extractAndValidateApiKey', () => {
  describe('Azure OpenAI format (api-key header)', () => {
    it('validates correct api-key', () => {
      const req = makeRequest({ 'api-key': 'test-proxy-secret-12345' });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });

    it('rejects wrong api-key', () => {
      const req = makeRequest({ 'api-key': 'wrong-key' });
      expect(extractAndValidateApiKey(req)).toBeNull();
    });

    it('rejects empty api-key', () => {
      const req = makeRequest({ 'api-key': '' });
      expect(extractAndValidateApiKey(req)).toBeNull();
    });
  });

  describe('OpenAI format (Authorization header)', () => {
    it('validates correct Bearer token', () => {
      const req = makeRequest({ Authorization: 'Bearer test-proxy-secret-12345' });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });

    it('validates correct raw Authorization (no Bearer prefix)', () => {
      const req = makeRequest({ Authorization: 'test-proxy-secret-12345' });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });

    it('rejects wrong Bearer token', () => {
      const req = makeRequest({ Authorization: 'Bearer wrong-key' });
      expect(extractAndValidateApiKey(req)).toBeNull();
    });

    it('rejects wrong raw Authorization', () => {
      const req = makeRequest({ Authorization: 'wrong-key' });
      expect(extractAndValidateApiKey(req)).toBeNull();
    });

    it('rejects empty Bearer token', () => {
      const req = makeRequest({ Authorization: 'Bearer ' });
      expect(extractAndValidateApiKey(req)).toBeNull();
    });
  });

  describe('missing credentials', () => {
    it('returns null when no auth headers present', () => {
      const req = makeRequest({});
      expect(extractAndValidateApiKey(req)).toBeNull();
    });

    it('returns null when only unrelated headers present', () => {
      const req = makeRequest({ 'Content-Type': 'application/json' });
      expect(extractAndValidateApiKey(req)).toBeNull();
    });
  });

  describe('credential priority', () => {
    it('Azure api-key checked first (even if Authorization is wrong)', () => {
      const req = makeRequest({
        'api-key': 'test-proxy-secret-12345',
        Authorization: 'Bearer wrong-key',
      });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });

    it('falls back to Authorization when api-key is wrong', () => {
      const req = makeRequest({
        'api-key': 'wrong-azure-key',
        Authorization: 'Bearer test-proxy-secret-12345',
      });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });
  });

  describe('trimming', () => {
    it('trims Azure api-key', () => {
      const req = makeRequest({ 'api-key': '  test-proxy-secret-12345  ' });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });

    it('trims Bearer token', () => {
      const req = makeRequest({ Authorization: 'Bearer  test-proxy-secret-12345  ' });
      expect(extractAndValidateApiKey(req)).toBe('test-proxy-secret-12345');
    });
  });
});

describe('getCorsOrigin', () => {
  it('returns origin for allowed origin (symy.ai)', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    expect(getCorsOrigin(req)).toBe('https://symy.ai');
  });

  it('returns origin for allowed origin (vercel)', () => {
    const req = makeRequest({ Origin: 'https://we-me-mvp.vercel.app' });
    expect(getCorsOrigin(req)).toBe('https://we-me-mvp.vercel.app');
  });

  it('returns origin for localhost', () => {
    const req = makeRequest({ Origin: 'http://localhost:3000' });
    expect(getCorsOrigin(req)).toBe('http://localhost:3000');
  });

  it('returns empty string for disallowed origin', () => {
    const req = makeRequest({ Origin: 'https://evil.com' });
    expect(getCorsOrigin(req)).toBe('');
  });

  it('returns empty string for missing Origin header', () => {
    const req = makeRequest({});
    expect(getCorsOrigin(req)).toBe('');
  });
});

describe('getCorsHeaders', () => {
  it('returns headers object with required keys', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    const headers = getCorsHeaders(req);
    expect(headers).toHaveProperty('Access-Control-Allow-Origin');
    expect(headers).toHaveProperty('Access-Control-Allow-Methods');
    expect(headers).toHaveProperty('Access-Control-Allow-Headers');
    expect(headers).toHaveProperty('Access-Control-Max-Age');
  });

  it('sets Allow-Origin to matching origin', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    expect(getCorsHeaders(req)['Access-Control-Allow-Origin']).toBe('https://symy.ai');
  });

  it('sets Allow-Origin to empty for disallowed', () => {
    const req = makeRequest({ Origin: 'https://evil.com' });
    expect(getCorsHeaders(req)['Access-Control-Allow-Origin']).toBe('');
  });

  it('includes GET, POST, OPTIONS in Allow-Methods', () => {
    const req = makeRequest({});
    expect(getCorsHeaders(req)['Access-Control-Allow-Methods']).toContain('GET');
    expect(getCorsHeaders(req)['Access-Control-Allow-Methods']).toContain('POST');
    expect(getCorsHeaders(req)['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });

  it('includes Authorization and api-key in Allow-Headers', () => {
    const req = makeRequest({});
    expect(getCorsHeaders(req)['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(getCorsHeaders(req)['Access-Control-Allow-Headers']).toContain('api-key');
  });

  it('does NOT set Allow-Credentials (proxy uses header secret, not cookie)', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    expect(getCorsHeaders(req)).not.toHaveProperty('Access-Control-Allow-Credentials');
  });
});

describe('handleOptions', () => {
  it('returns 204 response', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    const response = handleOptions(req);
    expect(response.status).toBe(204);
  });

  it('returns CORS headers in response', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    const response = handleOptions(req);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://symy.ai');
  });

  it('returns null body', () => {
    const req = makeRequest({ Origin: 'https://symy.ai' });
    const response = handleOptions(req);
    expect(response.body).toBeNull();
  });
});
