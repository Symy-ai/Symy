// admin/embeddings — 向量统计管理端点（此前 0 测试）
// 契约: admin鉴权403+未授权审计/默认stats按3 source_type计数(OOM修复
// 契约: head+count不载行)/user_stats需user_id/admin client失败500。
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
vi.mock('@/lib/admin-audit', () => ({
  logUnauthorizedAdminAttempt: (...a: unknown[]) => logUnauthorizedMock(...a),
  withAdminAudit: (_req: unknown, _auth: unknown, h: () => unknown) => h(),
}));
vi.mock('@/lib/embed-backfill', () => ({
  backfillImpulseEvents: vi.fn(),
  backfillEmailReceipts: vi.fn(),
  backfillChatMessages: vi.fn(),
}));

const countMock = vi.fn(); // head+count 链
const rowsMock = vi.fn(); // user_stats 行查询
const profilesRowsMock = vi.fn(); // backfill_all profiles 链
const adminFromMock = vi.fn((t: string) => {
  if (t === 'profiles') {
    return {
      select: () => ({
        order: () => ({
          limit: () => profilesRowsMock(),
        }),
        eq: () => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }),
      }),
    };
  }
  expect(t).toBe('user_embeddings');
  return {
    select: (cols: string, opts?: Record<string, unknown>) => {
      if (opts?.head) {
        // count 链: .eq() 后触发, 或直接 await (unique_users 无 eq) — 用 thenable 直落
        const viaEq = { eq: (_c: string, v: string) => countMock(v) };
        return { ...viaEq, then: (r: (v: unknown) => unknown) => Promise.resolve(countMock('unique')).then(r) };
      }
      // 行查询 (user_stats)
      return { eq: () => rowsMock() };
    },
  };
});
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: { from: adminFromMock }, error: null }),
}));

import { GET, POST } from '../route';
import { backfillImpulseEvents, backfillEmailReceipts, backfillChatMessages } from '@/lib/embed-backfill';

function req(q = '') {
  return new NextRequest('http://localhost/api/admin/embeddings' + (q ? '?' + q : ''));
}

describe('GET /api/admin/embeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true, reason: 'ok' });
    countMock.mockResolvedValue({ count: 10, error: null });
    rowsMock.mockResolvedValue({ data: [], error: null });
  });

  it('非 admin → 403 且记录未授权审计', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false, reason: 'no key' });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(logUnauthorizedMock).toHaveBeenCalledTimes(1);
  });

  it('默认 stats: 3 source_type head+count (OOM 修复契约: 不载行)', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    // 3 个 source_type + 1 个 unique_users 近似 = 4 次 count 查询
    expect(countMock).toHaveBeenCalledTimes(4);
    const body = await res.json();
    expect(body.total).toBe(30); // 3×10
    expect(body.by_source_type).toEqual({ impulse_event: 10, email_receipt: 10, chat_message: 10 });
  });

  it('user_stats: 缺 user_id → 400', async () => {
    const res = await GET(req('action=user_stats'));
    expect(res.status).toBe(400);
  });

  it('user_stats: 行按 source_type 分桶', async () => {
    rowsMock.mockResolvedValue({
      data: [{ source_type: 'impulse_event' }, { source_type: 'impulse_event' }, { source_type: 'chat_message' }],
      error: null,
    });
    const res = await GET(req('action=user_stats&user_id=u-9'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      user_id: 'u-9',
      total: 3,
      by_source_type: { impulse_event: 2, chat_message: 1 },
    });
  });

  it('POST backfill_all: 无用户 → 200 + No users + total 0', async () => {
    profilesRowsMock.mockResolvedValue({ data: [], error: null });
    const res = await POST(req('action=backfill_all'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.message).toBe('No users to backfill');
  });

  it('POST backfill_all: 批处理 3 用户 → results 3 + backfill 三链全调 + nextCursor=null (不满批)', async () => {
    profilesRowsMock.mockResolvedValue({
      data: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
      error: null,
    });
    const res = await POST(req('action=backfill_all'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_users).toBe(3);
    expect(body.results).toHaveLength(3);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(backfillImpulseEvents).toHaveBeenCalledTimes(3);
    expect(backfillEmailReceipts).toHaveBeenCalledTimes(3);
    expect(backfillChatMessages).toHaveBeenCalledTimes(3);
  });

  it('POST backfill_all: profiles 查询失败 → 500', async () => {
    profilesRowsMock.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const res = await POST(req('action=backfill_all'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch profiles');
    expect(JSON.stringify(body)).not.toContain('timeout');
  });

  it('count 查询失败 → 500', async () => {
    countMock.mockResolvedValue({ count: null, error: { message: 'boom' } });
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
