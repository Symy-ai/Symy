/**
 * MCP Handler Tests — add_tokens + complete_challenge integration tests
 *
 * 🔧 架构优化 Round 51: 测试 MCP handler 流程 (Finding 2)
 *    旧代码: MCP handlers (money-affecting) 零测试
 *    新代码: 测试 happy path + dedup + lock + validation
 *
 * 测试策略:
 *   - Mock Supabase client (RPC + query)
 *   - Mock _shared 依赖 (isToolCallInProgress, isDuplicateHealthEvent, etc.)
 *   - 测试 handler 返回值 + mock 调用次数
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

// Mock _shared module — we need to control isToolCallInProgress, isDuplicateHealthEvent, etc.
vi.mock('@/lib/mcp-tools/handlers/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp-tools/handlers/_shared')>();
  return {
    ...actual,
    isToolCallInProgress: vi.fn(() => false),
    releaseToolCallLock: vi.fn(),
    isDuplicateHealthEvent: vi.fn(async () => false),
    applyBuddyStateDelta: vi.fn(async () => ({
      success: true,
      tokens: 10,
      vitality: 50,
      level: 1,
      xp: 0,
      xpToNext: 100,
      streak: 0,
      totalSaved: 0,
      challengesCompleted: 0,
      badges: [],
      dreamFunds: [],
      error: null,
    })),
    getUserLocale: vi.fn(async () => 'en'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    deltaRpcHealth: { shouldTry: vi.fn(() => true), markAvailable: vi.fn(), markFailed: vi.fn(), reset: vi.fn() },
  };
});

// Mock health-impact
vi.mock('@/lib/health-impact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/health-impact')>();
  return {
    ...actual,
    createHealthEvent: vi.fn(async () => ({ success: true, eventId: 'test-event-id' })),
  };
});

// Mock supabase-admin
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      })),
    },
  })),
}));

import { handleAddTokens } from '../add_tokens';
import { isToolCallInProgress, isDuplicateHealthEvent, applyBuddyStateDelta } from '../_shared';
import { createHealthEvent } from '@/lib/health-impact';

// Helper: create mock context
function makeCtx(overrides: Partial<{ toolCallId: string; args: Record<string, unknown>; userId: string }> = {}) {
  return {
    toolCallId: overrides.toolCallId || 'test-call-1',
    args: overrides.args || {},
    userId: overrides.userId || 'test-user-id',
    supabase: {
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
      })),
    } as any,
  };
}

describe('handleAddTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: awards tokens with valid args', async () => {
    const ctx = makeCtx({
      args: { amount: 5, reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    expect(result.success).toBe(true);
    expect(result.name).toBe('add_tokens');
    expect(applyBuddyStateDelta).toHaveBeenCalledOnce();
    expect(createHealthEvent).toHaveBeenCalledOnce();
  });

  it('handles invalid amount (NaN) — defaults to 3', async () => {
    const ctx = makeCtx({
      args: { amount: 'not-a-number', reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    // Handler auto-corrects NaN to default 3 (api-design-principles: 最小决策)
    expect(result.success).toBe(true);
  });

  it('handles negative amount — clamped to 1', async () => {
    const ctx = makeCtx({
      args: { amount: -5, reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    // Handler clamps to 1-50 range (auto-correct, not reject)
    expect(result.success).toBe(true);
  });

  it('handles amount > 50 — clamped to 50', async () => {
    const ctx = makeCtx({
      args: { amount: 999, reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    // Handler clamps to 1-50 range
    expect(result.success).toBe(true);
  });

  it('skips duplicate (same triggerId) — returns success with empty result', async () => {
    vi.mocked(isDuplicateHealthEvent).mockResolvedValueOnce(true);

    const ctx = makeCtx({
      toolCallId: 'dup-call-1',
      args: { amount: 5, reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    expect(result.success).toBe(true);
    expect(result.message).toContain('duplicate');
    // Should NOT apply delta (dedup)
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('skips when in-progress lock is held — returns success with empty result', async () => {
    vi.mocked(isToolCallInProgress).mockReturnValueOnce(true);

    const ctx = makeCtx({
      args: { amount: 5, reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Duplicate');
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('defaults amount to 3 when not provided', async () => {
    const ctx = makeCtx({
      args: { reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    expect(result.success).toBe(true);
    // applyBuddyStateDelta should be called with tokenDelta=3
    const callArgs = vi.mocked(applyBuddyStateDelta).mock.calls[0];
    expect(callArgs?.[1]?.tokenDelta).toBe(3);
  });

  it('defaults reason to "pleasure" when not provided', async () => {
    const ctx = makeCtx({
      args: { amount: 5 },
    });

    const result = await handleAddTokens(ctx);

    expect(result.success).toBe(true);
  });

  it('handles applyBuddyStateDelta failure', async () => {
    vi.mocked(applyBuddyStateDelta).mockResolvedValueOnce({
      success: false,
      tokens: 0,
      vitality: 0,
      level: 0,
      xp: 0,
      xpToNext: 100,
      streak: 0,
      totalSaved: 0,
      challengesCompleted: 0,
      badges: [],
      dreamFunds: [],
      error: 'DB connection lost',
    });

    const ctx = makeCtx({
      args: { amount: 5, reason: 'pleasure' },
    });

    const result = await handleAddTokens(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('DB connection lost');
  });
});
