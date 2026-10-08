import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_shared')>();
  return {
    ...actual,
    isToolCallInProgress: vi.fn(() => false),
    releaseToolCallLock: vi.fn(),
    isDuplicateHealthEvent: vi.fn(() => Promise.resolve(false)),
    getBuddyStateForRead: vi.fn(() => Promise.resolve(null)),
    applyBuddyStateDelta: vi.fn(() => Promise.resolve({ success: true, badges: [], error: null })),
    getUserLocale: vi.fn(() => Promise.resolve('en')),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock('@/lib/health-impact', () => ({
  createHealthEvent: vi.fn(() => Promise.resolve({ success: true, eventId: 'e1' })),
}));
vi.mock('../descriptions', () => ({
  badgeUnlockedDesc: (locale: string, name: string) => `[${locale}] badge: ${name}`,
}));

import { handleAddBadge } from '../add_badge';
import {
  applyBuddyStateDelta,
  getBuddyStateForRead,
  isDuplicateHealthEvent,
  isToolCallInProgress,
} from '../_shared';
import { createHealthEvent } from '@/lib/health-impact';

const mockDelta = vi.mocked(applyBuddyStateDelta);
const mockRead = vi.mocked(getBuddyStateForRead);
const mockDup = vi.mocked(isDuplicateHealthEvent);
const mockLock = vi.mocked(isToolCallInProgress);
const mockHealth = vi.mocked(createHealthEvent);

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    toolCallId: 'tc-1',
    args: { badge_id: 'streak_7' },
    userId: 'u1',
    supabase: {},
    ...overrides,
  } as never;
}

/**
 * add_badge.ts (132行) — 徽章授予 handler (Round 11 C3 三层幂等补齐件)。
 *
 * 锁定:
 * - 已拥有 → success + alreadyHad (delta 零调用)
 * - 内存锁命中 → duplicate in-progress
 * - DB 去重 → alreadyAwarded
 * - 新授予: delta addBadges + 审计 triggerId=ab:{userId}:{badge}:{小时桶}
 * - delta 失败 → success=false
 * - 审计失败 → auditLogged=false (非关键)
 * - badgeNames 六映射 + 未知 id 原样
 */
describe('handleAddBadge 三层幂等', () => {
  beforeEach(() => vi.clearAllMocks());

  it('已拥有 → alreadyHad=true, 零 delta 零审计', async () => {
    mockRead.mockResolvedValueOnce({ badges: ['streak_7'] } as never);
    const res = await handleAddBadge(makeCtx());
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ alreadyHad: true, badgeName: '7-Day Streak' });
    expect(mockDelta).not.toHaveBeenCalled();
    expect(mockHealth).not.toHaveBeenCalled();
  });

  it('内存锁命中 → duplicate in-progress', async () => {
    mockLock.mockReturnValueOnce(true);
    const res = await handleAddBadge(makeCtx());
    expect(res.success).toBe(true);
    expect(res.message).toContain('Duplicate request');
    expect(mockDelta).not.toHaveBeenCalled();
  });

  it('DB 去重 → alreadyAwarded (Round 11 C3 锚)', async () => {
    mockDup.mockResolvedValueOnce(true);
    const res = await handleAddBadge(makeCtx());
    expect(res.result).toMatchObject({ alreadyAwarded: true });
    expect(mockDelta).not.toHaveBeenCalled();
  });

  it('新授予: delta addBadges + 审计 triggerId 小时桶格式', async () => {
    const res = await handleAddBadge(makeCtx());
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ alreadyHad: false, auditLogged: true, badgeName: '7-Day Streak' });
    expect(mockDelta).toHaveBeenCalledWith('u1', { addBadges: ['streak_7'] });
    const call = mockHealth.mock.calls[0][0];
    expect(call.triggerId).toMatch(/^ab:u1:streak_7:\d+$/);
    expect(call.triggerSource).toBe('chat_mcp');
    expect(call.metadata).toEqual({ badgeId: 'streak_7', badgeName: '7-Day Streak' });
  });

  it('delta 失败 → success=false + error 透传', async () => {
    mockDelta.mockResolvedValueOnce({ success: false, error: 'rpc down' } as never);
    const res = await handleAddBadge(makeCtx());
    expect(res.success).toBe(false);
    expect(res.message).toContain('rpc down');
  });

  it('审计失败 → auditLogged=false 仍 success (Round 41 MEDIUM-3)', async () => {
    mockHealth.mockRejectedValueOnce(new Error('audit down') as never);
    const res = await handleAddBadge(makeCtx());
    expect(res.success).toBe(true);
    expect(res.result.auditLogged).toBe(false);
  });

  it('未知 badge_id → 原样透传 + badgeName=原 id', async () => {
    const res = await handleAddBadge(makeCtx({ args: { badge_id: 'mystery_badge' } }));
    expect(res.result.badgeName).toBe('mystery_badge');
    expect(res.message).toContain('mystery_badge');
  });
});
