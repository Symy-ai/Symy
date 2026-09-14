/**
 * Anonymous Chat API Tests
 *
 * 🔧 2026-07-20 (P0 fix): 匿名试用功能测试
 *
 * 测试覆盖:
 * 1. 认证: 不需要登录 (与 /api/chat 不同)
 * 2. 限流: 3 次/天, 超限返回 429
 * 3. 验证: messages 必填, challengeContext 可选
 * 4. 错误处理: ZAI SDK 不可用时返回 503
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/zai-sdk-types', () => ({
  callZAIChatCompletionStream: vi.fn(),
}));

vi.mock('@/lib/z-ai-config', () => ({
  isZAIAvailable: vi.fn(),
}));

vi.mock('@/lib/sse', () => ({
  sendSSEData: vi.fn(),
  closeSSE: vi.fn(),
  SSE_HEADERS: { 'Content-Type': 'text/event-stream' },
}));

import { checkRateLimit } from '@/lib/distributed-lock';
import { callZAIChatCompletionStream } from '@/lib/zai-sdk-types';
import { isZAIAvailable } from '@/lib/z-ai-config';

// Helper: create mock NextRequest
function createMockRequest(body: unknown): NextRequest {
  return {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '192.168.1.1',
    }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as NextRequest;
}

describe('Anonymous Chat API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isZAIAvailable).mockReturnValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 3 });
    vi.mocked(callZAIChatCompletionStream).mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"content","content":"Hello"}\n\n'));
          controller.close();
        },
      })
    );
  });

  it('returns 200 with fallback canned reply when ZAI is not available', async () => {
    // 🔧 P0-2 fix: ZAI SDK 不可用时用 fallback canned reply, 不返回 503
    //   旧代码: 返回 503 → 前端显示 "Symy is quiet" → 新用户首体验崩坏
    //   修复: 用 buildFallbackReply 生成 mirror 反思, 通过 SSE 流式返回
    vi.mocked(isZAIAvailable).mockReturnValue(false);
    const req = createMockRequest({
      messages: [{ role: 'user', content: 'I want to buy AirPods' }],
      challengeContext: { itemName: 'AirPods', amount: 249 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 });
    const req = createMockRequest({
      messages: [{ role: 'user', content: 'I want to buy AirPods' }],
      challengeContext: { itemName: 'AirPods', amount: 249 },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('returns 400 when messages is empty', async () => {
    const req = createMockRequest({
      messages: [],
      challengeContext: { itemName: 'AirPods', amount: 249 },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts request without challengeContext (free chat mode)', async () => {
    // challengeContext is optional — user may just chat without a specific challenge
    const req = createMockRequest({
      messages: [{ role: 'user', content: 'I want to buy AirPods' }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns SSE stream on success', async () => {
    const req = createMockRequest({
      messages: [{ role: 'user', content: 'I want to buy AirPods' }],
      challengeContext: { itemName: 'AirPods', amount: 249 },
      locale: 'en',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('X-Anonymous-Remaining')).toBe('2');
  });
});
