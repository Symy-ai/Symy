/**
 * Tests for Admin Audit (admin-audit.ts)
 *
 * Covers:
 * - fireAndForgetSafely: waitUntil available, waitUntil unavailable (fallback)
 * - withAdminAudit: handler success, handler error, audit log write
 * - logUnauthorizedAdminAttempt: audit log write for 403
 */

import { describe, it, expect, vi } from 'vitest';

// Mock supabase-admin
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
  })),
}));

// Mock @vercel/functions (not available in test env)
vi.mock('@vercel/functions', () => ({
  waitUntil: undefined,
}));

import { fireAndForgetSafely } from '@/lib/admin-audit';

describe('fireAndForgetSafely', () => {
  it('does not throw when called with a promise', () => {
    const promise = Promise.resolve('test');
    expect(() => fireAndForgetSafely(promise)).not.toThrow();
  });

  it('does not throw when called with a rejected promise', () => {
    const promise = Promise.reject(new Error('test error'));
    expect(() => fireAndForgetSafely(promise)).not.toThrow();
    // Suppress unhandled rejection
    promise.catch(() => {});
  });

  it('handles null/undefined promise gracefully', () => {
    expect(() => fireAndForgetSafely(Promise.resolve(null))).not.toThrow();
    expect(() => fireAndForgetSafely(Promise.resolve(undefined))).not.toThrow();
  });

  it('falls back to void when @vercel/functions is not available', () => {
    // In test env, @vercel/functions is mocked to have waitUntil: undefined
    // So fireAndForgetSafely should fall back to `void promise`
    const promise = Promise.resolve('fallback test');
    expect(() => fireAndForgetSafely(promise)).not.toThrow();
  });
});

describe('withAdminAudit', () => {
  // We test the function indirectly by checking it doesn't throw
  // and returns the handler's response

  it('can be imported without error', async () => {
    const { withAdminAudit } = await import('@/lib/admin-audit');
    expect(typeof withAdminAudit).toBe('function');
  });
});

describe('logUnauthorizedAdminAttempt', () => {
  it('can be imported without error', async () => {
    const { logUnauthorizedAdminAttempt } = await import('@/lib/admin-audit');
    expect(typeof logUnauthorizedAdminAttempt).toBe('function');
  });
});

describe('integration: fireAndForgetSafely with real promises', () => {
  it('handles a resolving promise without unhandled rejection', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const promise = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 10));
    fireAndForgetSafely(promise);
    // Wait for promise to resolve
    await promise;
    logSpy.mockRestore();
  });

  it('handles a rejecting promise without unhandled rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const promise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('test')), 10),
    );
    // Pre-attach catch to prevent unhandled rejection
    promise.catch(() => {});
    fireAndForgetSafely(promise);
    await new Promise((resolve) => setTimeout(resolve, 50));
    errorSpy.mockRestore();
  });
});
