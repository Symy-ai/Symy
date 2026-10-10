// admin/settings/migrations route (26行) — Migration 文件状态子路由（只读）。
// 锁定: 鉴权 401+审计 / getMigrationsInfo 透传 / withAdminAudit 包装。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const M = vi.hoisted(() => ({
  verifyAdminAuth: vi.fn(),
  withAdminAudit: vi.fn((_req: unknown, _auth: unknown, fn: () => unknown) => fn()),
  logUnauthorized: vi.fn(),
  getMigrationsInfo: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({ verifyAdminAuth: M.verifyAdminAuth }));
vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: M.withAdminAudit,
  logUnauthorizedAdminAttempt: M.logUnauthorized,
}));
vi.mock('@/lib/admin-settings', () => ({ getMigrationsInfo: M.getMigrationsInfo }));

import { GET } from '../route';

const req = () => new NextRequest('http://localhost/api/admin/settings/migrations');

describe('GET /api/admin/settings/migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.verifyAdminAuth.mockReturnValue({ authorized: true, provider: 'key' });
    M.withAdminAudit.mockImplementation((_r: unknown, _a: unknown, fn: () => unknown) => fn());
  });

  it('未授权 → 401 + 审计记录', async () => {
    M.verifyAdminAuth.mockReturnValue({ authorized: false, error: 'no key' });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(M.logUnauthorized).toHaveBeenCalledTimes(1);
    expect(M.getMigrationsInfo).not.toHaveBeenCalled();
  });

  it('授权 → migration 列表透传 (含文件名/大小/冲突)', async () => {
    M.getMigrationsInfo.mockResolvedValue({
      total: 149,
      conflicts: [],
      files: [
        { name: '148_rls_policy_guard.sql', size: 4096 },
        { name: '149_increment_resonates_search_path.sql', size: 1024 },
      ],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(149);
    expect(body.files).toHaveLength(2);
    expect(body.files[0]).toMatchObject({ name: '148_rls_policy_guard.sql', size: 4096 });
  });

  it('getMigrationsInfo 抛错 → Promise rejection 冒泡 (route 无 try/catch)', async () => {
    M.getMigrationsInfo.mockRejectedValue(new Error('fs read crashed'));
    const pending = GET(req()) as Promise<unknown>;
    await expect(pending).rejects.toThrow('fs read crashed');
  });
});
