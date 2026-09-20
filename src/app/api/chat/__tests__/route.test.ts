/**
 * Chat API Route Tests — validation + error path tests
 *
 * 🔧 架构优化 Round 54: 测试 chat API 路由 (Finding 3)
 */
/* eslint-disable require-await -- test mocks use async for API consistency */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({ createAuthenticatedClient: vi.fn() }));
vi.mock('@/lib/letta', () => ({ isLettaConfigured: vi.fn(() => true), sendToAgent: vi.fn(), streamToAgent: vi.fn() }));
vi.mock('@/lib/distributed-lock', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/letta-agent-manager', () => ({ getUserAgentId: vi.fn(async () => 'test-agent-id') }));
vi.mock('@/lib/ai-audit', () => ({ logAIBehavior: vi.fn() }));
vi.mock('@/lib/admin-audit', () => ({ fireAndForgetSafely: vi.fn() }));
vi.mock('@/lib/rag', () => ({ retrieveUserContext: vi.fn(async () => ''), formatContextForPrompt: vi.fn(() => '') }));
vi.mock('@/lib/embed-backfill', () => ({ triggerLazyBackfillIfNeeded: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cultivation', () => ({ getUserCultivationStage: vi.fn(async () => 'zhi_yu' as const), triggerReassessIfNeeded: vi.fn() }));
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: vi.fn(async () => 20) }));
vi.mock('@/lib/sse', () => ({ sendSSEData: vi.fn(), closeSSE: vi.fn(), SSE_HEADERS: { 'Content-Type': 'text/event-stream' } }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/app/api/chat/parts/context-signal-turn', () => ({
  buildContextSignalTurn: vi.fn(() => ({
    reply: 'context signal',
    contextSignal: { signal: 'wear_replace', words: [{ id: 'wear_replace.broken', zh: '坏了', en: 'broken' }] },
    contextTrust: { level: 'moderate' },
  })),
  buildContextSignalSseStream: vi.fn(() => ''),
}));
vi.mock('@/app/api/chat/parts/letta-response', () => ({
  processLettaResponse: vi.fn(async () => ({ reply: 'test reply' })),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/posthog-server', () => ({ captureLLMGeneration: vi.fn() }));
vi.mock('@/lib/letta-agent-tools', () => ({ syncAgentSymyTools: vi.fn(async () => undefined) }));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';
import { buildContextSignalTurn } from '@/app/api/chat/parts/context-signal-turn';
import { isLettaConfigured } from '@/lib/letta';
import { checkRateLimit } from '@/lib/distributed-lock';

// ⏱️ 全链路纯 mock 本应毫秒级, 但共享机高负载 + 全量并行时模块求值/微任务调度
//    可能远超默认 5s (gate 10:23 实录: context trust 用例 5s 超时)——文件级放宽到 20s,
//    断言不变。
vi.setConfig({ testTimeout: 20_000 });

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockAuthSuccess() {
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { agent_id: 'test-agent-id', plan: 'premium' } })),
      })),
    })),
  }));
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: { from: mockFrom } as any,
    user: { id: 'test-user' },
    error: null,
    mergeCookies: (res: Response) => res as any,
    mergeCookiesOnResponse: (res: Response) => res as any,
  } as any);
}

function mockAuthFail() {
  vi.mocked(createAuthenticatedClient).mockResolvedValue({
    supabase: null,
    user: null,
    error: 'Not authenticated',
    mergeCookies: (res: Response) => res as any,
  } as any);
}

describe('POST /api/chat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when not authenticated (after rate limit check)', async () => {
    mockAuthFail();
    const req = makeRequest({ messages: [{ role: 'user', content: 'hello' }], stream: true });
    const res = await POST(req);
    // Route checks auth after rate limit, so 401 comes after rate limit passes
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (missing messages)', async () => {
    mockAuthSuccess();
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid messages format', async () => {
    mockAuthSuccess();
    const req = makeRequest({ messages: 'not-an-array' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockAuthSuccess();
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const req = makeRequest({ messages: [{ role: 'user', content: 'hello' }], stream: true });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('returns 503 when Letta is not configured', async () => {
    mockAuthSuccess();
    vi.mocked(isLettaConfigured).mockReturnValue(false);
    const req = makeRequest({ messages: [{ role: 'user', content: 'hello' }], stream: true });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it('loads persistent context trust evidence and suppresses corrected same-signal cards', async () => {
    mockAuthSuccess();
    vi.mocked(isLettaConfigured).mockReturnValue(true);
    const occurredAt = new Date('2026-01-01T00:00:00Z').toISOString();
    const history = [{ event_type: 'challenge_completed', metadata: { category: 'clothing' }, created_at: occurredAt }];
    const correction = [{ event_type: 'manual_adjustment', metadata: { source: 'context_trust_correction', signalId: 'wear_replace.broken', reason: 'expired' }, created_at: occurredAt }];
    const query: Record<string, unknown> & { then?: unknown } = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async (count: number) => ({ data: count === 24 ? history : correction, error: null })),
    };
    const from = vi.fn((table: string) => (
      table === 'shopping_facts'
        ? { ...query, eq: vi.fn(async () => ({ data: [], error: null })) }
        : query
    ));
    vi.mocked(createAdminClient).mockImplementation(() => ({ supabase: { from } } as any));

    const response = await POST(makeRequest({
      messages: [{ role: 'user', content: '我想买新手机，屏幕坏了' }],
      stream: false,
      greenPref: 'on',
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.contextSignal.words[0].id).toBe('wear_replace.broken');
    expect(payload.contextTrust).toBeUndefined();
    expect(from).toHaveBeenCalledWith('health_events');
    expect(vi.mocked(buildContextSignalTurn).mock.calls.at(-1)?.[0]).toMatchObject({
      history: [{ description: 'clothing', occurredAt }],
      correction: { kind: 'expired', topic: 'wear_replace.broken', occurredAt },
    });
  });

  // 🌱 batch68-a 绿色采纳后复盘 — route 级验收
  it('绿色采纳复盘: 采纳后下一轮轻量消息触发一次追问轮 (SSE green_alt_retro 事件)', async () => {
    mockAuthSuccess();
    const response = await POST(makeRequest({
      messages: [{ role: 'user', content: '哈哈不错' }],
      stream: true,
      greenPref: 'on',
      greenAltRetroPending: { entryId: 'milk_tea' },
    }));
    expect(response.status).toBe(200);
    const events: Array<{ type: string; greenAltRetro?: { entryId: string } }> = [];
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split('\n')) {
        if (line.startsWith('data: ') && line.length > 6) {
          try { events.push(JSON.parse(line.slice(6))); } catch { /* 分块截断忽略 */ }
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    }
    expect(events[0].type).toBe('green_alt_retro');
    expect(events[0].greenAltRetro?.entryId).toBe('milk_tea');
    expect(events[events.length - 1].type).toBe('done');
  });

  it('绿色采纳复盘: 选项回答给 canned 收束轮 (零金额), 不走 Letta', async () => {
    mockAuthSuccess();
    const response = await POST(makeRequest({
      messages: [{ role: 'user', content: '手头已有' }],
      stream: false,
      locale: 'zh',
      greenPref: 'on',
      greenAltRetroAnswer: { entryId: 'milk_tea', optionId: 'already_have' },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.reply).toContain('手头');
    expect(payload.reply).not.toMatch(/\$\s?\d|\d+\s*元/);
    expect(payload.greenAltRetro).toBeUndefined();
  });

  it('绿色采纳复盘: 下一轮是新购买意图时不触发追问, 普通链路接管', async () => {
    mockAuthSuccess();
    vi.mocked(isLettaConfigured).mockReturnValue(true);
    const query: Record<string, unknown> & { then?: unknown } = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => ({ data: [], error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    vi.mocked(createAdminClient).mockImplementation(() => ({ supabase: { from: vi.fn(() => query) } } as any));
    const response = await POST(makeRequest({
      messages: [{ role: 'user', content: '想买一个新的水杯' }],
      stream: false,
      greenPref: 'on',
      greenAltRetroPending: { entryId: 'milk_tea' },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.reply).toBe('test reply');
    expect(payload.greenAltRetro).toBeUndefined();
  });

  it('绿色采纳复盘: 下一轮是守护脉搏问句时不触发追问, 脉搏卡接管本轮 (batch70-a)', async () => {
    mockAuthSuccess();
    const response = await POST(makeRequest({
      messages: [{ role: 'user', content: '我什么时候最容易冲动' }],
      stream: false,
      greenPref: 'on',
      greenAltRetroPending: { entryId: 'milk_tea' },
    }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.greenAltRetro).toBeUndefined();
    expect(payload.guardPulseCard).toBeDefined();
  });
});
