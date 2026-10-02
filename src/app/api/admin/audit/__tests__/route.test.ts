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
            return {
              order: () => ({
                range: (a: number, b: number) => rowsQueryMock('list', a, b),
              }),
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
});
