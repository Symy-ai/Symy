import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  flags: { communityStatsMultiplier: 1 },
}));

vi.mock('@/lib/with-auth', () => ({
  // identity 透传 (R361 定案)
  withAuth: (fn: (args: unknown) => unknown) => fn,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/feature-flags', () => ({ featureFlags: M.flags }));

import { GET } from '../route';

function makeArgs(data: unknown, error: unknown = null) {
  return {
    supabase: {
      from: () => ({
        select: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data, error }),
          }),
        }),
      }),
    },
  };
}

/**
 * community/stats route (79行) — 群体防御网络总览 (Round 100 withAuth 迁移)。
 *
 * 面子/里子铁律锚:
 * - 金额/小时数永乘 multiplier (真实数字); 只乘参与计数
 * - activeUsers<10 → hasData=false (隐私门槛)
 * - 视图未迁移/查询失败 → 零值降级不 crash
 * - lifeHours = round(saved/20, 1)
 */
describe('GET /api/community/stats', () => {
  beforeEach(() => {
    M.flags.communityStatsMultiplier = 1;
  });

  it('真实数字: multiplier=1 直通+小时换算', async () => {
    const r = (await GET(makeArgs({ active_users_7d: 25, total_saved_7d: 1234.56, total_passed_7d: 40 }) as never)) as Response;
    const body = await r.json();
    expect(body).toEqual({
      activeUsers: 25,
      totalSaved: 1234.56,
      totalChallengesPassed: 40,
      lifeHoursRecovered: 61.7, // 1234.56/20 = 61.728 → round 1 位
      hasData: true, // ≥10
    });
  });

  it('隐私门槛: <10 用户 → hasData=false', async () => {
    const r = (await GET(makeArgs({ active_users_7d: 7, total_saved_7d: 100, total_passed_7d: 9 }) as never)) as Response;
    expect((await r.json()).hasData).toBe(false);
  });

  it('multiplier 只乘计数不乘钱/小时 (面子铁律)', async () => {
    M.flags.communityStatsMultiplier = 3;
    const r = (await GET(makeArgs({ active_users_7d: 25, total_saved_7d: 200, total_passed_7d: 40 }) as never)) as Response;
    const body = await r.json();
    expect(body.activeUsers).toBe(75); // 计数 ×3
    expect(body.totalChallengesPassed).toBe(120); // 计数 ×3
    expect(body.totalSaved).toBe(200); // 金额恒真实
    expect(body.lifeHoursRecovered).toBe(10); // 小时恒真实 (200/20)
  });

  it('视图未迁移 (error) → 零值降级', async () => {
    const r = (await GET(makeArgs(null, { message: 'relation does not exist' }) as never)) as Response;
    const body = await r.json();
    expect(body).toEqual({ activeUsers: 0, totalSaved: 0, totalChallengesPassed: 0, lifeHoursRecovered: 0, hasData: false });
  });

  it('空 data (无行) → 全零', async () => {
    const r = (await GET(makeArgs(null) as never)) as Response;
    const body = await r.json();
    expect(body.totalSaved).toBe(0);
    expect(body.hasData).toBe(false);
  });

  it('意外异常 → catch 零值 (UI 不 crash)', async () => {
    const r = (await GET({
      supabase: { from: () => { throw new Error('boom'); } },
    } as never)) as Response;
    expect((await r.json()).hasData).toBe(false);
  });
});
