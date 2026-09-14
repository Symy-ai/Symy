/**
 * MCP Handler Tests — add_vitality + add_badge (Finding 2 completion)
 *
 * 🔧 架构优化 Round 56: 完成 MCP handler 测试覆盖
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/mcp-tools/handlers/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp-tools/handlers/_shared')>();
  return {
    ...actual,
    isToolCallInProgress: vi.fn(() => false),
    releaseToolCallLock: vi.fn(),
    isDuplicateHealthEvent: vi.fn(async () => false),
    applyBuddyStateDelta: vi.fn(async () => ({
      success: true, tokens: 10, vitality: 50, level: 1, xp: 0, xpToNext: 100,
      streak: 0, totalSaved: 0, challengesCompleted: 0, badges: ['first_sight'], dreamFunds: [], error: null,
    })),
    getBuddyStateForRead: vi.fn(async () => ({ badges: [], vitality: 50, tokens: 10, level: 1 })),
    getUserLocale: vi.fn(async () => 'en'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    deltaRpcHealth: { shouldTry: vi.fn(() => true), markAvailable: vi.fn(), markFailed: vi.fn(), reset: vi.fn() },
  };
});

vi.mock('@/lib/health-impact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/health-impact')>();
  return { ...actual, createHealthEvent: vi.fn(async () => ({ success: true, eventId: 'test-event-id' })) };
});

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
        insert: vi.fn(async () => ({ error: null })),
      })),
    },
  })),
}));

import { handleAddVitality } from '../add_vitality';
import { handleAddBadge } from '../add_badge';
import { isToolCallInProgress, applyBuddyStateDelta } from '../_shared';

function makeCtx(args: Record<string, unknown> = {}, toolCallId = 'test-call-1') {
  return { toolCallId, args, userId: 'test-user-id', supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) } as any };
}

describe('handleAddVitality', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path: adjusts vitality with valid args', async () => {
    const result = await handleAddVitality(makeCtx({ amount: 5 }));
    expect(result.success).toBe(true);
    expect(applyBuddyStateDelta).toHaveBeenCalledOnce();
  });

  it('handles negative amount (damage)', async () => {
    const result = await handleAddVitality(makeCtx({ amount: -10 }));
    expect(result.success).toBe(true);
  });

  it('defaults amount to 0 when not provided', async () => {
    const result = await handleAddVitality(makeCtx({}));
    expect(result.success).toBe(true);
  });

  it('skips duplicate', async () => {
    vi.mocked(isToolCallInProgress).mockReturnValueOnce(true);
    const result = await handleAddVitality(makeCtx({ amount: 5 }));
    expect(result.success).toBe(true);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });
});

describe('handleAddBadge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path: awards badge with valid badge_id', async () => {
    const result = await handleAddBadge(makeCtx({ badge_id: 'first_sight' }));
    expect(result.success).toBe(true);
    expect(applyBuddyStateDelta).toHaveBeenCalledOnce();
  });

  it('handles missing badge_id — defaults to empty string (auto-correct)', async () => {
    const result = await handleAddBadge(makeCtx({}));
    // Handler auto-corrects missing badge_id to '' (api-design-principles: 最小决策)
    expect(result.success).toBe(true);
  });

  it('handles empty badge_id — proceeds with empty string (auto-correct)', async () => {
    const result = await handleAddBadge(makeCtx({ badge_id: '' }));
    // Handler accepts empty badge_id (auto-correct, not reject)
    expect(result.success).toBe(true);
  });

  it('skips duplicate', async () => {
    vi.mocked(isToolCallInProgress).mockReturnValueOnce(true);
    const result = await handleAddBadge(makeCtx({ badge_id: 'first_sight' }));
    expect(result.success).toBe(true);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });
});
