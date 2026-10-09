import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  applyBuddyStateDelta: vi.fn(),
  getBuddyStateForRead: vi.fn((): Promise<{ badges: string[] }> => Promise.resolve({ badges: [] })),
  getUserLocale: vi.fn(() => Promise.resolve('zh')),
  isToolCallInProgress: vi.fn(() => false),
  releaseToolCallLock: vi.fn(),
  isDuplicateHealthEvent: vi.fn(() => Promise.resolve(false)),
  createHealthEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('../_shared', () => ({
  applyBuddyStateDelta: M.applyBuddyStateDelta,
  getBuddyStateForRead: M.getBuddyStateForRead,
  getUserLocale: M.getUserLocale,
  isToolCallInProgress: M.isToolCallInProgress,
  releaseToolCallLock: M.releaseToolCallLock,
  isDuplicateHealthEvent: M.isDuplicateHealthEvent,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  MCPHandlerContext: {},
  MCPToolResult: {},
}));
vi.mock('@/lib/health-impact', () => ({ createHealthEvent: M.createHealthEvent }));
vi.mock('server-only', () => ({}));

import { handleAddBadge } from '../add_badge';

const ctx = (args: Record<string, unknown> = {}) => ({
  toolCallId: 'tc1',
  userId: 'u1',
  args,
  supabase: {},
}) as never;

/**
 * add_badge.ts (132行) — 徽章奖励 handler (Round 11 C3 幂等补齐+Bug 28 多语言)。
 *
 * 锁定:
 * - 已拥有 → alreadyHad 短路 (零写入)
 * - in-progress 锁/DB dedup 双短路 (ab: triggerId)
 * - 新徽章: addBadges 原子+audit+auditLogged
 * - 六徽章名映射+未知 id 原样
 */
describe('handleAddBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.getBuddyStateForRead.mockResolvedValue({ badges: [] });
    M.isDuplicateHealthEvent.mockResolvedValue(false);
    M.isToolCallInProgress.mockReturnValue(false);
  });

  it('已拥有 → alreadyHad 短路', async () => {
    M.getBuddyStateForRead.mockReturnValue(Promise.resolve({ badges: ['streak_7'] }));
    const r = await handleAddBadge(ctx({ badge_id: 'streak_7' }) as never);
    expect(r.success).toBe(true);
    expect(r.result.alreadyHad).toBe(true);
    expect(r.message).toContain('already has badge');
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('in-progress 锁+DB dedup 双短路', async () => {
    M.isToolCallInProgress.mockReturnValue(true);
    const r1 = await handleAddBadge(ctx({ badge_id: 'first_save' }) as never);
    expect(r1.message).toContain('already being processed');
    M.isToolCallInProgress.mockReturnValue(false);
    M.isDuplicateHealthEvent.mockResolvedValue(true);
    const r2 = await handleAddBadge(ctx({ badge_id: 'first_save' }) as never);
    expect(r2.result.alreadyAwarded).toBe(true);
    expect(M.releaseToolCallLock).toHaveBeenCalledWith(expect.stringContaining('ab:u1:'));
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('新徽章: 原子 addBadges+audit 双 override=0+auditLogged', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: true });
    const r = await handleAddBadge(ctx({ badge_id: 'boss_slayer' }) as never);
    expect(M.applyBuddyStateDelta).toHaveBeenCalledWith('u1', { addBadges: ['boss_slayer'] });
    expect(M.createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      eventType: 'challenge_reward',
      triggerId: expect.stringContaining('ab:u1:boss_slayer'),
      vitalityOverride: 0,
      tokenOverride: 0,
    }));
    expect(r.success).toBe(true);
    expect(r.result).toEqual({ badgeId: 'boss_slayer', badgeName: 'Boss Slayer', alreadyHad: false, auditLogged: true });
  });

  it('未知 badge_id → 原样透传', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: true });
    const r = await handleAddBadge(ctx({ badge_id: 'custom_x' }) as never);
    expect(r.result.badgeName).toBe('custom_x');
    expect(r.message).toContain('custom_x');
  });

  it('delta 失败 → success:false', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: false, error: 'rpc down' });
    const r = await handleAddBadge(ctx({ badge_id: 'first_save' }) as never);
    expect(r.success).toBe(false);
    expect(M.createHealthEvent).not.toHaveBeenCalled();
    expect(M.releaseToolCallLock).toHaveBeenCalled();
  });
});
