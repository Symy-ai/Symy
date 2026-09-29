/**
 * agent-unavailable-response — 第22刀相位级单测
 *
 * 搬移自 route.ts:451-476 (no-agent 503 出口)。refund 语义已有
 * refund-challenge-quota.test.ts 12 用例打底 (helper 本体), 本文件锁
 * 出口层的双通道形状: 退款分文案 (成功/失败) + 无挑战文案 × SSE/JSON 双通道。
 *
 * mock 面: refund-challenge-quota helper (vi.mock 本地 parts 文件 — 本测试
 * 的对象是"出口如何消费退款结果", 不是退款本身) + logger (vi.spyOn 断言)。
 * mergeCookies/mergeCookiesOnResponse 恒等透传, 字节断言不受 cookie 合并干扰。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentUnavailableResponse } from '../agent-unavailable-response';

vi.mock('../refund-challenge-quota', () => ({
  refundChallengeQuota: vi.fn(),
}));

import { refundChallengeQuota } from '../refund-challenge-quota';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';

const identity = (res: Response) => res;

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-no-agent',
    validChallengeContext: undefined,
    stream: false,
    mergeCookies: identity,
    mergeCookiesOnResponse: identity,
    ...overrides,
  } as Parameters<typeof buildAgentUnavailableResponse>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agent-unavailable-response — 无挑战 (不退款)', () => {
  it('JSON 通道: 503 + 通用初始化文案, 不触发退款', async () => {
    const res = await buildAgentUnavailableResponse(baseInput());

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"error":"AI is still initializing. Please try again in a moment."}');
    expect(refundChallengeQuota).not.toHaveBeenCalled();
  });

  it('SSE 通道: 单条 error 事件 + SSE_HEADERS 四件套', async () => {
    const res = await buildAgentUnavailableResponse(baseInput({ stream: true }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('connection')).toBe('keep-alive');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(await res.text()).toBe(
      'data: {"type":"error","content":"AI is still initializing. Please try again in a moment."}\n\n',
    );
    expect(refundChallengeQuota).not.toHaveBeenCalled();
  });

  it('userId 缺失 + 有挑战上下文: 不退款, 文案落 contact-support 分支 (现状语义)', async () => {
    // 现状: refund 门 = userId && validChallengeContext, userId 缺失即不退;
    // 文案门只看 validChallengeContext → 挑战中 userId 缺失显示 contact-support 变体
    const res = await buildAgentUnavailableResponse(
      baseInput({ userId: undefined, validChallengeContext: { itemName: 'x', amount: 1, challengeId: 'c1' } }),
    );

    expect(await res.text()).toBe(
      '{"error":"AI is still initializing. Please try again in a moment. (If your See-it quota was consumed, please contact support.)"}',
    );
    expect(refundChallengeQuota).not.toHaveBeenCalled();
  });
});

describe('agent-unavailable-response — 有挑战: 退款分文案 (Round 120 audit fix)', () => {
  const challengeCtx = { itemName: 'milk tea', amount: 25, challengeId: 'ch-1' };

  it('退款成功 → JSON 503 文案含 "was refunded"', async () => {
    vi.mocked(refundChallengeQuota).mockResolvedValue({ refunded: true, previousCount: 3 });

    const res = await buildAgentUnavailableResponse(baseInput({ validChallengeContext: challengeCtx }));

    expect(refundChallengeQuota).toHaveBeenCalledWith('user-no-agent');
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(
      '{"error":"AI is still initializing. Your See-it was refunded — please try again in a moment."}',
    );
  });

  it('退款失败 → JSON 503 文案改为 contact support (不撒谎), logger.error 被调', async () => {
    vi.mocked(refundChallengeQuota).mockResolvedValue({ refunded: false, error: 'cas_lost_concurrent_refund' });

    const res = await buildAgentUnavailableResponse(baseInput({ validChallengeContext: challengeCtx }));

    expect(await res.text()).toBe(
      '{"error":"AI is still initializing. Please try again in a moment. (If your See-it quota was consumed, please contact support.)"}',
    );
    expect(logger.error).toHaveBeenCalledWith(
      '[Chat API] Refund FAILED for user (AI unavailable):',
      'user-no-agent',
      'cas_lost_concurrent_refund',
    );
  });

  it('退款成功 → SSE 通道 error 事件含退款文案 (批3刀22新增 SSE 断言)', async () => {
    vi.mocked(refundChallengeQuota).mockResolvedValue({ refunded: true });

    const res = await buildAgentUnavailableResponse(
      baseInput({ validChallengeContext: challengeCtx, stream: true }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await res.text()).toBe(
      'data: {"type":"error","content":"AI is still initializing. Your See-it was refunded — please try again in a moment."}\n\n',
    );
  });

  it('退款失败 → SSE 通道 error 事件含 contact support 文案', async () => {
    vi.mocked(refundChallengeQuota).mockResolvedValue({ refunded: false, error: 'db_read_error: boom' });

    const res = await buildAgentUnavailableResponse(
      baseInput({ validChallengeContext: challengeCtx, stream: true }),
    );

    expect(await res.text()).toBe(
      'data: {"type":"error","content":"AI is still initializing. Please try again in a moment. (If your See-it quota was consumed, please contact support.)"}\n\n',
    );
  });
});

describe('agent-unavailable-response — no-agent 事实日志', () => {
  it('logger.error 记录 No per-user agent (排障锚点)', async () => {
    await buildAgentUnavailableResponse(baseInput());
    expect(logger.error).toHaveBeenCalledWith('[Chat API] No per-user agent available for user:', 'user-no-agent');
  });
});
