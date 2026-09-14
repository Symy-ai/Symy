/**
 * Tests for supabase-admin.ts — getSupabaseAdminDiagnostics (pure function)
 *
 * 🔧 ARCH fix (Round 75 ARCH-DEEP-75): 测试覆盖率 — supabase-admin.ts 0 tests → +N tests
 *
 * Scope: ONLY getSupabaseAdminDiagnostics (pure — reads env vars, returns object).
 *
 * Skipped (require Supabase client init / network):
 *   - createAdminClient (calls createClient<Database>)
 *
 * Implementation note: SUPABASE_URL and SUPABASE_SECRET_KEY are read at module
 * load time (top-level const). To test different env configurations, we use
 * vi.resetModules() + dynamic import() after setting env vars.
 *
 * Test matrix:
 *   - urlSet: true / false (NEXT_PUBLIC_SUPABASE_URL)
 *   - keySet: true / false
 *   - keyFormat: 'none' / 'legacy' (eyJ...) / 'new' (sb_secret_...)
 *   - Precedence: SUPABASE_SERVICE_ROLE_KEY takes priority over SUPABASE_SECRET_KEY
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Original env vars (restored in afterEach)
const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORIG_SECRET = process.env.SUPABASE_SECRET_KEY;

/** Helper: dynamically import supabase-admin after setting env vars + resetModules. */
async function importDiagnostics() {
  vi.resetModules();
  const mod = await import('@/lib/supabase-admin');
  return mod.getSupabaseAdminDiagnostics();
}

/** Helper: clear all Supabase env vars. */
function clearEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
}

describe('getSupabaseAdminDiagnostics', () => {
  beforeEach(() => {
    // Clear env before each test — each test sets its own env
    clearEnv();
  });

  afterEach(() => {
    // Restore original env
    clearEnv();
    if (ORIG_URL !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
    if (ORIG_SERVICE_ROLE !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG_SERVICE_ROLE;
    if (ORIG_SECRET !== undefined) process.env.SUPABASE_SECRET_KEY = ORIG_SECRET;
    vi.resetModules();
  });

  // ---------------------------------------------------------------
  // Scenario 1: nothing configured
  // ---------------------------------------------------------------
  it('returns urlSet=false, keySet=false, keyFormat=none when no env vars set', async () => {
    const diag = await importDiagnostics();
    expect(diag).toEqual({
      urlSet: false,
      keySet: false,
      keyFormat: 'none',
    });
  });

  // ---------------------------------------------------------------
  // Scenario 2: URL set but no key
  // ---------------------------------------------------------------
  it('returns urlSet=true, keySet=false, keyFormat=none when only URL set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const diag = await importDiagnostics();
    expect(diag).toEqual({
      urlSet: true,
      keySet: false,
      keyFormat: 'none',
    });
  });

  // ---------------------------------------------------------------
  // Scenario 3: New-style Secret Key (sb_secret_...)
  // ---------------------------------------------------------------
  it('returns keyFormat=new for SUPABASE_SERVICE_ROLE_KEY starting with sb_secret_', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_abc123xyz';
    const diag = await importDiagnostics();
    expect(diag).toEqual({
      urlSet: true,
      keySet: true,
      keyFormat: 'new',
    });
  });

  it('returns keyFormat=new when only SUPABASE_SECRET_KEY is set (with sb_secret_ prefix)', async () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fallback_value';
    const diag = await importDiagnostics();
    expect(diag).toEqual({
      urlSet: false,
      keySet: true,
      keyFormat: 'new',
    });
  });

  // ---------------------------------------------------------------
  // Scenario 4: Legacy Service Role Key (eyJ... JWT format)
  // ---------------------------------------------------------------
  it('returns keyFormat=legacy for SUPABASE_SERVICE_ROLE_KEY starting with eyJ (JWT)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const diag = await importDiagnostics();
    expect(diag).toEqual({
      urlSet: true,
      keySet: true,
      keyFormat: 'legacy',
    });
  });

  it('returns keyFormat=legacy for any key NOT starting with sb_secret_ (non-empty)', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'random-other-format-key';
    const diag = await importDiagnostics();
    expect(diag.keyFormat).toBe('legacy');
    expect(diag.keySet).toBe(true);
  });

  // ---------------------------------------------------------------
  // Scenario 5: Precedence — SUPABASE_SERVICE_ROLE_KEY > SUPABASE_SECRET_KEY
  // ---------------------------------------------------------------
  it('prefers SUPABASE_SERVICE_ROLE_KEY over SUPABASE_SECRET_KEY (both set)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_preferred';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fallback_ignored';
    const diag = await importDiagnostics();
    // SERVICE_ROLE_KEY takes priority → its format is reported
    expect(diag.keyFormat).toBe('new');
    expect(diag.keySet).toBe(true);
  });

  it('falls back to SUPABASE_SECRET_KEY when SERVICE_ROLE_KEY is not set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    // Only set SUPABASE_SECRET_KEY (fallback var name)
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fallback_active';
    const diag = await importDiagnostics();
    expect(diag.keySet).toBe(true);
    expect(diag.keyFormat).toBe('new');
  });

  // ---------------------------------------------------------------
  // Scenario 6: Empty string env vars (treated as not set)
  // ---------------------------------------------------------------
  it('treats empty string URL as urlSet=false', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_xxx';
    const diag = await importDiagnostics();
    expect(diag.urlSet).toBe(false);
    expect(diag.keySet).toBe(true);
  });

  it('treats empty string key as keySet=false + keyFormat=none', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    const diag = await importDiagnostics();
    expect(diag.urlSet).toBe(true);
    expect(diag.keySet).toBe(false);
    expect(diag.keyFormat).toBe('none');
  });

  // ---------------------------------------------------------------
  // Scenario 7: Return type / shape
  // ---------------------------------------------------------------
  it('returns an object with exactly 3 keys: urlSet, keySet, keyFormat', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_xxx';
    const diag = await importDiagnostics();
    expect(Object.keys(diag).sort()).toEqual(['keyFormat', 'keySet', 'urlSet']);
  });

  it('returns boolean values for urlSet and keySet', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_xxx';
    const diag = await importDiagnostics();
    expect(typeof diag.urlSet).toBe('boolean');
    expect(typeof diag.keySet).toBe('boolean');
  });

  it('returns a string for keyFormat', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_xxx';
    const diag = await importDiagnostics();
    expect(typeof diag.keyFormat).toBe('string');
  });

  it('keyFormat is always one of: none | legacy | new', async () => {
    // Test all three states
    const cases = [
      { env: {}, expected: 'none' as const },
      { env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_xyz' }, expected: 'new' as const },
      { env: { SUPABASE_SERVICE_ROLE_KEY: 'eyJlegacy' }, expected: 'legacy' as const },
    ];
    for (const { env, expected } of cases) {
      clearEnv();
      Object.assign(process.env, env);
      const diag = await importDiagnostics();
      expect(diag.keyFormat).toBe(expected);
      expect(['none', 'legacy', 'new']).toContain(diag.keyFormat);
    }
  });

  // ---------------------------------------------------------------
  // Scenario 8: Boundary — key starts with sb_secret_ but is exactly that (no payload)
  // ---------------------------------------------------------------
  it('classifies "sb_secret_" (exactly) as new format', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_';
    const diag = await importDiagnostics();
    expect(diag.keyFormat).toBe('new');
    expect(diag.keySet).toBe(true); // non-empty string → truthy
  });

  it('classifies "sb_secret" (no trailing underscore) as legacy (not new format)', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret';
    const diag = await importDiagnostics();
    expect(diag.keyFormat).toBe('legacy');
  });

  it('classifies "sb_secret_X" (any suffix) as new format', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_X';
    const diag = await importDiagnostics();
    expect(diag.keyFormat).toBe('new');
  });
});
