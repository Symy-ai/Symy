import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchange: vi.fn(),
  createAdminClient: vi.fn(),
  getOrCreateAgentId: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({ createClient: M.createClient }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// 动态 import 的两模块也须显式 mock (透传即真模块 → supabase-admin 读 env 卡死)
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/letta-agent-manager', () => ({ getOrCreateAgentId: M.getOrCreateAgentId }));

import { GET } from '../route';

function makeRequest(params: Record<string, string>) {
  const url = new URL('https://symy.ai/zh/auth/callback');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url);
}

function setupDb({ profile, agentId }: { profile: unknown; agentId: string | null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: profile })),
    insert: vi.fn(() => Promise.resolve({ error: null })),
  };
  M.from.mockReturnValue(chain);
  M.createAdminClient.mockReturnValue({ supabase: { from: M.from }, error: null });
  M.getOrCreateAgentId.mockResolvedValue(agentId);
}

/**
 * auth/callback route (115行) — 邮箱确认+agent 即建 (Round 112 P0/Round 42 B2/BUG-67/SEC-1)。
 *
 * 锁定:
 * - SEC-1: next 白名单 (//、/api/、外域全归 /)
 * - recovery flow → reset-password (不建 agent)
 * - profiles 缺失 → 兜底 INSERT (migration 120)
 * - 无 agent → getOrCreateAgentId (Round 42 B2 防并发 orphan)
 * - agent 失败 → non-blocking 仍跳 next
 * - 交换失败 → login?error= 透传 (BUG-67)
 */
describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: M.exchange } });
    M.exchange.mockResolvedValue({ error: null, data: { user: { id: 'u1', email: 'a@t.co' } } });
    setupDb({ profile: { id: 'u1', letta_agent_id: 'agent-x' }, agentId: 'agent-x' });
  });

  it('SEC-1: next 白名单 — 外域/双斜线/api/ 全归 /', async () => {
    for (const bad of ['https://evil.com', '//evil.com', '/api/admin/letta']) {
      const res = await GET(makeRequest({ code: 'c', next: bad }));
      expect(res.headers.get('location')).toBe('https://symy.ai/'); // 重置到 /
    }
  });

  it('合法 next 保留', async () => {
    const res = await GET(makeRequest({ code: 'c', next: '/zh/monitor' }));
    expect(res.headers.get('location')).toBe('https://symy.ai/zh/monitor');
  });

  it('recovery flow → reset-password, 不建 agent', async () => {
    const res = await GET(makeRequest({ code: 'c', type: 'recovery' }));
    expect(res.headers.get('location')).toBe('https://symy.ai/auth/reset-password');
    expect(M.getOrCreateAgentId).not.toHaveBeenCalled();
  });

  it('profiles 缺失 → 兜底 INSERT (migration 120) + 建 agent', async () => {
    setupDb({ profile: null, agentId: 'agent-new' });
    const res = await GET(makeRequest({ code: 'c' }));
    expect(res.headers.get('location')).toBe('https://symy.ai/');
    // INSERT 被调 (兜底)
    const insertChain = M.from.mock.results[0].value;
    expect(insertChain.insert).toHaveBeenCalled();
    expect(M.getOrCreateAgentId).toHaveBeenCalledWith('u1', 'a@t.co');
  });

  it('已有 agent → 不重复创建', async () => {
    await GET(makeRequest({ code: 'c' }));
    expect(M.getOrCreateAgentId).not.toHaveBeenCalled();
  });

  it('agent 创建失败 → non-blocking 仍跳 next (Round 112)', async () => {
    setupDb({ profile: { id: 'u1', letta_agent_id: null }, agentId: null });
    const res = await GET(makeRequest({ code: 'c', next: '/zh/chat' }));
    expect(res.headers.get('location')).toBe('https://symy.ai/zh/chat');
  });

  it('交换失败 → login?error= 透传 (BUG-67); 无 code → auth_callback_failed', async () => {
    M.exchange.mockResolvedValueOnce({ error: { message: 'code expired' }, data: {} });
    const res = await GET(makeRequest({ code: 'bad' }));
    expect(res.headers.get('location')).toContain('/auth/login?error=code%20expired');
    const res2 = await GET(makeRequest({}));
    expect(res2.headers.get('location')).toContain('auth_callback_failed');
  });
});
