/**
 * Env parsing + letta-agent-manager tests — Round 120 audit fix (AUDIT-4)
 *
 * 🔧 之前 letta-agent-manager.ts 0% test coverage
 * Round 120 audit fix: 提取 parseBooleanEnv 为可测试函数 + 测试 AGENT_ENABLE_SLEEPTIME 解析
 *
 * 🔧 2026-07-18 AUDIT-LETTA-AGENT-MGR P0-1 fix: added regression test for
 *    pool agent CAS race condition (orphan agent on concurrent assignment).
 *
 * 此测试覆盖:
 * - parseBooleanEnv 正确处理 truthy 字符串白名单
 * - parseBooleanEnv 正确拒绝 falsy 字符串 (旧 bug: 'False'/'0'/'' 错误判定为 true)
 * - 大小写不敏感
 * - trim 空白字符
 * - getOrCreateAgentId: CAS race condition (P0-1 fix)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseBooleanEnv, AGENT_ENABLE_SLEEPTIME } from '@/lib/letta-agent-manager';

describe('parseBooleanEnv', () => {
  describe('truthy values (returns true)', () => {
    it.each([
      'true', 'True', 'TRUE', 'tRuE',
      '1',
      'yes', 'Yes', 'YES',
      'on', 'On', 'ON',
      'y', 'Y',
      't', 'T',
    ])('returns true for %s', (value) => {
      expect(parseBooleanEnv(value)).toBe(true);
    });
  });

  describe('falsy values (returns false)', () => {
    it.each([
      'false', 'False', 'FALSE',
      '0', 'no', 'off', 'n', 'f',
      '', ' ', '  ',
      'undefined', 'null',
      'random', 'abc',
    ])('returns false for %s', (value) => {
      expect(parseBooleanEnv(value)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for undefined', () => {
      expect(parseBooleanEnv(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(parseBooleanEnv(null)).toBe(false);
    });

    it('trims whitespace before checking', () => {
      expect(parseBooleanEnv('  true  ')).toBe(true);
      expect(parseBooleanEnv('\ttrue\n')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(parseBooleanEnv('TRUE')).toBe(true);
      expect(parseBooleanEnv('True')).toBe(true);
      expect(parseBooleanEnv('tRuE')).toBe(true);
    });
  });

  describe('Round 120 audit fix regression tests', () => {
    // 🔧 These tests verify the specific bug fixed in Round 120:
    //    Old: (value || 'false') !== 'false'
    //    Bug: 'False' !== 'false' → true (wrong!)
    //         '0' || 'false' → '0' → '0' !== 'false' → true (wrong!)
    //         '' || 'false' → 'false' → !== 'false' → false (correct, by accident)

    it('regression: "False" returns false (old code returned true)', () => {
      expect(parseBooleanEnv('False')).toBe(false);
    });

    it('regression: "FALSE" returns false (old code returned true)', () => {
      expect(parseBooleanEnv('FALSE')).toBe(false);
    });

    it('regression: "0" returns false (old code returned true)', () => {
      expect(parseBooleanEnv('0')).toBe(false);
    });

    it('regression: empty string returns false (old code was correct here)', () => {
      expect(parseBooleanEnv('')).toBe(false);
    });

    it('regression: "true" returns true (sanity check)', () => {
      expect(parseBooleanEnv('true')).toBe(true);
    });
  });
});

describe('AGENT_ENABLE_SLEEPTIME', () => {
  it('is a boolean (not undefined or string)', () => {
    expect(typeof AGENT_ENABLE_SLEEPTIME).toBe('boolean');
  });

  it('defaults to false when env var not set (test environment)', () => {
    // In test env, LETTA_AGENT_ENABLE_SLEEPTIME is not set → should be false
    // (This matches production default — sleeptime disabled to prevent agent creation failure)
    expect(AGENT_ENABLE_SLEEPTIME).toBe(false);
  });
});

// ============================================================
// 🔧 2026-07-18 AUDIT-LETTA-AGENT-MGR P0-1 fix: CAS race condition
// ============================================================

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/letta-agent-pool', () => ({
  assignAgentFromPool: vi.fn(),
}));

vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: vi.fn(() => Promise.resolve(true)),
  releaseLock: vi.fn(() => Promise.resolve(undefined)),
}));

// 🔧 ARCH: mock createAdminClient to return our mock supabase
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: null, error: null })),
}));

// 🔧 ARCH: mock letta-mcp-manager to avoid network calls during test
vi.mock('@/lib/letta-mcp-manager', () => ({
  getLettaClient: vi.fn(),
  getOrCreateSharedMCPServer: vi.fn(() => Promise.resolve('mcp-server-id')),
  getMCPTools: vi.fn(() => Promise.resolve([])),
  lettaAPI: vi.fn(),
}));

// eslint-disable-next-line no-duplicate-imports -- re-importing getOrCreateAgentId for the CAS test
import { getOrCreateAgentId } from '@/lib/letta-agent-manager';
import { assignAgentFromPool } from '@/lib/letta-agent-pool';
import { createAdminClient } from '@/lib/supabase-admin';

describe('🔧 P0-1 fix (2026-07-18): getOrCreateAgentId CAS race condition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the winning agent_id when CAS loses (no orphan agent)', async () => {
    // 🔧 P0-1 fix scenario:
    //   1. Request A: profile.letta_agent_id = null → assignAgentFromPool returns 'agent-A'
    //      → UPDATE .is(letta_agent_id, null) succeeds → returns 'agent-A' ✓
    //   2. Request B (concurrent): profile.letta_agent_id = null (stale read) →
    //      assignAgentFromPool returns 'agent-B' → UPDATE .is(letta_agent_id, null)
    //      returns 0 rows (A already set it) → OLD code returns 'agent-B' (ORPHAN!)
    //      NEW code re-reads profile → returns 'agent-A' (the winner) ✓

    // 🔧 ARCH: use module-level counter so all mockFrom() calls share state.
    //    The function calls from() multiple times:
    //      call 1: initial profile read (select.eq.maybeSingle → null)
    //      call 2: UPDATE (update.eq.is.select → 0 rows = CAS lost)
    //      call 3: re-read profile (select.eq.maybeSingle → winner's agent_id)
    let selectCallCount = 0;
    const mockFrom = vi.fn(() => ({
      select: vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Initial profile read — returns null (no agent yet)
          return {
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { letta_agent_id: null },
                error: null,
              })),
            })),
          };
        }
        // selectCallCount === 2: re-read after CAS lost — returns winner's agent_id
        return {
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { letta_agent_id: 'agent-A-winner' },
              error: null,
            })),
          })),
        };
      }),
      // UPDATE chain: update().eq().is().select() → returns {data: [], error: null}
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })), // 0 rows = CAS lost
          })),
        })),
      })),
    }));

    vi.mocked(assignAgentFromPool).mockResolvedValue('agent-B-loser');
    vi.mocked(createAdminClient).mockReturnValue({
      supabase: { from: mockFrom } as never,
      error: null,
    } as never);

    // 🔧 P0-3 fix (2026-07-18): use valid UUID format (was 'user-123')
    //    validateUserId now rejects non-UUID strings.
    const VALID_USER_UUID = '11111111-2222-3333-4444-555555555555';
    const result = await getOrCreateAgentId(VALID_USER_UUID, 'user@example.com');

    // 🔧 P0-1 fix: should return the WINNER's agent_id, not the loser's
    expect(result).toBe('agent-A-winner');
    expect(result).not.toBe('agent-B-loser');
  });

  // 🔧 P0-3 fix (2026-07-18): input validation tests
  it('🔧 P0-3 fix: returns null for invalid userId (not UUID)', async () => {
    const result = await getOrCreateAgentId('not-a-uuid', 'user@example.com');
    expect(result).toBe(null);
  });

  it('🔧 P0-3 fix: returns null for empty userId', async () => {
    const result = await getOrCreateAgentId('', 'user@example.com');
    expect(result).toBe(null);
  });

  it('🔧 P0-3 fix: returns null for undefined userId', async () => {
    const result = await getOrCreateAgentId(undefined as unknown as string, 'user@example.com');
    expect(result).toBe(null);
  });
});
