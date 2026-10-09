import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  getUser: vi.fn(),
  getPoolStatus: vi.fn(),
  checkAndRefill: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ getAll: () => [] })),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: M.getUser },
  })),
}));
vi.mock('@/lib/letta-agent-pool', () => ({
  getPoolStatus: M.getPoolStatus,
  checkAndRefill: M.checkAndRefill,
}));

/** ADMIN_EMAILS 模块级固化 — 每 it 动态 import 取新实例 (R143 规则) */
function loadRoute(adminEmails: string) {
  process.env.ADMIN_EMAILS = adminEmails;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sb.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'k';
  vi.resetModules();
  return import('../route');
}

/**
 * admin/agent-pool-auth route (122行) — Supabase auth+邮箱白名单 (Round 128 AUDIT-11)。
 *
 * 红线锁定:
 * - ADMIN_EMAILS 未配置 → 503 fail-closed (BUG #1 无硬编码后门)
 * - 未登录 → 401; 白名单外 → 403 (timing-safe BUG #2)
 * - 白名单内 → success+triggeredBy (GET status/POST refill)
 * - status null → 500
 */
describe('admin/agent-pool-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.getUser.mockResolvedValue({ data: { user: { email: 'boss@test.com' } }, error: null });
    M.getPoolStatus.mockResolvedValue({ poolSize: 5, available: 3 });
    M.checkAndRefill.mockResolvedValue({ refilled: 1 });
  });

  it('ADMIN_EMAILS 未配置 → 503 fail-closed (Round 128 BUG #1)', async () => {
    const { GET, POST } = await loadRoute('');
    expect((await GET({} as never)).status).toBe(503);
    expect((await POST({} as never)).status).toBe(503);
  });

  it('未登录 → 401', async () => {
    const { GET, POST } = await loadRoute('boss@test.com');
    M.getUser.mockResolvedValue({ data: { user: null }, error: 'no session' });
    expect((await GET({} as never)).status).toBe(401);
    expect((await POST({} as never)).status).toBe(401);
  });

  it('白名单外 → 403', async () => {
    const { GET, POST } = await loadRoute('boss@test.com');
    M.getUser.mockResolvedValue({ data: { user: { email: 'intruder@x.com' } }, error: null });
    expect((await GET({} as never)).status).toBe(403);
    expect((await POST({} as never)).status).toBe(403);
  });

  it('白名单内 (大小写规范化匹配) → GET success+status+triggeredBy', async () => {
    const { GET } = await loadRoute('Boss@Test.com'); // 混合大小写 — 双侧 lowercase
    const r = await GET({} as never);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.success).toBe(true);
    expect(data.triggeredBy).toBe('boss@test.com');
    expect(data.poolSize).toBe(5);
  });

  it('POST → checkAndRefill 结果透传', async () => {
    const { POST } = await loadRoute('boss@test.com');
    const r = await POST({} as never);
    expect(r.status).toBe(200);
    expect((await r.json()).refilled).toBe(1);
    expect(M.checkAndRefill).toHaveBeenCalledTimes(1);
  });

  it('GET status null → 500', async () => {
    const { GET } = await loadRoute('boss@test.com');
    M.getPoolStatus.mockResolvedValue(null);
    expect((await GET({} as never)).status).toBe(500);
  });
});
