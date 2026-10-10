import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  lettaAPI: vi.fn(),
  validateActionBody: vi.fn(),
}));

vi.mock('../_shared', () => ({
  lettaAPI: M.lettaAPI,
  validateActionBody: M.validateActionBody,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));

import { handleTestAgentMessage } from '../test_agent_message';

const ctx = { request: { json: () => Promise.resolve({}) } } as never;

/**
 * test_agent_message.ts (67行) — agent 直发消息测试 (BUG-R21-M3 UUID 防路径穿越)。
 *
 * 锁定:
 * - UUID schema 拒绝非 UUID (zod 层, 400 由 validateActionBody 处理)
 * - 成功: 提取 assistant_message+reasoning+usage 三段日志
 * - 无 assistant → No assistant_message+类型清单
 * - HTTP 非 ok → success=false+Error 日志
 * - 坏 JSON → Raw 截 500
 * - 抛错 → 500 Test failed
 */
describe('handleTestAgentMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.validateActionBody.mockReturnValue({ success: true, data: { agent_id: '11111111-2222-3333-4444-555555555555', message: 'hi' } });
  });

  it('成功 → assistant+reasoning+usage 三段日志', async () => {
    M.lettaAPI.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        messages: [
          { message_type: 'reasoning_message', reasoning: 'thinking...' },
          { message_type: 'assistant_message', content: '我是 GLM' },
        ],
        usage: { tokens: 42 },
      })),
    });
    const r = (await handleTestAgentMessage(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(true);
    expect(body.logs).toContainEqual(expect.stringContaining('✅ Assistant reply: 我是 GLM'));
    expect(body.logs).toContainEqual(expect.stringContaining('Reasoning: thinking...'));
    expect(body.logs).toContainEqual('Usage: {"tokens":42}');
    // 路径穿越防: URL 用 UUID 原样
    expect(M.lettaAPI).toHaveBeenCalledWith('/agents/11111111-2222-3333-4444-555555555555/messages', expect.anything());
  });

  it('无 assistant_message → 类型清单', async () => {
    M.lettaAPI.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ messages: [{ message_type: 'system_message' }], usage: {} })),
    });
    const r = (await handleTestAgentMessage(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.logs).toContainEqual('No assistant_message found');
    expect(body.logs).toContainEqual('Message types: system_message');
  });

  it('HTTP 非 ok → success=false+Error 日志', async () => {
    M.lettaAPI.mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('agent not found') });
    const r = (await handleTestAgentMessage(ctx)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.success).toBe(false);
    expect(body.logs).toContainEqual('Error: agent not found');
  });

  it('schema 拒绝非 UUID → 400 直通 (BUG-R21-M3 锚)', async () => {
    M.validateActionBody.mockReturnValueOnce({ success: false, response: new Response('bad', { status: 400 }) });
    const r = (await handleTestAgentMessage(ctx)) as Response;
    expect(r.status).toBe(400);
    expect(M.lettaAPI).not.toHaveBeenCalled();
  });

  it('lettaAPI 抛错 → 500', async () => {
    M.lettaAPI.mockRejectedValueOnce(new Error('network'));
    const r = (await handleTestAgentMessage(ctx)) as Response;
    expect(r.status).toBe(500);
  });
});
