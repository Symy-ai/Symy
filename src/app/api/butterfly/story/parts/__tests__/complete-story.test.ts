/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * completeStorySession — batch92-c (wool v6 D5) 三处健壮性契约
 *
 * ① fireBumpIntimacy 副作用 reject 不传播 — session 已持久化 completed,
 *    副作用失败只 warn, 不把已成功的主结果翻成 error
 * ② 乐观锁失败的无锁重试显式 .eq('user_id') — 不依赖 RLS 兜底
 * ③ 总结 10s 超时获胜时 abort 上游 LLM 请求 — 竞态输家不取消会继续烧 token
 *
 * 另钉成功响应结构 (红线: 主流程语义零变化) 与乐观锁主更新契约。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = {
  summaryImpl: null as null | ((...args: unknown[]) => Promise<string>),
};

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: vi.fn(),
}));

vi.mock('@/lib/health-impact', () => ({
  createHealthEvent: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/companion-rpc', () => ({
  fireBumpIntimacy: vi.fn(async () => {}),
}));

vi.mock('@/features/butterfly/lib/story-engine', () => ({
  generateButterflySummary: vi.fn((...args: unknown[]) => mockState.summaryImpl!(...args)),
  clearButterflyContextFromAgent: vi.fn(async () => {}),
}));

import { completeStorySession, type CompleteStoryParams } from '../complete-story';
import { logger } from '@/lib/logger';
import { fireBumpIntimacy } from '@/lib/companion-rpc';
import { createHealthEvent } from '@/lib/health-impact';
import type { ButterflySession } from '@/features/butterfly/types';

const USER_ID = 'user-b92c';
const SESSION_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SUMMARY_OK = 'The dust settled.';
const DEFAULT_SUMMARY =
  'A single decision, like a butterfly\'s wing, changed everything — but not in the way anyone could have predicted.';

function sessionFixture(): ButterflySession {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    decisionType: 'bought',
    decisionDescription: 'limited-time course upsell',
    amount: 199,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 2,
    chapters: [
      { index: 1, title: 'The Message', content: 'It began with a notification.', tone: 'neutral', timeSpan: 'Day 1', hasChoice: false, createdAt: '2026-09-19T00:01:00Z' },
      { index: 2, title: 'Crossroads', content: 'Everything after the choice was different.', tone: 'twist', timeSpan: '3年后', hasChoice: true, createdAt: '2026-09-19T00:02:00Z' },
    ],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: '2026-09-19T00:00:00Z',
    updatedAt: '2026-09-19T00:00:00Z',
  };
}

function buildParams(supabase: unknown): CompleteStoryParams {
  const session = sessionFixture();
  return {
    supabase: supabase as CompleteStoryParams['supabase'],
    user: { id: USER_ID },
    session,
    sessionRowUpdatedAt: '2026-09-19T00:00:00Z',
    finalTone: 'hopeful',
    sessionForSummary: session,
    choicesForAgentClear: session.choices,
  };
}

interface RecordedUpdate {
  payload: Record<string, unknown> | null;
  eqArgs: Array<[string, unknown]>;
  terminatedVia: 'maybeSingle' | 'then';
}

/**
 * butterfly_sessions 更新链 mock：每次 .from() 产出一条独立链并记录
 * update payload / eq 参数 / 终止方式。主更新以 maybeSingle 终止（返回
 * opts.firstUpdate，默认命中），无锁重试以 await 链本身（then）终止。
 */
function makeSupabase(opts: { firstUpdate?: { data: unknown } } = {}) {
  const updates: RecordedUpdate[] = [];
  let settled = 0;
  const supabase = {
    from: vi.fn(() => {
      const record: RecordedUpdate = { payload: null, eqArgs: [], terminatedVia: 'then' };
      const chain: Record<string, unknown> = {
        update: vi.fn((payload: Record<string, unknown>) => {
          record.payload = payload;
          return chain;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          record.eqArgs.push([column, value]);
          return chain;
        }),
        select: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          settled += 1;
          record.terminatedVia = 'maybeSingle';
          updates.push(record);
          return settled === 1 ? (opts.firstUpdate ?? { data: { id: SESSION_ID } }) : { data: null };
        }),
        then: (
          onFulfilled?: (v: { data: null; error: null }) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => {
          settled += 1;
          record.terminatedVia = 'then';
          updates.push(record);
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        },
      };
      return chain;
    }),
  };
  return { supabase, updates };
}

describe('completeStorySession — batch92-c (D5) robustness contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.summaryImpl = async () => SUMMARY_OK;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('① fireBumpIntimacy reject 不传播 — 结果仍成功返回且结构不变', async () => {
    vi.mocked(fireBumpIntimacy).mockRejectedValueOnce(new Error('intimacy rpc down'));
    const { supabase, updates } = makeSupabase();

    const result = await completeStorySession(buildParams(supabase));

    expect(result.summary).toBe(SUMMARY_OK);
    expect(result.finalTone).toBe('hopeful');
    expect(result.storyCompleteData).toEqual({
      finalTone: 'hopeful',
      totalChapters: 2,
      butterflyEffect: SUMMARY_OK,
    });
    expect(fireBumpIntimacy).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('bump intimacy'),
      expect.any(Error),
    );
    expect(updates).toHaveLength(1);
  });

  it('② 乐观锁失败的无锁重试显式限定 user_id', async () => {
    const { supabase, updates } = makeSupabase({ firstUpdate: { data: null } });

    await completeStorySession(buildParams(supabase));

    expect(updates).toHaveLength(2);
    expect(updates[1].terminatedVia).toBe('then');
    const retryEq = Object.fromEntries(updates[1].eqArgs);
    expect(retryEq['id']).toBe(SESSION_ID);
    expect(retryEq['user_id']).toBe(USER_ID);
  });

  it('③ 总结 10s 超时获胜时 abort 上游 LLM 请求', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    mockState.summaryImpl = (_session: unknown, _userId: unknown, _context: unknown, signal: unknown) => {
      capturedSignal = signal as AbortSignal | undefined;
      return new Promise<string>((_resolve, reject) => {
        (signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new Error('Aborted')));
      });
    };
    const { supabase, updates } = makeSupabase();

    const pending = completeStorySession(buildParams(supabase));
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(true);
    expect(result.summary).toBe(DEFAULT_SUMMARY);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.butterfly_effect).toBe(DEFAULT_SUMMARY);
  });

  it('正常路径: 主更新命中不重试, LLM 成功不 abort', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockState.summaryImpl = (_session: unknown, _userId: unknown, _context: unknown, signal: unknown) => {
      capturedSignal = signal as AbortSignal | undefined;
      return Promise.resolve(SUMMARY_OK);
    };
    const { supabase, updates } = makeSupabase();

    const result = await completeStorySession(buildParams(supabase));

    expect(result.summary).toBe(SUMMARY_OK);
    expect(updates).toHaveLength(1);
    expect(updates[0].terminatedVia).toBe('maybeSingle');
    expect(updates[0].payload).toEqual({
      status: 'completed',
      butterfly_effect: SUMMARY_OK,
      final_tone: 'hopeful',
    });
    const primaryEq = Object.fromEntries(updates[0].eqArgs);
    expect(primaryEq['id']).toBe(SESSION_ID);
    expect(primaryEq['updated_at']).toBe('2026-09-19T00:00:00Z');
    expect(capturedSignal?.aborted).toBe(false);
  });

  it('LLM 提前失败 (未超时): 回落默认总结且不误 abort', async () => {
    mockState.summaryImpl = () => Promise.reject(new Error('letta down'));
    const { supabase, updates } = makeSupabase();

    const result = await completeStorySession(buildParams(supabase));

    expect(result.summary).toBe(DEFAULT_SUMMARY);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.butterfly_effect).toBe(DEFAULT_SUMMARY);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Summary generation failed'),
      expect.any(Error),
    );
  });

  it('完成奖励事件照常触发 (与 D5 无关的行为不被修复波及)', async () => {
    const { supabase } = makeSupabase();

    await completeStorySession(buildParams(supabase));

    expect(createHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'butterfly_completed',
        triggerId: `bf-complete:${SESSION_ID}`,
      }),
    );
  });
});
