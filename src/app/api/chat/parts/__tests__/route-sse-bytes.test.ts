/**
 * route-sse-bytes — chat/route.ts 拆相位 (Lane G 方案) 批 0 字节级兜底
 *
 * 职责: POST /api/chat 全链 (真实 route.ts + 真实 validateChatRequest + 真实 17 块
 * canned 链 + 真实 loadLettaTurnContext + 真实 SSE 包装栈, 仅 mock 外部边界) 的
 * 响应字节快照。拆相位 (刀 18-24) 前后此文件断言必须逐字节不变 — 这是
 * "纯结构性拆分"的机验核心 (方案 §5 第 3 层)。
 *
 * 覆盖 (简报三场景):
 * ① 纯聊天流式 — mock streamToAgent 产固定事件序列, 锁 SSE 全文字节与四件套 headers
 *    (真实过 wrapStreamWithAudit → withWebSearchWaitEvent → 三卡 null 直通包装栈)
 * ② 非流式 JSON — mock sendToAgent (经真实 processLettaResponse), 锁 JSON body 形状
 *    (reply/reasoning/toolCalls 原样透传 + 五个可选卡片字段缺省整体省略)
 * ③ stream 失败 SSE 错误流 — streamToAgent reject, 锁 catch 后错误事件字节
 *
 * 身份设计: 假登录用户 (非 guest) — route 已移除全局 agent fallback (ARCH fix),
 * userId 缺失时 getUserAgentId 被跳过 → 永远落 no-agent 503 分支, 走不到 P5 分发。
 * mock 面因此比简报预估多三件 (letta-agent-manager / letta-agent-tools / rag 等
 * DB 依赖 lib), 均为外部边界; mock 清单与既有 route.test.ts (POST 级先例) 同源。
 *
 * 降级说明: 无需降级 — 方案 §6 风险 8 担心的 vi.mock 模块图牵连未发生
 * (server-only 全局已 mock, letta 深依赖整模块替换), ① 流式字节序已直接锁住。
 *
 * 刻意不在本文件覆盖 (记入头注释防后人误补成脆弱测试):
 * - 挑战退款文案分支 (⑤) — refund-challenge-quota.test.ts 已有 12 用例,
 *   本文件不携带 challengeContext, 不触发 refund 路径
 * - 三卡命中组合 (绿色/复用/微挑战) — 卡片检测依赖 DB 装配, 由刀 23
 *   sse-pipeline 纯函数单测接棒 (方案 §4 批 3)
 *
 * 时序注: 全部 mock 无 Date/随机依赖, 字节输出确定性; userContent 用 'Hi'
 * 刻意避开 17 个 canned detector 与 shopping-clarify 命中词表。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
/* eslint-disable require-await -- vi.mock 工厂与 supabase fake 的 async 为 API 形状一致性, 与 route.test.ts 同惯例 */

vi.mock('@/lib/letta', () => ({
  // route.ts 消费: isLettaConfigured (P2 门) + streamToAgent (P5 流式)
  // parts/letta-response.ts 消费: sendToAgent (P5 非流式) — 真实 parts 层走此 mock
  isLettaConfigured: vi.fn(() => true),
  streamToAgent: vi.fn(),
  sendToAgent: vi.fn(async () => ({
    reply: 'Fixed reply from Letta',
    reasoning: 'step one',
    toolCalls: [{ name: 'symy_search', args: { query: 'milk tea' }, result: '[]' }],
  })),
}));
vi.mock('@/lib/supabase-api', () => ({
  // 假登录用户: supabase 为泛型 fake (所有表查询 data:null → 各装配段静默降级),
  // mergeCookies 双函数恒等 (cookie 合并语义不掺本测试的字节断言)
  createAuthenticatedClient: vi.fn(),
}));
vi.mock('@/lib/distributed-lock', () => ({
  // 小时限 + free-tier 日限双双放行 (route.test.ts 同款)
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/letta-agent-manager', () => ({
  // P4: per-user agent 解析恒成功 (route 已强制 per-user, 无 fallback)
  getUserAgentId: vi.fn(async () => 'agent-sse-bytes'),
}));
vi.mock('@/lib/letta-agent-tools', () => ({
  // P4 内动态 import 的幂等工具同步 — best-effort, 直接成功
  syncAgentSymyTools: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rag', () => ({
  retrieveUserContext: vi.fn(async () => ({ skipped: true, contexts: [] })),
  formatContextForPrompt: vi.fn(() => ''),
}));
vi.mock('@/lib/embed-backfill', () => ({
  triggerLazyBackfillIfNeeded: vi.fn(async () => undefined),
}));
vi.mock('@/lib/cultivation', () => ({
  getUserCultivationStage: vi.fn(async () => 'zhi_yu' as const),
  triggerReassessIfNeeded: vi.fn(async () => undefined),
}));
vi.mock('@/lib/user-hourly-rate', () => ({
  getUserHourlyRate: vi.fn(async () => 20),
}));
vi.mock('@/lib/supabase-admin', () => ({
  // facts 管道 store 通道: supabase:null → factsStore=undefined → 提取/装载全跳过
  createAdminClient: vi.fn(() => ({ supabase: null, error: null })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/ai-audit', () => ({
  logAIBehavior: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/posthog-server', () => ({
  captureLLMGeneration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: vi.fn((p: Promise<unknown>) => {
    p.catch(() => {});
  }),
}));

// blind-spot-map fetch (turn-context 内 3s 超时请求) 桩为固定失败 —
// 消除对 localhost:3000 的真实网络依赖, 保证字节输出与耗时的确定性
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

// @/lib/sse 与全部 parts/* 保持真实 — ③ 的错误事件字节与 ① 的四件套 headers
// 正是本测试要锁的对象, mock 掉等于没测
import { POST } from '../../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { sendToAgent, streamToAgent } from '@/lib/letta';

const encoder = new TextEncoder();

/** 固定事件序列 → Letta 原生 SSE 字节流 (streamToAgent 的返回形状) */
function lettaSseStream(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/** POST /api/chat 请求构造 (chat-validation.test 同款) */
function chatRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
    body: JSON.stringify(body),
  });
}

/** 假登录用户: 泛型 supabase fake — 所有表 maybeSingle → data:null (各段静默降级) */
function mockAuthedUser() {
  const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: { from },
    user: { id: 'sse-bytes-user' },
    error: null,
    mergeCookies: (res: Response) => res,
    mergeCookiesOnResponse: (res: Response) => res,
    pendingCookies: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthedUser();
});

describe('route-sse-bytes — ① 纯聊天流式 (真实包装栈直通)', () => {
  it('SSE 字节流 = mock 事件序列原样透传 (audit/websearch/三卡 null 包装零改写)', async () => {
    const events = [
      { type: 'reasoning', content: 'pondering' },
      { type: 'token', content: 'Hello' },
      { type: 'token', content: ' friend' },
      { type: 'done' },
    ];
    vi.mocked(streamToAgent).mockResolvedValue(lettaSseStream(events));

    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'Hi' }], locale: 'en', stream: true }));

    expect(res.status).toBe(200);
    // SSE_HEADERS 四件套 (真实 @/lib/sse)
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('connection')).toBe('keep-alive');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(streamToAgent).toHaveBeenCalledTimes(1);

    // 字节快照: 真实 wrapStreamWithAudit + withWebSearchWaitEvent + 三卡 null
    // 直通包装后的全文, 必须与 Letta 原生流逐字节一致
    const bytes = await res.text();
    expect(bytes).toBe(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
  });
});

describe('route-sse-bytes — ② 非流式 JSON', () => {
  it('JSON body 形状: reply/reasoning/toolCalls 透传, 未命中卡片字段整体省略', async () => {
    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'Hi' }], locale: 'en', stream: false }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    // 走了真实 processLettaResponse → mocked sendToAgent
    expect(sendToAgent).toHaveBeenCalledTimes(1);

    const body = await res.text();
    expect(body).toBe(
      '{"reply":"Fixed reply from Letta","reasoning":"step one","toolCalls":[{"name":"symy_search","args":{"query":"milk tea"},"result":"[]"}]}',
    );
  });
});

describe('route-sse-bytes — ③ stream 失败 SSE 错误流 (无挑战退款)', () => {
  it('streamToAgent reject → SSE 错误事件 + [DONE] (200 + 内联两件套 headers)', async () => {
    vi.mocked(streamToAgent).mockRejectedValue(new Error('Letta unavailable'));

    const res = await POST(chatRequest({ messages: [{ role: 'user', content: 'Hi' }], locale: 'en', stream: true }));

    // BUG-188: 流式失败必须回 SSE 错误流而非 JSON; 状态 200 (Response 无显式 status)
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    // 现状契约: 错误流 headers 为内联两件套, 非 SSE_HEADERS 四件套
    expect(res.headers.get('connection')).toBeNull();
    expect(res.headers.get('x-accel-buffering')).toBeNull();

    const bytes = await res.text();
    expect(bytes).toBe(
      'data: {"type":"error","content":"AI service temporarily unavailable. Please try again."}\n\n' +
        'data: [DONE]\n\n',
    );
  });
});
