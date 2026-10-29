/**
 * webhook route.test — §2.3 快路径七态
 *
 * 503 未启用 / 404 未知平台 / 401 缺签名 / 200 正常 ack(含后台回合全链) /
 * 200 重放拒 / 200 洪水拒(轻提示) / 200 锁忙(轻提示) + GET telegram 405。
 *
 * 全依赖 mock；fireAndForgetSafely mock 侧执行 promise（模拟 waitUntil 完整跑完），
 * 使后台回合链（welcome → runChannelTurn → sendMessage → finally 释放锁）可断言。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  return {
    acquireLock: vi.fn((_key: string, _ttl: number, _failClosed?: boolean): Promise<boolean> => Promise.resolve(true)),
    releaseLock: vi.fn((_key: string): Promise<void> => Promise.resolve()),
    checkRateLimit: vi.fn((_key: string, _max: number, _win: number): Promise<{ allowed: boolean; remaining: number }> => Promise.resolve({ allowed: true, remaining: 20 })),
    resolveOrCreateBinding: vi.fn((_msg: unknown): Promise<{ userId: string; locale: 'zh' | 'en'; chatRef: string; created: boolean } | null> => Promise.resolve(null)),
    runChannelTurn: vi.fn((_input: unknown): Promise<{ outcome: string; replyText?: string }> => Promise.resolve({ outcome: 'replied', replyText: '(reply)' })),
    fireAndForgetSafely: vi.fn((p: Promise<unknown>) => {
      // 模拟 waitUntil: 侧执行后台链, 不阻塞 ack
      void p.catch(() => {
        // safe to ignore: 后台链异常由 processTurn 内部 catch 兜底
      });
    }),
    // 可变测试状态 (beforeEach 重置 — 普通 let 不被 clearAllMocks 重置)
    adapter: null as unknown,
    enabled: true,
    getPostHogServer: vi.fn(),
    createAdminClient: vi.fn(),
  };
});

vi.mock('@/lib/channels/registry', () => ({
  getAdapter: (platform: string) => (h.adapter && (h.adapter as { platform: string }).platform === platform ? h.adapter : null),
}));
vi.mock('@/lib/channels/config', () => ({
  channelsEnabled: () => h.enabled,
}));
vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: (key: string, ttl: number, failClosed?: boolean) => h.acquireLock(key, ttl, failClosed),
  releaseLock: (key: string) => h.releaseLock(key),
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...(args as [string, number, number])),
}));
vi.mock('@/lib/channels/identity', () => ({
  resolveOrCreateBinding: (msg: unknown) => h.resolveOrCreateBinding(msg),
  localeFromLanguageHint: (hint: string | undefined) => (hint && hint.toLowerCase().startsWith('zh') ? 'zh' : 'en'),
}));
vi.mock('@/lib/channel-chat/run-channel-turn', () => ({
  runChannelTurn: (input: unknown) => h.runChannelTurn(input),
}));
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: (p: Promise<unknown>) => h.fireAndForgetSafely(p),
}));
vi.mock('@/lib/posthog-server', () => ({
  getPostHogServer: () => h.getPostHogServer(),
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => h.createAdminClient(),
}));
vi.mock('@/lib/channels/telegram/adapter', () => ({})); // 侧效应注册模块 — 测试不走真注册
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from '../route';
import type { ChannelAdapter, InboundMessage } from '@/lib/channels/types';

function makeMsg(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    platform: 'telegram',
    platformUserId: '9001',
    chatRef: '9001',
    text: '帮我参谋要不要买冲锋衣',
    dedupId: '8001',
    languageHint: 'zh-CN',
    kind: 'text',
    ...overrides,
  };
}

function makeAdapter(overrides?: Partial<ChannelAdapter>): ChannelAdapter {
  return {
    platform: 'telegram',
    capabilities: { asyncPush: true },
    verify: vi.fn((_req: unknown, _raw: string): Promise<{ ok: boolean; reason?: 'bad_signature' | 'missing_header'; echoResponse?: string }> => Promise.resolve({ ok: true })),
    parse: vi.fn((_req: unknown, _raw: string) => Promise.resolve([makeMsg()])),
    sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
    ...overrides,
  };
}

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/channels/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ update_id: 8001, message: { message_id: 1, from: { id: 9001 }, chat: { id: 9001, type: 'private' }, date: 1761000000, text: '帮我参谋要不要买冲锋衣' } }),
  });
}

function makeReqWithUpdateId(updateId: number): NextRequest {
  return new NextRequest('http://localhost/api/channels/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ update_id: updateId, message: { message_id: updateId, from: { id: 9001 }, chat: { id: 9001, type: 'private' }, date: 1761000000, text: '帮我参谋要不要买冲锋衣' } }),
  });
}

function ctx(platform = 'telegram') {
  return { params: Promise.resolve({ platform }) };
}

beforeEach(() => {
  h.acquireLock.mockReset().mockImplementation(() => Promise.resolve(true));
  h.releaseLock.mockReset().mockResolvedValue(undefined);
  h.checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 20 });
  h.resolveOrCreateBinding.mockReset().mockResolvedValue({ userId: 'u-1', locale: 'zh', chatRef: '9001', created: false });
  h.runChannelTurn.mockReset().mockResolvedValue({ outcome: 'replied', replyText: '(reply)' });
  h.fireAndForgetSafely.mockClear();
  h.fireAndForgetSafely.mockImplementation((p: Promise<unknown>) => {
    void p.catch(() => {
      // safe to ignore: 后台链异常由 processTurn 内部 catch 兜底
    });
  });
  h.adapter = makeAdapter();
  h.enabled = true;
  h.getPostHogServer.mockReset().mockReturnValue({
    capture: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  });
  h.createAdminClient.mockReset().mockReturnValue({
    supabase: {
      rpc: vi.fn(),
      auth: { admin: { deleteUser: vi.fn() } },
    },
  });
});

describe('POST — /start CODE 绑定码（T11）', () => {
  function bindMsg(): InboundMessage {
    return makeMsg({ text: '/start ABCD2345', kind: 'command_start_payload', startPayload: 'ABCD2345', dedupId: '8300' });
  }

  function rpcResult(overrides: Record<string, unknown> = {}) {
    return { data: { ok: true, user_id: 'u-real', shadow_user_id: null, ...overrides }, error: null };
  }

  it('有效码 → 改绑成功文案 + 删除影子号 + 不进 LLM', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([bindMsg()])) });
    h.createAdminClient.mockReturnValue({ supabase: { rpc: vi.fn().mockResolvedValue(rpcResult({ shadow_user_id: 'u-shadow' })), auth: { admin: { deleteUser } } } });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(h.releaseLock).toHaveBeenCalled());
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    expect(sendMock.calls.map((c) => String(c[1])).join('|')).toContain('绑定成功');
    await vi.waitFor(() => expect(deleteUser).toHaveBeenCalledWith('u-shadow'));
    expect(h.resolveOrCreateBinding).not.toHaveBeenCalled();
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('无效或已过期/已消费码 → 明确拒绝文案，不进 LLM', async () => {
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([bindMsg()])) });
    h.createAdminClient.mockReturnValue({ supabase: { rpc: vi.fn().mockResolvedValue({ data: { ok: false }, error: null }), auth: { admin: { deleteUser: vi.fn() } } } });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(h.releaseLock).toHaveBeenCalled());
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    expect(sendMock.calls.map((c) => String(c[1])).join('|')).toContain('验证码无效或已过期');
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('RPC 异常 → 拒绝文案，不进 LLM', async () => {
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([bindMsg()])) });
    h.createAdminClient.mockReturnValue({ supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }), auth: { admin: { deleteUser: vi.fn() } } } });
    await POST(makeReq(), ctx());
    await vi.waitFor(() => expect(h.releaseLock).toHaveBeenCalled());
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    expect(sendMock.calls.map((c) => String(c[1])).join('|')).toContain('验证码无效或已过期');
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('binding 不存在由 RPC 插入；真人无影子号时不删除', async () => {
    const rpc = vi.fn().mockResolvedValue(rpcResult());
    const deleteUser = vi.fn();
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([bindMsg()])) });
    h.createAdminClient.mockReturnValue({ supabase: { rpc, auth: { admin: { deleteUser } } } });
    await POST(makeReq(), ctx());
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('claim_channel_binding', {
      p_code: 'ABCD2345', p_platform: 'telegram', p_platform_user_id: '9001', p_chat_ref: '9001', p_locale: 'zh',
    }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });
});

describe('POST — 快路径闸门', () => {
  it('未启用 CHANNELS_ENABLED → 503', async () => {
    h.enabled = false;
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(503);
    expect(h.fireAndForgetSafely).not.toHaveBeenCalled();
  });

  it('未知平台 → 404', async () => {
    const res = await POST(makeReq(), ctx('fakebook'));
    expect(res.status).toBe(404);
  });

  it('验签失败 → 401', async () => {
    h.adapter = makeAdapter({ verify: vi.fn((): Promise<{ ok: boolean; reason?: 'bad_signature' | 'missing_header' }> => Promise.resolve({ ok: false, reason: 'bad_signature' })) });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(401);
    expect((h.adapter as { parse: { mock: { calls: unknown[][] } } }).parse.mock.calls).toHaveLength(0);
  });
});

describe('POST — 200 语义', () => {
  it('正常消息 → 恒 200 ack + 后台回合全链 (welcome跳过→turn→sendMessage→finally释放锁)', async () => {
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    // waitUntil 被派发: processTurn + channel_* 遥测
    expect(h.fireAndForgetSafely).toHaveBeenCalledTimes(2);
    // 快路径三闸: 去重锁(24h) / 洪水限流(20/min) / 回合锁(90s failClosed)
    expect(h.acquireLock).toHaveBeenCalledWith('channel:upd:telegram:8001', 86400000, undefined);
    expect(h.checkRateLimit).toHaveBeenCalledWith('channel:flood:telegram:9001', 20, 60_000);
    expect(h.acquireLock).toHaveBeenCalledWith('channel:turn:telegram:9001', 90_000, true);
    // 后台链跑完: 既有 binding (created=false) → 无 welcome, 直接 LLM 回复
    await vi.waitFor(() => {
      expect(h.runChannelTurn).toHaveBeenCalledWith({ userId: 'u-1', locale: 'zh', text: makeMsg().text });
    });
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    await vi.waitFor(() => {
      expect(h.adapter && sendMock.calls.some((c) => c[0] === '9001' && c[1] === '(reply)')).toBe(true);
    });
    await vi.waitFor(() => {
      expect(h.releaseLock).toHaveBeenCalledWith('channel:turn:telegram:9001');
    });
  });

  it('回合遥测 → 收到消息与回复完成各发一条 channel_* 事件', async () => {
    const capture = vi.fn();
    h.getPostHogServer.mockReturnValue({ capture, flush: vi.fn().mockResolvedValue(undefined) });
    await POST(makeReq(), ctx());
    await vi.waitFor(() => {
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'u-1',
        event: 'channel_message_received',
        properties: { platform: 'telegram', locale: 'zh' },
      }));
    });
    await vi.waitFor(() => {
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({
        distinctId: 'u-1',
        event: 'channel_reply_sent',
        properties: expect.objectContaining({ platform: 'telegram', outcome: 'replied', locale: 'zh' }),
      }));
    });
  });

  it('首次绑定 (created=true) → 欢迎语先行, 再回合回复', async () => {
    h.resolveOrCreateBinding.mockResolvedValue({ userId: 'u-new', locale: 'zh', chatRef: '9001', created: true });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    await vi.waitFor(() => {
      const texts = sendMock.calls.map((c) => String(c[1]));
      expect(texts.length).toBeGreaterThanOrEqual(2);
      expect(texts[0]).toContain('欢迎');
      expect(texts[1]).toBe('(reply)');
    });
  });

  it('重放 (dedup 锁已持) → 200 静默丢, 不派发回合', async () => {
    h.acquireLock.mockImplementation((key: string) =>
      key.startsWith('channel:upd:') ? Promise.resolve(false) : Promise.resolve(true),
    );
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    expect(h.fireAndForgetSafely).not.toHaveBeenCalled();
    expect(h.checkRateLimit).not.toHaveBeenCalled();
  });

  it('洪水限流 → 200 + 轻提示, 不派发回合', async () => {
    h.checkRateLimit.mockImplementation((key: string) =>
      key.startsWith('channel:flood:')
        ? Promise.resolve({ allowed: false, remaining: 0 })
        : Promise.resolve({ allowed: true, remaining: 0 }),
    );
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    expect(h.fireAndForgetSafely).toHaveBeenCalledTimes(1); // 只有轻提示发送
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    await vi.waitFor(() => {
      expect(sendMock.calls.map((c) => String(c[1])).join('|')).toContain('发得太快');
    });
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('洪水连发 2 条 → 轻提示只发 1 条 (提示自身 1/min 限频, M2)', async () => {
    let noticeUsed = false;
    h.checkRateLimit.mockImplementation((key: string) => {
      if (key.startsWith('channel:flood:')) return Promise.resolve({ allowed: false, remaining: 0 });
      if (key.startsWith('channel:notice:')) {
        const allowed = !noticeUsed;
        noticeUsed = true;
        return Promise.resolve({ allowed, remaining: 0 });
      }
      return Promise.resolve({ allowed: true, remaining: 20 });
    });
    const res1 = await POST(makeReqWithUpdateId(8001), ctx());
    const res2 = await POST(makeReqWithUpdateId(8002), ctx());
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200); // 1 分钟内已发过提示 → 静默丢弃 (照常 ack)
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    await vi.waitFor(() => {
      expect(sendMock.calls.filter((c) => String(c[1]).includes('发得太快'))).toHaveLength(1);
    });
    // 提示闸参数锁定: 独立 notice 键 + 1 次 / 60s
    expect(h.checkRateLimit).toHaveBeenCalledWith('channel:notice:telegram:9001', 1, 60_000);
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('验签后解析抛错 → 恒 200, 不触闸门', async () => {
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.reject(new Error('adapter exploded'))) });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    await res.json();
    expect(h.acquireLock).not.toHaveBeenCalled();
  });

  it('锁忙 (在途回合) → 200 + 轻提示, 不进回合', async () => {
    h.acquireLock.mockImplementation((key: string) =>
      key.startsWith('channel:turn:') ? Promise.resolve(false) : Promise.resolve(true),
    );
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    expect(h.fireAndForgetSafely).toHaveBeenCalledTimes(1);
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    await vi.waitFor(() => {
      expect(sendMock.calls.map((c) => String(c[1])).join('|')).toContain('还在回答');
    });
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('解析零消息 (edited_message 等) → 200 静默丢, 不触锁', async () => {
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([])) });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    expect(h.acquireLock).not.toHaveBeenCalled();
    expect(h.fireAndForgetSafely).not.toHaveBeenCalled();
  });

  it('洪水轻提示发送也走 locale (languageHint en → 英文)', async () => {
    h.checkRateLimit.mockImplementation((key: string) =>
      key.startsWith('channel:flood:')
        ? Promise.resolve({ allowed: false, remaining: 0 })
        : Promise.resolve({ allowed: true, remaining: 0 }),
    );
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([makeMsg({ languageHint: 'en' })])) });
    await POST(makeReq(), ctx());
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    await vi.waitFor(() => {
      const sent = sendMock.calls.map((c) => String(c[1])).join('|');
      expect(sent).not.toContain('发得太快');
      expect(sent.length).toBeGreaterThan(0);
    });
  });
});

describe('POST — /start 命令（M3: 不进 LLM 回合）', () => {
  it('新用户 /start (created=true) → 欢迎语一条即终, 不触发 LLM 调用', async () => {
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([makeMsg({ text: '/start', kind: 'command_start', dedupId: '8100' })])) });
    h.resolveOrCreateBinding.mockResolvedValue({ userId: 'u-new', locale: 'zh', chatRef: '9001', created: true });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(h.releaseLock).toHaveBeenCalledWith('channel:turn:telegram:9001');
    });
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    const texts = sendMock.calls.map((c) => String(c[1]));
    expect(texts).toHaveLength(1); // 仅欢迎语, 无 LLM 回复
    expect(texts[0]).toContain('欢迎');
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });

  it('老用户重发 /start (created=false) → 重发欢迎语 (TG 惯例), 不触发 LLM 调用', async () => {
    h.adapter = makeAdapter({ parse: vi.fn(() => Promise.resolve([makeMsg({ text: '/start', kind: 'command_start', dedupId: '8101' })])) });
    h.resolveOrCreateBinding.mockResolvedValue({ userId: 'u-1', locale: 'zh', chatRef: '9001', created: false });
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(h.releaseLock).toHaveBeenCalledWith('channel:turn:telegram:9001');
    });
    const sendMock = (h.adapter as { sendMessage: { mock: { calls: unknown[][] } } }).sendMessage.mock;
    const texts = sendMock.calls.map((c) => String(c[1]));
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('欢迎');
    expect(h.runChannelTurn).not.toHaveBeenCalled();
  });
});

describe('GET', () => {
  it('telegram → 405 (Telegram 从不 GET)', async () => {
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(405);
  });

  it('未知平台 → 404', async () => {
    const res = await GET(makeReq(), ctx('fakebook'));
    expect(res.status).toBe(404);
  });
});
