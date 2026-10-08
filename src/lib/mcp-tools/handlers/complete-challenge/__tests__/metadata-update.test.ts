import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/platform-detector', () => ({
  autoDetectPlatform: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { updateChallengeMetadataWithPlatform } from '../metadata-update';
import { autoDetectPlatform } from '@/lib/platform-detector';
import { logger } from '@/lib/logger';

const mockDetect = vi.mocked(autoDetectPlatform);

function makeSupabase(err: unknown = null) {
  const captured: { payload?: unknown; eq?: unknown[][] } = {};
  const builder = {
    update: (payload: unknown) => {
      captured.payload = payload;
      return { eq: (col: string, val: unknown) => {
        captured.eq = [...(captured.eq ?? []), [col, val]];
        return { eq: (c2: string, v2: unknown) => { captured.eq = [...(captured.eq ?? []), [c2, v2]]; return Promise.resolve({ error: err }); } };
      } };
    },
  };
  return { client: { from: () => builder } as never, captured };
}

const baseInput = {
  userId: 'u1',
  challengeId: 'ch1',
  savedAmount: 100,
  itemName: '键盘',
};

/**
 * metadata-update.ts (140行) — 挑战完成元数据更新 (3x 去重提取件)。
 *
 * 锁定:
 * - duration 计算: created_at 有效 → 秒差; 无/NaN → undefined 不存
 * - platform: autoDetect 成功入 metadata; 抛错 → undefined 继续 (非关键)
 * - metadata spread 保留旧键
 * - setUnsettled 双态 (deposit_status)
 * - {error} 返回检查: 失败 → false + error 日志 (P1-1/P1-2); 成功 → true
 * - 双 eq 条件 (id+user_id)
 */
describe('updateChallengeMetadataWithPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('成功: metadata 三新键 + spread 旧键 + 双 eq 条件', async () => {
    mockDetect.mockResolvedValueOnce('tiktok_shop' as never);
    const { client, captured } = makeSupabase();
    const ok = await updateChallengeMetadataWithPlatform({
      ...baseInput, supabase: client, setUnsettled: false,
      challenge: { created_at: new Date(Date.now() - 60_000).toISOString(), metadata: { old_key: 'kept' } } as never,
    });
    expect(ok).toBe(true);
    const payload = captured.payload as unknown as Record<string, unknown>;
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta.old_key).toBe('kept'); // 旧键保留
    expect(meta.challenge_duration).toBe(60); // 60s
    expect(meta.platform).toBe('tiktok_shop');
    expect(typeof meta.completed_at_ts).toBe('number');
    expect(payload.deposit_status).toBeUndefined();
    expect(captured.eq).toContainEqual(['id', 'ch1']);
    expect(captured.eq).toContainEqual(['user_id', 'u1']);
  });

  it('setUnsettled=true → deposit_status=unsettled', async () => {
    mockDetect.mockResolvedValueOnce(null as never);
    const { client, captured } = makeSupabase();
    await updateChallengeMetadataWithPlatform({ ...baseInput, supabase: client, setUnsettled: true, challenge: undefined });
    expect((captured.payload as Record<string, unknown>).deposit_status).toBe('unsettled');
    expect((captured.payload as { metadata: { platform?: string } }).metadata.platform).toBeUndefined();
  });

  it('P2-10: created_at 无效 (NaN) → challenge_duration=undefined 不存秒数', async () => {
    mockDetect.mockResolvedValueOnce(null as never);
    const { client, captured } = makeSupabase();
    await updateChallengeMetadataWithPlatform({
      ...baseInput, supabase: client, setUnsettled: false,
      challenge: { created_at: 'not-a-date' } as never,
    });
    expect((captured.payload as { metadata: { challenge_duration?: number } }).metadata.challenge_duration).toBeUndefined();
  });

  it('challenge undefined → duration 跳过 + metadata 空 spread', async () => {
    mockDetect.mockResolvedValueOnce(null as never);
    const { client, captured } = makeSupabase();
    await updateChallengeMetadataWithPlatform({ ...baseInput, supabase: client, setUnsettled: false, challenge: undefined });
    const payload = captured.payload as unknown as Record<string, unknown>;
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta.challenge_duration).toBeUndefined();
    expect(Object.keys(meta)).toEqual(['challenge_duration', 'platform', 'completed_at_ts']);
  });

  it('autoDetect 抛错 → 非关键继续 (platform undefined, warn 日志)', async () => {
    mockDetect.mockRejectedValueOnce(new Error('db down') as never);
    const { client, captured } = makeSupabase();
    const ok = await updateChallengeMetadataWithPlatform({ ...baseInput, supabase: client, setUnsettled: false, challenge: undefined });
    expect(ok).toBe(true);
    expect((captured.payload as { metadata: { platform?: string } }).metadata.platform).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('P1-1/P1-2: {error} 返回 → false + error 日志 (deposit/duration/platform 全丢可见)', async () => {
    mockDetect.mockResolvedValueOnce(null as never);
    const dbErr = new Error('RLS denied');
    const { client } = makeSupabase(dbErr);
    const ok = await updateChallengeMetadataWithPlatform({ ...baseInput, supabase: client, setUnsettled: true, challenge: undefined });
    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
