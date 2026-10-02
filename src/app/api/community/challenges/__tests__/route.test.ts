/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// community/challenges — 周挑战自愈（此前 0 测试）
// 契约: 空列表→admin自动创建本周(Round 108自愈)/最新挑战过期→预创建/
// 查询失败→空数组降级(不500)/正常→buildChallengesResponse。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const adminFromMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: { from: adminFromMock }, error: null }),
}));
const createWeeklyMock = vi.fn();
vi.mock('@/app/api/admin/_lib/create-weekly-challenges-helper', () => ({
  createWeeklyChallengesWithFallback: (...a: unknown[]) => createWeeklyMock(...a),
}));
vi.mock('@/lib/feature-flags', () => ({
  featureFlags: { get: vi.fn().mockResolvedValue(false) },
}));

// 用户 supabase: from('community_challenges') 与 from('community_challenge_participants') 两条链
const listMock = vi.fn(); // 挑战列表查询
const participantsMock = vi.fn();
const fakeSupabase = {
  from: (t: string) => {
    if (t === 'community_challenges') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => listMock(),
            }),
          }),
        }),
      };
    }
    if (t === 'community_challenge_participants') {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ in: () => participantsMock() }) }),
        }),
      };
    }
    throw new Error('unexpected table ' + t);
  },
};

import { GET } from '../route';

function ctx() {
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request: new NextRequest('http://localhost/api/community/challenges') };
  return authContext.request;
}

function futureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

describe('GET /api/community/challenges — 周挑战自愈', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    participantsMock.mockResolvedValue({ data: [], error: null });
  });

  it('有本周挑战 → 直接过 buildChallengesResponse (不自愈)', async () => {
    listMock.mockResolvedValue({ data: [{ id: 'c1', is_active: true, start_date: futureDate() }], error: null });
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).challenges).toEqual([]);
    expect(createWeeklyMock).not.toHaveBeenCalled();
  });

  it('查询失败 → 200 空数组降级 (不炸)', async () => {
    listMock.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).challenges).toEqual([]);
  });

  it('空列表 → admin 自愈创建本周 → 重查返回', async () => {
    listMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'c-new', is_active: true, start_date: futureDate() }], error: null });
    createWeeklyMock.mockResolvedValue({ success: true, usedFallback: false });
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect(createWeeklyMock).toHaveBeenCalledTimes(1);
  });

  it('自愈创建失败 → 空数组降级', async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    createWeeklyMock.mockResolvedValue({ success: false, error: 'no template' });
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).challenges).toEqual([]);
  });

  it('最新挑战过期(上周) → 预创建本周', async () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    listMock
      .mockResolvedValueOnce({ data: [{ id: 'c-old', is_active: true, start_date: lastWeek.toISOString() }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'c-old' }, { id: 'c-new', is_active: true, start_date: futureDate() }], error: null });
    createWeeklyMock.mockResolvedValue({ success: true, usedFallback: false });
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect(createWeeklyMock).toHaveBeenCalledTimes(1);
  });
});
