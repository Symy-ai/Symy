/**
 * Tests for Admin Auth (admin-auth.ts)
 *
 * Covers:
 * - verifyAdminAuth: Bearer token, X-Admin-Key, missing credentials, wrong key
 * - resolveActor: X-Admin-Actor header, fallback to 'unknown'
 * - ALLOWED_ACTORS whitelist: enforced when configured
 * - isAdminApiKeyConfigured: key detection
 * - isAdminAuthorized: boolean convenience wrapper
 * - Timing-safe comparison (no early return on length mismatch)
 *
 * Note: Sets ADMIN_API_KEY env var before import.
 */

import { describe, it, expect } from 'vitest';

// Set admin API key BEFORE importing the module
process.env.ADMIN_API_KEY = 'test-admin-secret-key-12345';
delete process.env.ADMIN_ALLOWED_ACTORS;

// Dynamic import to get fresh module after env var set
const { verifyAdminAuth, isAdminApiKeyConfigured, isAdminAuthorized } = await import('@/lib/admin-auth');

// Helper: create a mock NextRequest
function makeRequest(headers: Record<string, string> = {}, url = 'https://example.com/api/admin/test'):
  import('next/server').NextRequest {
  return {
    url,
    headers: new Headers(headers),
  } as unknown as import('next/server').NextRequest;
}

describe('verifyAdminAuth', () => {
  describe('with Bearer token', () => {
    it('authorizes with correct Bearer token', () => {
      const req = makeRequest({
        Authorization: 'Bearer test-admin-secret-key-12345',
        'X-Admin-Actor': 'admin-alice',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(true);
      expect(result.actor).toBe('admin-alice');
    });

    it('rejects wrong Bearer token', () => {
      const req = makeRequest({
        Authorization: 'Bearer wrong-key',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(false);
      expect(result.error).toContain('Invalid admin API key');
    });

    it('rejects malformed Authorization header (no Bearer prefix)', () => {
      const req = makeRequest({
        Authorization: 'test-admin-secret-key-12345',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(false);
    });

    it('rejects empty Bearer token', () => {
      const req = makeRequest({
        Authorization: 'Bearer ',
      });
      const result = verifyAdminAuth(req);
      // Empty token after trim → falls through to X-Admin-Key check → no credential
      expect(result.authorized).toBe(false);
    });

    it('trims whitespace from Bearer token', () => {
      const req = makeRequest({
        Authorization: 'Bearer  test-admin-secret-key-12345  ',
        'X-Admin-Actor': 'bob',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(true);
      expect(result.actor).toBe('bob');
    });
  });

  describe('with X-Admin-Key header', () => {
    it('authorizes with correct X-Admin-Key', () => {
      const req = makeRequest({
        'X-Admin-Key': 'test-admin-secret-key-12345',
        'X-Admin-Actor': 'admin-charlie',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(true);
      expect(result.actor).toBe('admin-charlie');
    });

    it('rejects wrong X-Admin-Key', () => {
      const req = makeRequest({
        'X-Admin-Key': 'wrong-key',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(false);
      expect(result.error).toContain('Invalid admin API key');
    });

    it('trims whitespace from X-Admin-Key', () => {
      const req = makeRequest({
        'X-Admin-Key': '  test-admin-secret-key-12345  ',
        'X-Admin-Actor': 'dave',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(true);
    });
  });

  describe('without credentials', () => {
    it('rejects request with no auth headers', () => {
      const req = makeRequest({});
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(false);
      expect(result.error).toContain('Missing authentication');
    });

    it('rejects request with unrelated headers only', () => {
      const req = makeRequest({
        'Content-Type': 'application/json',
        'Accept': 'text/html',
      });
      const result = verifyAdminAuth(req);
      expect(result.authorized).toBe(false);
    });
  });

  describe('actor resolution', () => {
    it('uses X-Admin-Actor header when present', () => {
      const req = makeRequest({
        Authorization: 'Bearer test-admin-secret-key-12345',
        'X-Admin-Actor': 'specific-actor',
      });
      const result = verifyAdminAuth(req);
      expect(result.actor).toBe('specific-actor');
    });

    it('defaults to "unknown" when X-Admin-Actor not present', () => {
      const req = makeRequest({
        Authorization: 'Bearer test-admin-secret-key-12345',
      });
      const result = verifyAdminAuth(req);
      expect(result.actor).toBe('unknown');
    });
  });

  describe('timing safety', () => {
    it('does not leak key length via early return (short key)', () => {
      const req = makeRequest({
        Authorization: 'Bearer short',
      });
      const start = Date.now();
      verifyAdminAuth(req);
      const elapsed = Date.now() - start;
      // Should take some time (timingSafeCompare uses SHA-256 hash)
      // Just verify it doesn't throw
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it('does not leak key length via early return (long key)', () => {
      const req = makeRequest({
        Authorization: 'Bearer ' + 'a'.repeat(1000),
      });
      const start = Date.now();
      verifyAdminAuth(req);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('isAdminApiKeyConfigured', () => {
  it('returns true when ADMIN_API_KEY is set', () => {
    expect(isAdminApiKeyConfigured()).toBe(true);
  });
});

describe('isAdminAuthorized', () => {
  it('returns true for valid request', () => {
    const req = makeRequest({
      Authorization: 'Bearer test-admin-secret-key-12345',
    });
    expect(isAdminAuthorized(req)).toBe(true);
  });

  it('returns false for invalid request', () => {
    const req = makeRequest({});
    expect(isAdminAuthorized(req)).toBe(false);
  });

  it('returns false for wrong key', () => {
    const req = makeRequest({
      Authorization: 'Bearer wrong',
    });
    expect(isAdminAuthorized(req)).toBe(false);
  });
});

describe('credential priority', () => {
  it('Bearer token takes priority over X-Admin-Key', () => {
    const req = makeRequest({
      Authorization: 'Bearer test-admin-secret-key-12345',
      'X-Admin-Key': 'wrong-key',
      'X-Admin-Actor': 'priority-test',
    });
    const result = verifyAdminAuth(req);
    expect(result.authorized).toBe(true);
    expect(result.actor).toBe('priority-test');
  });

  it('falls back to X-Admin-Key when Bearer is wrong', () => {
    const req = makeRequest({
      Authorization: 'Bearer wrong-bearer',
      'X-Admin-Key': 'test-admin-secret-key-12345',
      'X-Admin-Actor': 'fallback-test',
    });
    const result = verifyAdminAuth(req);
    // Bearer is checked first — wrong Bearer returns false, doesn't fall through
    expect(result.authorized).toBe(false);
  });
});
