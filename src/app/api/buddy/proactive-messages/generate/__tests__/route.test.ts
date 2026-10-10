import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  fireAdd: vi.fn(),
  generate: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/with-auth', () => ({
  // identity 透传 — POST 即被包裹的 handler 本体
  withAuth: (fn: (args: unknown) => unknown) => fn,
}));
vi.mock('@/lib/companion-rpc', () => ({ fireAddProactiveMessages: M.fireAdd }));
vi.mock('@/hooks/buddy-state-helpers', () => ({
  DEFAULT_STATE: { vitality: 72, streak: 0, proactiveMessages: [], lastActiveAt: null },
}));
vi.mock('@/lib/buddy-proactive-messages', () => ({ generateProactiveMessages: M.generate }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/api-validation', () => ({
  validateBody: vi.fn(() => Promise.resolve({ lastOpenDate: undefined })),
  isValidationError: () => false,
}));

import * as routeMod from '../route';
const POST = routeMod.POST as unknown as (a: unknown) => Promise<Response>;
if (typeof POST !== 'function') throw new Error('POST not function: ' + typeof POST); // 诊断

function makeArgs(row: unknown = { vitality: 90, streak: 3, proactive_messages: [], last_active_at: '2026-10-01' }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
    update: vi.fn(() => chain),
  };
  return {
    supabase: { from: () => chain },
    user: { id: 'user-123456' },
    request: {},
    chain,
  };
}

/**
 * proactive-messages/generate route (81行) — buddy 主动消息生成 (withAuth)。
 *
 * 锁定:
 * - buddy_state 拉取失败 → 500
 * - 生成 0 条 → success 不触发 RPC/不更新 last_active_at
 * - 生成 N 条 → fireAddProactiveMessages+admin 更新 last_active_at
 * - admin 更新失败 → warn 不阻塞 200
 */
describe('POST /api/buddy/proactive-messages/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.generate.mockReturnValue([{ id: 'm1' }, { id: 'm2' }]);
    M.createAdminClient.mockReturnValue({ supabase: { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) } });
  });

  it('拉取失败 → 500', async () => {
    const args = makeArgs(null);
    (args.chain as Record<string, unknown>).maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: 'rls' } }));
    const r = await POST(args);
    expect(r.status).toBe(500);
  });

  it('生成 0 条 → success 0, 零副作用', async () => {
    M.generate.mockReturnValueOnce([]);
    const r = await POST(makeArgs());
    const body = await r.json();
    expect(body).toEqual({ success: true, generated: 0 });
    expect(M.fireAdd).not.toHaveBeenCalled();
  });

  it('生成 2 条 → fireAdd+last_active_at 更新', async () => {
    const r = await POST(makeArgs());
    const body = await r.json();
    expect(body.generated).toBe(2);
    expect(M.fireAdd).toHaveBeenCalledWith('user-123456', [{ id: 'm1' }, { id: 'm2' }]);
    // generate 入参: buddyState 缺省合并 (vitality 90/streak 3)
    expect(M.generate).toHaveBeenCalledWith(expect.objectContaining({
      buddyState: expect.objectContaining({ vitality: 90, streak: 3 }),
      lastOpenDate: undefined,
    }));
  });

  it('admin 更新抛错 → warn 不阻塞 200', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    const r = await POST(makeArgs());
    expect(r.status).toBe(200);
    expect((await r.json()).generated).toBe(2);
  });
});
