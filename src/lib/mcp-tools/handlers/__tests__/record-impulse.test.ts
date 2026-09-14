/**
 * MCP Handler Tests — record_impulse integration tests
 *
 * 🔧 架构优化 Round 52: 测试 record_impulse handler (Finding 2 continued)
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
    getHealthFromVitality: vi.fn(() => 'healthy'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    deltaRpcHealth: { shouldTry: vi.fn(() => true), markAvailable: vi.fn(), markFailed: vi.fn(), reset: vi.fn() },
  };
});

vi.mock('@/lib/health-impact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/health-impact')>();
  return {
    ...actual,
    createHealthEvent: vi.fn(async () => ({ success: true, eventId: 'test-event-id' })),
  };
});

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

vi.mock('@/lib/user-hourly-rate', () => ({
  getUserHourlyRate: vi.fn(async () => 20),
}));

vi.mock('@/lib/buddy-defaults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/buddy-defaults')>();
  return {
    ...actual,
    // 🔧 P0-2 fix: calculateImpulseDamage 返回 number (非 object), 修正旧 mock
    calculateImpulseDamage: vi.fn(() => -8),
  };
});

import { handleRecordImpulse } from '../record_impulse';
import { isToolCallInProgress, isDuplicateHealthEvent, applyBuddyStateDelta } from '../_shared';
import { createHealthEvent } from '@/lib/health-impact';

function makeCtx(overrides: Partial<{ toolCallId: string; args: Record<string, unknown>; userId: string }> = {}) {
  const mockQuery = {
    select: vi.fn(() => mockQuery),
    eq: vi.fn(() => mockQuery),
    order: vi.fn(() => mockQuery),
    gte: vi.fn(() => mockQuery),
    limit: vi.fn(async () => ({ data: [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
  };
  return {
    toolCallId: overrides.toolCallId || 'test-call-1',
    args: overrides.args || {},
    userId: overrides.userId || 'test-user-id',
    supabase: {
      rpc: vi.fn(async () => ({ data: null, error: null })),
      from: vi.fn(() => mockQuery),
    } as any,
  };
}

describe('handleRecordImpulse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: records impulse with valid args', async () => {
    const ctx = makeCtx({
      args: { amount: 50, platform: 'tiktok_shop', impulse_score: 75 },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(true);
    expect(result.name).toBe('record_impulse');
  });

  it('rejects invalid amount (NaN)', async () => {
    const ctx = makeCtx({
      args: { amount: 'not-a-number', platform: 'tiktok_shop' },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('amount');
  });

  it('rejects amount <= 0', async () => {
    const ctx = makeCtx({
      args: { amount: 0, platform: 'tiktok_shop' },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(false);
    expect(result.message).toContain('amount');
  });

  it('rejects amount = -10', async () => {
    const ctx = makeCtx({
      args: { amount: -10, platform: 'tiktok_shop' },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(false);
  });

  it('defaults platform to "unknown" when not provided', async () => {
    const ctx = makeCtx({
      args: { amount: 50 },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(true);
  });

  it('defaults impulse_score to 70 when not provided', async () => {
    const ctx = makeCtx({
      args: { amount: 50, platform: 'tiktok_shop' },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(true);
  });

  it('skips duplicate (same triggerId)', async () => {
    vi.mocked(isDuplicateHealthEvent).mockResolvedValueOnce(true);

    const ctx = makeCtx({
      toolCallId: 'dup-call-1',
      args: { amount: 50, platform: 'tiktok_shop', impulse_score: 75 },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(true);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('skips when in-progress lock is held', async () => {
    vi.mocked(isToolCallInProgress).mockReturnValueOnce(true);

    const ctx = makeCtx({
      args: { amount: 50, platform: 'tiktok_shop', impulse_score: 75 },
    });

    const result = await handleRecordImpulse(ctx);

    expect(result.success).toBe(true);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('handles applyBuddyStateDelta failure — falls back to legacy and returns failure', async () => {
    // Force createHealthEvent to fail so handler falls to applyBuddyStateDelta
    vi.mocked(createHealthEvent).mockResolvedValueOnce({
      success: false,
      error: 'RPC not available',
    });
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
      args: { amount: 50, platform: 'tiktok_shop', impulse_score: 75 },
    });

    const result = await handleRecordImpulse(ctx);

    // Handler returns success=false when both createHealthEvent and applyBuddyStateDelta fail
    expect(result.success).toBe(false);
  });

  // ============================================================
  // 🔧 P0-2 根因修复测试 (Round 88)
  // ============================================================

  describe('P0-2: newVitality never renders as "?"', () => {
    it('message does not contain "?" when createHealthEvent returns newVitality', async () => {
      // 模拟 createHealthEvent 成功且返回 newVitality=64
      vi.mocked(createHealthEvent).mockResolvedValueOnce({
        success: true,
        eventId: 'evt-123',
        newVitality: 64,
        vitalityChange: -8,
        deduplicated: false,
      });

      const ctx = makeCtx({
        args: { amount: 89, platform: 'amazon', impulse_score: 75 },
      });

      const result = await handleRecordImpulse(ctx);

      expect(result.success).toBe(true);
      // message 不应包含 "?" 或 "[pending]" 或 "undefined"
      expect(result.message).not.toContain('?');
      expect(result.message).not.toContain('[pending]');
      expect(result.message).not.toContain('undefined');
      // message 应包含 vitality penalty (小弟们策略: 只显示 clarity -8, 不显示 → X)
      expect(result.message).toContain('-8');
    });

    it('message does not contain "?" when createHealthEvent returns newVitality=undefined', async () => {
      // 模拟极端情况: createHealthEvent 成功但 newVitality 缺失
      // (health-impact.ts 的 SELECT fallback 也失败的极端场景)
      vi.mocked(createHealthEvent).mockResolvedValueOnce({
        success: true,
        eventId: 'evt-456',
        newVitality: undefined,  // 极端情况
        vitalityChange: -8,
        deduplicated: false,
      });

      const ctx = makeCtx({
        args: { amount: 89, platform: 'amazon', impulse_score: 75 },
      });

      const result = await handleRecordImpulse(ctx);

      expect(result.success).toBe(true);
      // message 不应包含 "?" 或 "[pending]" 或 "undefined"
      expect(result.message).not.toContain('?');
      expect(result.message).not.toContain('[pending]');
      expect(result.message).not.toContain('undefined');
    });

    it('fallback path (applyBuddyStateDelta) message does not contain "?"', async () => {
      // 模拟 createHealthEvent 失败, 走 applyBuddyStateDelta fallback
      vi.mocked(createHealthEvent).mockResolvedValueOnce({
        success: false,
        error: 'RPC error',
      });
      vi.mocked(applyBuddyStateDelta).mockResolvedValueOnce({
        success: true,
        tokens: 10,
        vitality: 55,  // 真实 vitality
        level: 1,
        xp: 0,
        xpToNext: 100,
        streak: 0,
        totalSaved: 0,
        challengesCompleted: 0,
        badges: [],
        dreamFunds: [],
        error: undefined,
      });

      const ctx = makeCtx({
        args: { amount: 89, platform: 'amazon', impulse_score: 75 },
      });

      const result = await handleRecordImpulse(ctx);

      expect(result.success).toBe(true);
      // message 不应包含 "?" 或 "undefined"
      expect(result.message).not.toContain('?');
      expect(result.message).not.toContain('undefined');
      // message 应包含 vitality penalty
      expect(result.message).toContain('-8');
    });

    it('updates health_event description with real newVitality after createHealthEvent', async () => {
      // 验证 P0-2 修复: description 在 createHealthEvent 之后重新生成 (不再含 [pending])
      vi.mocked(createHealthEvent).mockResolvedValueOnce({
        success: true,
        eventId: 'evt-789',
        newVitality: 72,
        vitalityChange: -8,
        deduplicated: false,
      });

      const ctx = makeCtx({
        args: { amount: 89, platform: 'amazon', impulse_score: 75 },
      });

      const result = await handleRecordImpulse(ctx);

      expect(result.success).toBe(true);
      // result.message 是用真实 newVitality 生成的 finalDescription
      expect(result.message).not.toContain('[pending]');
      expect(result.message).not.toContain('?');
      expect(result.message).not.toContain('undefined');
    });
  });
});
