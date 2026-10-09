import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  applyBuddyStateDelta: vi.fn(),
  getHealthFromVitality: vi.fn(() => 'healthy'),
  getUserLocale: vi.fn((): Promise<string> => Promise.resolve('zh')),
  isToolCallInProgress: vi.fn((_k?: string) => false),
  releaseToolCallLock: vi.fn(),
  isDuplicateHealthEvent: vi.fn((): Promise<boolean> => Promise.resolve(false)),
  createHealthEvent: vi.fn((): Promise<{ success: boolean; deduplicated?: boolean; newVitality?: number; vitalityChange?: number }> =>
    Promise.resolve({ success: true, newVitality: 60, vitalityChange: -8 })),
}));
vi.mock('../_shared', () => ({
  applyBuddyStateDelta: M.applyBuddyStateDelta,
  getHealthFromVitality: M.getHealthFromVitality,
  getUserLocale: M.getUserLocale,
  isToolCallInProgress: M.isToolCallInProgress,
  releaseToolCallLock: M.releaseToolCallLock,
  isDuplicateHealthEvent: M.isDuplicateHealthEvent,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  MCPHandlerContext: {},
  MCPToolResult: {},
}));
vi.mock('../descriptions', () => ({
  impulseRecordedDesc: vi.fn(() => '已记录冲动消费'),
  getHourlyRateFromArgs: vi.fn(() => null),
}));
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: vi.fn((): Promise<number> => Promise.resolve(50)) }));
vi.mock('@/lib/buddy-defaults', () => ({ calculateImpulseDamage: vi.fn(() => -8) }));
vi.mock('@/lib/health-impact', () => ({ createHealthEvent: M.createHealthEvent }));
vi.mock('server-only', () => ({}));

import { handleRecordImpulse } from '../record_impulse';

function sb(emailEvents: unknown[] = [], vitality: number | null = 80) {
  const insertMock = vi.fn(() => Promise.resolve({}));
  // health_events: .select.eq(user).eq(source).eq(type).gte.limit → data
  const emailChain = {
    eq: vi.fn(() => emailChain),
    gte: vi.fn(() => emailChain),
    limit: vi.fn(() => ({ data: emailEvents })),
  };
  // buddy_state pre-read: .select('vitality').eq(user).maybeSingle → data
  const bsChain = {
    eq: vi.fn(() => bsChain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: vitality === null ? null : { vitality } })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'health_events') {
        return { select: vi.fn(() => emailChain) };
      }
      if (table === 'buddy_state') {
        return { select: vi.fn(() => bsChain) };
      }
      return { insert: insertMock }; // impulse_events
    }),
  };
}

const ctx = (args: Record<string, unknown>, s: unknown) =>
  ({ toolCallId: 'tc1', userId: 'u1', args, supabase: s } as never);

/**
 * record_impulse.ts (325行) — 冲动消费记录 (Round 2 C2+Round 30 AUDIT-6 HIGH-3 跨源防线+P0-2)。
 *
 * 锁定:
 * - amount NaN/≤0 → false 引导重试
 * - in-progress/DB dedup 双短路 (ri: triggerId 时间桶)
 * - 跨源双伤防线: 1h 内同额同平台 email_receipt → 0 伤只记 confession (HIGH-3)
 * - score<60 → 0 伤记录 (impulse_confessed)
 * - score≥60: createHealthEvent 原子+预读 vitality description (P0-2)+impulse_events 插入
 */
describe('handleRecordImpulse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.isDuplicateHealthEvent.mockResolvedValue(false);
    M.isToolCallInProgress.mockReturnValue(false);
    M.createHealthEvent.mockResolvedValue({ success: true, newVitality: 60, vitalityChange: -8 });
  });

  it('amount NaN/≤0 → false 引导重试', async () => {
    const r = await handleRecordImpulse(ctx({ amount: 'abc' }, sb()) as never);
    expect(r.success).toBe(false);
    expect(r.message).toContain('retry');
  });

  it('双短路: in-progress 锁+DB dedup', async () => {
    M.isToolCallInProgress.mockImplementation((k?: string) => !!k && k.includes('ri:'));
    const r1 = await handleRecordImpulse(ctx({ amount: 50 }, sb()) as never);
    expect(r1.message).toContain('already being processed');
    M.isToolCallInProgress.mockReturnValue(false);
    M.isDuplicateHealthEvent.mockResolvedValue(true);
    const r2 = await handleRecordImpulse(ctx({ amount: 50 }, sb()) as never);
    expect(r2.message).toContain('duplicate');
    expect(M.createHealthEvent).not.toHaveBeenCalled();
    expect(M.releaseToolCallLock).toHaveBeenCalledWith(expect.stringContaining('ri:u1:'));
  });

  it('跨源双伤防线: 同额同平台 email 事件 → 0 伤 (HIGH-3)', async () => {
    const emailEvents = [{ metadata: { amount: 89, platform: 'TikTok_Shop' } }];
    const r = await handleRecordImpulse(ctx({ amount: 89, platform: 'tiktok_shop' }, sb(emailEvents)) as never);
    expect(r.success).toBe(true);
    expect(r.result.vitalityPenalty).toBe(0);
    expect(r.result.note).toContain('email');
    expect(M.createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'impulse_confessed',
      vitalityOverride: 0,
      metadata: expect.objectContaining({ crossSourceDedup: true }),
    }));
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('score<60 → 0 伤记录', async () => {
    const r = await handleRecordImpulse(ctx({ amount: 30, impulse_score: 40 }, sb()) as never);
    expect(r.success).toBe(true);
    expect(r.result.vitalityPenalty).toBe(0);
    expect(r.result.note).toContain('threshold');
    expect(M.createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ vitalityOverride: 0 }));
  });

  it('score≥60: 原子 createHealthEvent+P0-2 预读 description', async () => {
    const r = await handleRecordImpulse(ctx({ amount: 100, platform: 'taobao', impulse_score: 80 }, sb()) as never);
    expect(r.success).toBe(true);
    expect(r.result.vitalityPenalty).toBe(-8);
    expect(r.result.newVitality).toBe(60);
    expect(r.result.auditLogged).toBe(true);
    expect(M.createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'impulse_confessed',
      description: '已记录冲动消费', // P0-2: 预计算的 description
    }));
    expect(M.releaseToolCallLock).toHaveBeenCalled();
  });

  it('deduplicated 结果 → 无附加伤害', async () => {
    M.createHealthEvent.mockResolvedValueOnce({ success: true, deduplicated: true });
    const r = await handleRecordImpulse(ctx({ amount: 100, impulse_score: 80 }, sb()) as never);
    expect(r.success).toBe(true);
    expect(r.message).toContain('No additional damage');
    expect(r.result.challengePassed).toBe(true);
  });
});
