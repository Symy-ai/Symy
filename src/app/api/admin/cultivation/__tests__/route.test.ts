// admin/cultivation — 修身档案管理（此前 0 测试）
// 契约: admin鉴权403+审计/stats head+count分桶(M12 OOM修复)/
// profile需UUID校验(UNFIXED#9)/getProfile失败500。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyAdminAuthMock = vi.fn();
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: (...a: unknown[]) => verifyAdminAuthMock(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const logUnauthorizedMock = vi.fn();
const withAdminAuditMock = vi.fn((_req: unknown, _auth: unknown, h: () => unknown) => Promise.resolve(h()));
vi.mock('@/lib/admin-audit', () => ({
  logUnauthorizedAdminAttempt: (...a: unknown[]) => logUnauthorizedMock(...a),
  // eslint-disable-next-line require-await -- 直返 mock
  withAdminAudit: (req: unknown, auth: unknown, h: () => unknown) => withAdminAuditMock(req, auth, h),
}));
const countMock = vi.fn();
const adminFromMock = vi.fn((t: string) => {
  expect(t).toBe('user_intervention_profile');
  return {
    select: (_c: string, opts?: Record<string, unknown>) => ({
      eq: (col: string, v: string) => countMock(col, v),
      ...((opts?.head)
        ? { then: (r: (v: unknown) => unknown) => Promise.resolve(countMock('direct', 'none')).then(r) }
        : {}),
    }),
  };
});
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: { from: adminFromMock }, error: null }),
}));
const getProfileMock = vi.fn();
const reassessMock = vi.fn();
vi.mock('@/lib/cultivation', () => ({
  getProfile: (...a: unknown[]) => getProfileMock(...a),
  reassessProfile: (...a: unknown[]) => reassessMock(...a),
}));

import { GET } from '../route';

function req(q = '') {
  return new NextRequest('http://localhost/api/admin/cultivation' + (q ? '?' + q : ''));
}

describe('GET /api/admin/cultivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true, reason: 'ok' });
    countMock.mockResolvedValue({ count: 5, error: null });
  });

  it('非 admin → 403 + 未授权审计', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(logUnauthorizedMock).toHaveBeenCalledTimes(1);
  });

  it('默认 stats: severity 3桶 + stage 4桶 = 7 次 head+count (M12 OOM 契约)', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(countMock).toHaveBeenCalledTimes(7);
    const body = await res.json();
    expect(body.total).toBe(15); // severity 3×5
    expect(body.by_severity_tier).toEqual({ severe: 5, moderate: 5, light: 5 });
    expect(Object.keys(body.by_cultivation_stage)).toEqual(['zhi_yu', 'zhi_zhi', 'cheng_yi', 'zheng_xin']);
  });

  it('profile: 缺 user_id → 400', async () => {
    const res = await GET(req('action=profile'));
    expect(res.status).toBe(400);
  });

  it('profile: 非 UUID user_id → 400 (UNFIXED#9)', async () => {
    const res = await GET(req('action=profile&user_id=not-uuid'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('UUID');
  });

  it('profile: 合法 UUID → 返回画像', async () => {
    getProfileMock.mockResolvedValue({ stage: 'zhi_zhi', severity: 'moderate' });
    const res = await GET(req('action=profile&user_id=123e4567-e89b-12d3-a456-426614174000'));
    expect(res.status).toBe(200);
    expect((await res.json()).profile.stage).toBe('zhi_zhi');
  });

  it('profile: getProfile null → 500', async () => {
    getProfileMock.mockResolvedValue(null);
    const res = await GET(req('action=profile&user_id=123e4567-e89b-12d3-a456-426614174000'));
    expect(res.status).toBe(500);
  });
});
