/**
 * Tests for distributed-lock.ts — acquireLock + releaseLock
 *
 * 🔧 ARCH fix (Round 73 ARCH-DEEP-73): 测试覆盖率 — distributed-lock 0 tests → 20+ tests
 *
 * Mock strategy:
 *   - vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
 *   - vi.resetModules() in beforeEach → resets distributed-lock's _adminClient cache
 *   - Re-import distributed-lock after resetModules → fresh module with fresh env reads
 *   - Configure mockedCreateClient.mockReturnValue(mockClient) per test
 *   - mockClient.from() returns chainable + thenable builder that resolves with configured result
 *
 * Test groups:
 *   1. acquireLock — with Supabase client (success / 23505 / DB error / fail-open / fail-closed)
 *   2. releaseLock — with token / without token / no-op
 *   3. env vars not set — fail-open / fail-closed / no-op
 *   4. ownership token — acquire stores token, release uses it
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock @supabase/supabase-js — createClient is vi.fn(), configured per test
// ============================================================
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

// Mock logger — suppress output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    critical: vi.fn(),
  },
}));

import { createClient } from '@supabase/supabase-js';
const mockedCreateClient = vi.mocked(createClient);

// ============================================================
// Helper: create a chainable + thenable mock query builder
// ============================================================
interface MockCall {
  method: string;
  args: unknown[];
}

interface MockBuilder {
  delete: (...args: unknown[]) => MockBuilder;
  insert: (...args: unknown[]) => MockBuilder;
  select: (...args: unknown[]) => MockBuilder;
  eq: (...args: unknown[]) => MockBuilder;
  lt: (...args: unknown[]) => MockBuilder;
  like: (...args: unknown[]) => MockBuilder;
  then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
  _calls: MockCall[];
}

function makeBuilder(result: { data: unknown; error: unknown }): MockBuilder {
  const calls: MockCall[] = [];
  const builder: MockBuilder = {
    delete: (...args: unknown[]) => { calls.push({ method: 'delete', args }); return builder; },
    insert: (...args: unknown[]) => { calls.push({ method: 'insert', args }); return builder; },
    select: (...args: unknown[]) => { calls.push({ method: 'select', args }); return builder; },
    eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return builder; },
    lt: (...args: unknown[]) => { calls.push({ method: 'lt', args }); return builder; },
    like: (...args: unknown[]) => { calls.push({ method: 'like', args }); return builder; },
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
    _calls: calls,
  };
  return builder;
}

/** Helper: extract method calls from a builder's _calls log */
function callsByMethod(builder: MockBuilder, method: string): MockCall[] {
  return builder._calls.filter(c => c.method === method);
}

// ============================================================
// Test group 1: acquireLock with Supabase client configured
// ============================================================

describe('distributed-lock — acquireLock (with Supabase client)', () => {
  let acquireLock: typeof import('@/lib/distributed-lock').acquireLock;
  let builders: MockBuilder[];
  let results: { data: unknown; error: unknown }[];
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    builders = [];
    results = [];
    mockFrom = vi.fn(() => {
      const result = results.shift() ?? { data: null, error: null };
      const b = makeBuilder(result);
      builders.push(b);
      return b;
    });

    // Set env vars so getAdminClient() returns the mock client
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    mockedCreateClient.mockReturnValue({
      from: mockFrom,
      rpc: vi.fn(),
      auth: {},
    } as unknown as ReturnType<typeof createClient>);

    // Reset module cache so distributed-lock re-evaluates (re-reads env, resets _adminClient)
    vi.resetModules();
    const mod = await import('@/lib/distributed-lock');
    acquireLock = mod.acquireLock;
  });

  it('returns true and stores ownership token when insert succeeds', async () => {
    // acquireLock flow: delete expired (ignored) + insert (success)
    results.push({ data: null, error: null }); // delete
    results.push({ data: null, error: null }); // insert

    const result = await acquireLock('scan:user-1', 60_000, true);
    expect(result).toBe(true);

    // Two queries: delete + insert
    expect(builders).toHaveLength(2);
    expect(builders[0]._calls[0].method).toBe('delete');
    expect(builders[1]._calls[0].method).toBe('insert');

    // Insert payload should contain ownershipToken
    const insertCall = builders[1]._calls.find(c => c.method === 'insert');
    expect(insertCall).toBeDefined();
    const insertPayload = insertCall!.args[0] as { value?: { ownershipToken?: string } };
    expect(insertPayload.value?.ownershipToken).toBeDefined();
    expect(typeof insertPayload.value?.ownershipToken).toBe('string');
  });

  it('returns true with default failClosed=false (fail-open default)', async () => {
    results.push({ data: null, error: null }); // delete
    results.push({ data: null, error: null }); // insert

    // No failClosed argument → defaults to false (fail-open)
    const result = await acquireLock('scan:user-1', 60_000);
    expect(result).toBe(true);
  });

  it('returns false when lock already held (23505 unique violation)', async () => {
    results.push({ data: null, error: null }); // delete
    results.push({ data: null, error: { code: '23505', message: 'duplicate key value' } }); // insert

    const result = await acquireLock('scan:user-1', 60_000, true);
    expect(result).toBe(false);
  });

  it('returns true (fail-open) on non-23505 DB error when failClosed=false', async () => {
    results.push({ data: null, error: null }); // delete
    results.push({ data: null, error: { code: 'XX000', message: 'connection lost' } }); // insert

    const result = await acquireLock('scan:user-1', 60_000, false);
    expect(result).toBe(true); // fail-open
  });

  it('returns false (fail-closed) on non-23505 DB error when failClosed=true', async () => {
    results.push({ data: null, error: null }); // delete
    results.push({ data: null, error: { code: 'XX000', message: 'connection lost' } }); // insert

    const result = await acquireLock('scan:user-1', 60_000, true);
    expect(result).toBe(false); // fail-closed
  });

  it('returns false on non-23505 error (fail-closed) with connection error code', async () => {
    results.push({ data: null, error: null }); // delete
    results.push({ data: null, error: { code: '08000', message: 'connection_exception' } }); // insert

    const result = await acquireLock('scan:user-1', 60_000, true);
    expect(result).toBe(false);
  });

  it('uses crypto.randomUUID() for ownership token (unique per acquire)', async () => {
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });

    // Acquire two different locks
    await acquireLock('lock-A', 1000, true);
    await acquireLock('lock-B', 1000, true);

    // Find both insert payloads (indexes 1 and 3)
    const insertA = builders[1]._calls.find(c => c.method === 'insert')!.args[0] as { value: { ownershipToken: string } };
    const insertB = builders[3]._calls.find(c => c.method === 'insert')!.args[0] as { value: { ownershipToken: string } };

    expect(insertA.value.ownershipToken).not.toBe(insertB.value.ownershipToken);
  });
});

// ============================================================
// Test group 2: releaseLock with Supabase client configured
// ============================================================

describe('distributed-lock — releaseLock (with Supabase client)', () => {
  let acquireLock: typeof import('@/lib/distributed-lock').acquireLock;
  let releaseLock: typeof import('@/lib/distributed-lock').releaseLock;
  let builders: MockBuilder[];
  let results: { data: unknown; error: unknown }[];
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    builders = [];
    results = [];
    mockFrom = vi.fn(() => {
      const result = results.shift() ?? { data: null, error: null };
      const b = makeBuilder(result);
      builders.push(b);
      return b;
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    mockedCreateClient.mockReturnValue({
      from: mockFrom,
      rpc: vi.fn(),
      auth: {},
    } as unknown as ReturnType<typeof createClient>);

    vi.resetModules();
    const mod = await import('@/lib/distributed-lock');
    acquireLock = mod.acquireLock;
    releaseLock = mod.releaseLock;
  });

  it('deletes lock with matching ownership token after acquire', async () => {
    // Acquire first (delete + insert)
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });
    await acquireLock('scan:user-1', 60_000, true);

    // Release (delete with token)
    results.push({ data: null, error: null });
    await releaseLock('scan:user-1');

    // Third builder is the release delete
    const releaseBuilder = builders[2];
    expect(releaseBuilder._calls[0].method).toBe('delete');

    // Should have eq('key', ...) and eq('value->>ownershipToken', token)
    const eqCalls = callsByMethod(releaseBuilder, 'eq');
    expect(eqCalls).toHaveLength(2);
    expect(eqCalls[0].args[0]).toBe('key');
    expect(eqCalls[1].args[0]).toBe('value->>ownershipToken');

    // The token should match the one from acquire
    const acquireInsert = builders[1]._calls.find(c => c.method === 'insert')!.args[0] as { value: { ownershipToken: string } };
    const releaseToken = eqCalls[1].args[1];
    expect(releaseToken).toBe(acquireInsert.value.ownershipToken);
  });

  it('deletes any lock (no token eq) when no prior acquire on this key', async () => {
    // Release without prior acquire — no token in lockOwnership Map
    results.push({ data: null, error: null });
    await releaseLock('scan:user-without-acquire');

    const releaseBuilder = builders[0];
    expect(releaseBuilder._calls[0].method).toBe('delete');

    // Should only have eq('key', ...), no token eq
    const eqCalls = callsByMethod(releaseBuilder, 'eq');
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0].args[0]).toBe('key');
  });

  it('passes explicit ownershipToken to delete filter (backward compat param)', async () => {
    results.push({ data: null, error: null });
    await releaseLock('scan:user-1', 'explicit-token-123');

    const releaseBuilder = builders[0];
    const eqCalls = callsByMethod(releaseBuilder, 'eq');
    expect(eqCalls).toHaveLength(2);
    expect(eqCalls[1].args[0]).toBe('value->>ownershipToken');
    expect(eqCalls[1].args[1]).toBe('explicit-token-123');
  });

  it('does not throw on DB error (non-critical)', async () => {
    results.push({ data: null, error: { code: 'XX000', message: 'fail' } });
    await expect(releaseLock('scan:user-1')).resolves.toBeUndefined();
  });

  it('releasing a key that was never acquired does not throw', async () => {
    results.push({ data: null, error: null });
    await expect(releaseLock('never-acquired-key')).resolves.toBeUndefined();
  });

  it('acquire → release → re-acquire works (token cleared after release)', async () => {
    // First acquire
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });
    await acquireLock('scan:user-1', 60_000, true);

    // Release
    results.push({ data: null, error: null });
    await releaseLock('scan:user-1');

    // Second acquire (should generate a new token)
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });
    const reAcquired = await acquireLock('scan:user-1', 60_000, true);
    expect(reAcquired).toBe(true);

    // Verify second release uses the NEW token (not the old one)
    results.push({ data: null, error: null });
    await releaseLock('scan:user-1');

    // builders: [0]acquire-delete [1]acquire-insert [2]release-delete [3]acquire2-delete [4]acquire2-insert [5]release2-delete
    const secondReleaseBuilder = builders[5];
    const secondReleaseEqCalls = callsByMethod(secondReleaseBuilder, 'eq');
    expect(secondReleaseEqCalls).toHaveLength(2);
    expect(secondReleaseEqCalls[0].args[0]).toBe('key');
    expect(secondReleaseEqCalls[1].args[0]).toBe('value->>ownershipToken');

    // Token should match second acquire's insert token
    const secondAcquireInsert = builders[4]._calls.find(c => c.method === 'insert')!.args[0] as { value: { ownershipToken: string } };
    expect(secondReleaseEqCalls[1].args[1]).toBe(secondAcquireInsert.value.ownershipToken);
  });
});

// ============================================================
// Test group 3: env vars not set — fail-open / fail-closed
// ============================================================

describe('distributed-lock — env vars not set (no Supabase client)', () => {
  let acquireLock: typeof import('@/lib/distributed-lock').acquireLock;
  let releaseLock: typeof import('@/lib/distributed-lock').releaseLock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Ensure env vars are NOT set
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    vi.resetModules();
    const mod = await import('@/lib/distributed-lock');
    acquireLock = mod.acquireLock;
    releaseLock = mod.releaseLock;
  });

  it('acquireLock fail-open: returns true when failClosed=false', async () => {
    expect(await acquireLock('test-key', 1000, false)).toBe(true);
  });

  it('acquireLock fail-open: returns true by default (failClosed defaults to false)', async () => {
    expect(await acquireLock('test-key', 1000)).toBe(true);
  });

  it('acquireLock fail-closed: returns false when failClosed=true', async () => {
    expect(await acquireLock('test-key', 1000, true)).toBe(false);
  });

  it('releaseLock is a no-op (does not throw, returns undefined)', async () => {
    await expect(releaseLock('test-key')).resolves.toBeUndefined();
  });

  it('releaseLock with explicit token is also a no-op when env not set', async () => {
    await expect(releaseLock('test-key', 'some-token')).resolves.toBeUndefined();
  });
});

// ============================================================
// Test group 4: ownership token semantics
// ============================================================

describe('distributed-lock — ownership token semantics', () => {
  let acquireLock: typeof import('@/lib/distributed-lock').acquireLock;
  let builders: MockBuilder[];
  let results: { data: unknown; error: unknown }[];
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    builders = [];
    results = [];
    mockFrom = vi.fn(() => {
      const result = results.shift() ?? { data: null, error: null };
      const b = makeBuilder(result);
      builders.push(b);
      return b;
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    mockedCreateClient.mockReturnValue({
      from: mockFrom,
      rpc: vi.fn(),
      auth: {},
    } as unknown as ReturnType<typeof createClient>);

    vi.resetModules();
    const mod = await import('@/lib/distributed-lock');
    acquireLock = mod.acquireLock;
  });

  it('ownership token is a UUID-format string', async () => {
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });

    await acquireLock('test-key', 1000, true);

    const insertCall = builders[1]._calls.find(c => c.method === 'insert');
    const payload = insertCall!.args[0] as { value: { ownershipToken: string } };
    // UUID format: 8-4-4-4-12 hex digits
    expect(payload.value.ownershipToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('insert payload includes key, value (with token + acquiredAt), and expires_at', async () => {
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });

    await acquireLock('test-key-xyz', 30_000, true);

    const insertCall = builders[1]._calls.find(c => c.method === 'insert');
    const payload = insertCall!.args[0] as {
      key: string;
      value: { ownershipToken: string; acquiredAt: string };
      expires_at: string;
    };
    expect(payload.key).toBe('test-key-xyz');
    expect(payload.value.acquiredAt).toBeDefined();
    expect(typeof payload.value.acquiredAt).toBe('string');
    expect(payload.expires_at).toBeDefined();
    expect(typeof payload.expires_at).toBe('string');
  });

  it('acquireLock delete query filters by key and expires_at < now', async () => {
    results.push({ data: null, error: null });
    results.push({ data: null, error: null });

    await acquireLock('test-key', 30_000, true);

    // First builder is the delete (gc expired)
    const deleteBuilder = builders[0];
    expect(deleteBuilder._calls[0].method).toBe('delete');

    const eqCalls = callsByMethod(deleteBuilder, 'eq');
    const ltCalls = callsByMethod(deleteBuilder, 'lt');

    // Should filter by key=... and expires_at < ...
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0].args[0]).toBe('key');
    expect(eqCalls[0].args[1]).toBe('test-key');

    expect(ltCalls).toHaveLength(1);
    expect(ltCalls[0].args[0]).toBe('expires_at');
  });
});
