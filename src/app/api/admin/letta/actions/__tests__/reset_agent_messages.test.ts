import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  validateActionBody: vi.fn(),
  createAdminClient: vi.fn(),
  messagesReset: vi.fn(),
}));

vi.mock('../_shared', () => ({
  validateActionBody: M.validateActionBody,
  lettaAPI: vi.fn(),
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));

import { handleResetAgentMessages } from '../reset_agent_messages';

function makeCtx() {
  return { client: { agents: { messages: { reset: M.messagesReset } } } } as never;
}

/**
 * reset_agent_messages.ts (89行) — 清空 agent 对话历史 (PM-NEW-2 三修)。
 *
 * 锁定:
 * - 模式 A: 单 agent reset+flag 透传; 失败 → 500
 * - 模式 B: 遍历全部, reset/failed 计数, failures 只返前 5
 * - admin client 不可用 → 500
 */
describe('handleResetAgentMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { add_default_initial_messages: false } });
    M.messagesReset.mockResolvedValue({});
  });

  it('模式 A: 单 agent reset+flag 透传', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'agent-1', add_default_initial_messages: true } });
    const r = (await handleResetAgentMessages(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.agent_id).toBe('agent-1');
    expect(M.messagesReset).toHaveBeenCalledWith('agent-1', { add_default_initial_messages: true });
  });

  it('模式 A 失败 → 500', async () => {
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: 'agent-bad' } });
    M.messagesReset.mockRejectedValueOnce(new Error('letta 503'));
    const r = (await handleResetAgentMessages(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('模式 B: admin client 不可用 → 500', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    const r = (await handleResetAgentMessages(makeCtx())) as Response;
    expect(r.status).toBe(500);
  });

  it('模式 B: 遍历+计数+failures 截 5', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ letta_agent_id: `agent-${i}` }));
    M.createAdminClient.mockReturnValue({
      supabase: {
        from: () => ({
          select: () => ({
            not: () => Promise.resolve({ data: [...six, { letta_agent_id: 'agent-ok' }] }),
          }),
        }),
      },
    });
    M.messagesReset.mockRejectedValue(new Error('down')); // 全挂 → 7 failures 只返 5
    const r = (await handleResetAgentMessages(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.reset).toBe(0);
    expect(body.failed).toBe(7);
    expect(body.total).toBe(7);
    expect(body.failures).toHaveLength(5);
  });

  it('模式 B: 全成功 → reset=total', async () => {
    M.createAdminClient.mockReturnValue({
      supabase: {
        from: () => ({
          select: () => ({
            not: () => Promise.resolve({ data: [{ letta_agent_id: 'a1' }, { letta_agent_id: 'a2' }] }),
          }),
        }),
      },
    });
    const r = (await handleResetAgentMessages(makeCtx())) as Response;
    const body = JSON.parse(await r.text());
    expect(body.reset).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.failures).toEqual([]);
  });
});
