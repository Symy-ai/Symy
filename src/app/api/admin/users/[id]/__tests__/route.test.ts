// admin/users/[id] — 用户详情/GDPR删除（此前 0 测试）
// 契约: admin鉴权401/UUID校验400/五路并行查询拼详情/404/
// profile失败500。
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

// per-table mock
const profileMock = vi.fn();
const countMock = vi.fn(); // (table) => {count,error}
const buddyMock = vi.fn();
const deleteUserMock = vi.fn();
const storageListMock = vi.fn();
const storageRemoveMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    supabase: {
      from: (t: string) => ({
        select: (cols: string, opts?: Record<string, unknown>) => {
          if (t === 'profiles' && !opts?.head) {
            return { eq: () => ({ maybeSingle: profileMock }) };
          }
          if (opts?.head) {
            return { eq: () => countMock(t) };
          }
          if (t === 'buddy_state') {
            return { eq: () => ({ maybeSingle: buddyMock }) };
          }
          throw new Error('unexpected ' + t);
        },
      }),
      auth: { admin: { deleteUser: (id: string) => deleteUserMock(id) } },
      storage: {
        from: (_bucket: string) => ({
          list: () => storageListMock(),
          remove: (paths: string[]) => storageRemoveMock(paths),
        }),
      },
    },
    error: null,
  }),
}));

import { GET, DELETE } from '../route';

function req(id: string) {
  return new NextRequest(`http://localhost/api/admin/users/${id}`);
}

const UUID = '123e4567-e89b-12d3-a456-426614174000';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminAuthMock.mockReturnValue({ authorized: true });
    profileMock.mockResolvedValue({ data: { id: UUID, email: 'x@y.z', display_name: 'X' }, error: null });
    countMock.mockResolvedValue({ count: 7, error: null });
    buddyMock.mockResolvedValue({ data: { vitality: 100 }, error: null });
  });

  it('非 admin → 401', async () => {
    verifyAdminAuthMock.mockReturnValue({ authorized: false });
    const res = await GET(req(UUID), ctx(UUID));
    expect(res.status).toBe(401);
  });

  it('非 UUID → 400', async () => {
    const res = await GET(req('not-uuid'), ctx('not-uuid'));
    expect(res.status).toBe(400);
  });

  it('详情拼接: profile + 三计数 + buddyState', async () => {
    const res = await GET(req(UUID), ctx(UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe('X');
    expect(body.impulseCount).toBe(7);
    expect(body.chatMessageCount).toBe(7);
    expect(body.butterflySessionCount).toBe(7);
    expect(body.buddyState).toEqual({ vitality: 100 });
    // 三计数并行查了三张表
    expect(countMock).toHaveBeenCalledWith('impulse_events');
    expect(countMock).toHaveBeenCalledWith('chat_messages');
    expect(countMock).toHaveBeenCalledWith('butterfly_sessions');
  });

  it('profile 空 → 404', async () => {
    profileMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req(UUID), ctx(UUID));
    expect(res.status).toBe(404);
  });

  it('profile 查询失败 → 500', async () => {
    profileMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await GET(req(UUID), ctx(UUID));
    expect(res.status).toBe(500);
  });

  describe('DELETE /api/admin/users/[id] — GDPR 删除链', () => {
    beforeEach(() => {
      deleteUserMock.mockResolvedValue({ error: null });
      storageListMock.mockResolvedValue({ data: [], error: null });
      storageRemoveMock.mockResolvedValue({ data: [], error: null });
    });

    it('deleteUser 失败 → 500 不外泄 message', async () => {
      deleteUserMock.mockResolvedValue({ error: { message: 'auth admin 500' } });
      const res = await DELETE(req(UUID), ctx(UUID));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to delete user');
      expect(JSON.stringify(body)).not.toContain('auth admin 500');
    });

    it('成功 → 200 + id 回显 (级联由 DB ON DELETE CASCADE 保证)', async () => {
      const res = await DELETE(req(UUID), ctx(UUID));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe(UUID);
      expect(deleteUserMock).toHaveBeenCalledWith(UUID);
    });

    it('avatar 清理失败 → non-blocking 继续 (仍 200)', async () => {
      storageListMock.mockRejectedValue(new Error('storage down'));
      const res = await DELETE(req(UUID), ctx(UUID));
      expect(res.status).toBe(200);
      expect(deleteUserMock).toHaveBeenCalledWith(UUID);
    });
  });
});
