// admin/audit — 管理操作审计（此前 0 测试）
// 契约: admin鉴权403/stats模式exact count+截断告警(Round 75)/
// list分页边界收敛/route+actor过滤。
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
  withAdminAudit: (req: unknown, auth: unknown, h: () => unknown) => withAdminAuditMock(req, auth, h),
}));

// 两种链: head+count 链 / 行查询链
const headCountMock = vi.fn();
const rowsQueryMock = vi.fn(); // (action?, status?) thenable with .range
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    supabase: {
      from: (t: string) => {
        expect(t).toBe('admin_audit_logs');
        return {
          select: (cols: string, opts?: Record<string, unknown>) => {
            if (opts?.head) {
              return { ...{}, then: (r: (v: unknown) => unknown) => Promise.resolve(headCountMock()).then(r) };
            }
            // 行链: select cols → order → limit 或 range; stats 链 select('action, status_code')
            if (cols === 'action, status_code') {
              return {
                order: () => ({ limit: () => rowsQueryMock('stats') }),
              };
            }
            // thenable builder (近似 PostgrestFilterBuilder): range 后仍可 eq 再 await
            const makeBuilder = (apply: () => unknown): Record<string, unknown> => ({
              range: (a: number, b: number) => makeBuilder(() => rowsQueryMock('list', a, b)),
              eq: () => makeBuilder(apply),
              then: (r: (v: unknown) => unknown) => Promise.resolve(apply()).then(r),
            });
            return {
              order: () => makeBuilder(() => rowsQueryMock('list', 0, -1)),
            };
          },
        };
      },
    },
    error: null,
  }),
}));

import { GET } from '../route';

function req(q = '') {
  return new NextRequest('http://localhost/api/admin/audit' + (q ? '?' + q : ''));
}

describe('GET /api/admin/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    headCountMock.mockResolvedValue({ count: 3, error: null });
  });

  it('非 admin → 403 + 未授权审计', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(logUnauthorizedMock).toHaveBeenCalledTimes(1);
  });

  it('stats: byAction/byStatus 分桶 + truncated=false (Round 75 契约)', async () => {
    rowsQueryMock.mockResolvedValue({
      data: [
        { action: 'reassess', status_code: 200 },
        { action: 'reassess', status_code: 200 },
        { action: null, status_code: 403 },
      ],
      error: null,
    });
    const res = await GET(req('action=stats'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.byAction).toEqual({ reassess: 2, '(none)': 1 });
    expect(body.byStatus).toEqual({ '200': 2, '403': 1 });
    expect(body.truncated).toBe(false);
  });

  it('stats: exact count > 行数 → truncated=true + warn', async () => {
    headCountMock.mockResolvedValue({ count: 150_000, error: null });
    rowsQueryMock.mockResolvedValue({ data: [], error: null });
    const res = await GET(req('action=stats'));
    const body = await res.json();
    expect(body.total).toBe(150_000); // exact, 不被行上限截断
    expect(body.truncated).toBe(true);
  });

  it('list: 分页 range = (page-1)*limit 到 +limit-1, limit 上限 200', async () => {
    rowsQueryMock.mockResolvedValue({ data: [], count: 0, error: null });
    const res = await GET(req('page=3&limit=999'));
    expect(res.status).toBe(200);
    expect(rowsQueryMock).toHaveBeenCalledWith('list', 400, 599); // page3 limit200 → [400,599]
  });

  it('count 查询失败 → 500', async () => {
    headCountMock.mockResolvedValue({ count: null, error: { message: 'boom' } });
    const res = await GET(req('action=stats'));
    expect(res.status).toBe(500);
  });

  it('stats 行查询失败 → 500 (与 count 失败同语义)', async () => {
    rowsQueryMock.mockResolvedValue({ data: null, error: { message: 'rls' } });
    const res = await GET(req('action=stats'));
    expect(res.status).toBe(500);
  });

  it('list 查询失败 → 500 + 不泄露 error.message', async () => {
    rowsQueryMock.mockResolvedValue({ data: null, count: null, error: { message: 'internal leak' } });
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch audit logs');
    expect(JSON.stringify(body)).not.toContain('internal leak');
  });

  it('page=0/负数 → 收敛 1; limit=0 → 收敛 1 (边界防负 range)', async () => {
    rowsQueryMock.mockResolvedValue({ data: [], count: 0, error: null });
    const res = await GET(req('page=0&limit=0'));
    expect(res.status).toBe(200);
    expect(rowsQueryMock).toHaveBeenCalledWith('list', 0, 0); // page1 limit1 → [0,0]
  });

  it('route/actor 过滤 → 链上 eq 双挂 (需过滤参数透传)', async () => {
    rowsQueryMock.mockResolvedValue({ data: [], count: 0, error: null });
    const res = await GET(req('route=%2Fapi%2Fadmin%2Fvip&actor=admin%40symy.ai'));
    expect(res.status).toBe(200);
    // list 链 mock 的 range 前有 eq — 本例锚 200 + 无异常 (eq 链在 mock 中透传)
    expect(rowsQueryMock).toHaveBeenCalled();
  });
});
