import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  buildClosing: vi.fn(),
  buildSse: vi.fn(() => 'sse-close'),
  record: vi.fn(() => Promise.resolve()),
  shouldDefer: vi.fn(() => false),
  sanitize: vi.fn((s: string) => s.slice(0, 200)),
  buildPrompt: vi.fn(() => ({ kind: 'retro-answer' })),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../green-alt-retro-turn', () => ({
  buildGreenAltRetroClosingTurn: M.buildClosing,
  buildGreenAltRetroClosingSseStream: M.buildSse,
}));
vi.mock('../../green-alt-retro-persist', () => ({ recordGreenAltRetroEvent: M.record }));
vi.mock('../../green-alt-retro-gate', () => ({ shouldDeferGreenAltRetro: M.shouldDefer }));
vi.mock('@/lib/green-alt-retro', () => ({ sanitizeGreenAltRetroNote: M.sanitize, qualitativeKeywordsFromNote: vi.fn(() => []) }));

import { runGreenAltRetroAnswerBlock } from '../green-alt-retro-answer-block';

const baseInput = {
  userContent: '穿了三次就起球',
  locale: 'zh' as const,
  stream: false,
  userId: null,
  supabase: null,
  greenAltRetroAnswer: { entryId: 'e1' },
  fireAndForgetSafely: (p: Promise<unknown>) => { void p.catch(() => undefined); },
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * green-alt-retro-answer-block.ts (81行) — 绿色替代回访应答 (b 拆解件)。
 *
 * 锁定:
 * - 无应答意图 → null 未命中
 * - optionId 路径: closing turn (JSON/SSE 双形态)+事件持久化 fire-and-forget
 * - 自由文本路径: 让位 gate 命中 → null 让普通链路接管; 未让位 → sanitize+回落 Letta
 *   (response=null 但 answerContext 注入)
 */
describe('runGreenAltRetroAnswerBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildClosing.mockReturnValue({ reply: '干得漂亮' });
  });

  it('无 greenAltRetroAnswer → null 未命中', async () => {
    const r = await runGreenAltRetroAnswerBlock({ ...baseInput, greenAltRetroAnswer: null } as never);
    expect(r).toEqual({ response: null, answerContext: undefined });
    expect(M.buildClosing).not.toHaveBeenCalled();
  });

  it('optionId → closing turn JSON+fire-and-forget 持久化', async () => {
    const ff = vi.fn();
    const r = await runGreenAltRetroAnswerBlock({
      ...baseInput,
      greenAltRetroAnswer: { entryId: 'e1', optionId: 'quality_bad' },
      userId: 'u1',
      supabase: {},
      fireAndForgetSafely: ff,
    } as never);
    expect(r.response).toBeInstanceOf(Response);
    const body = await (r.response as Response).json();
    expect(body.reply).toBe('干得漂亮');
    expect(r.answerContext).toBeUndefined();
    expect(ff).toHaveBeenCalledTimes(1);
    expect(M.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', entryId: 'e1', reason: 'quality_bad' }));
  });

  it('optionId → SSE 形态', async () => {
    const r = await runGreenAltRetroAnswerBlock({
      ...baseInput,
      greenAltRetroAnswer: { entryId: 'e1', optionId: 'quality_bad' },
      stream: true,
    } as never);
    expect(r.response?.headers.get('content-type')).toBe('text/event-stream');
    expect(await r.response?.text()).toBe('sse-close');
  });

  it('closing turn 构不出 → null (未知 option)', async () => {
    M.buildClosing.mockReturnValueOnce(null);
    const r = await runGreenAltRetroAnswerBlock({
      ...baseInput,
      greenAltRetroAnswer: { entryId: 'e1', optionId: 'weird' },
    } as never);
    expect(r.response).toBeNull();
  });

  it('自由文本: 让位 gate 命中 → null 让位 (不持久化不追问)', async () => {
    M.shouldDefer.mockReturnValueOnce(true);
    const ff = vi.fn();
    const r = await runGreenAltRetroAnswerBlock({ ...baseInput, fireAndForgetSafely: ff } as never);
    expect(r).toEqual({ response: null, answerContext: undefined });
    expect(ff).not.toHaveBeenCalled();
    expect(M.shouldDefer).toHaveBeenCalledWith('穿了三次就起球', 'zh');
  });

  it('自由文本: 未让位 → sanitize+freeform 事件+answerContext 注入 (response 仍 null 回落 Letta)', async () => {
    const ff = vi.fn();
    M.sanitize.mockReturnValueOnce('净化的note');
    const r = await runGreenAltRetroAnswerBlock({
      ...baseInput,
      userId: 'u1',
      supabase: {},
      fireAndForgetSafely: ff,
    } as never);
    expect(r.response).toBeNull(); // 回落 Letta
    // 真 buildGreenAltRetroAnswerPrompt 产出 (evidenceLine+promptLine 契约锚)
    expect(r.answerContext?.evidenceLine).toContain('symy_green_alt_retro_answer:');
    expect(r.answerContext?.evidenceLine).toContain('净化的note');
    expect(r.answerContext?.promptLine).toContain('identity-affirming, no shame'); // 非羞耻红线进 prompt
    expect(r.answerContext?.promptLine).toContain('zero amounts'); // 零金额红线
    expect(ff).toHaveBeenCalledTimes(1);
    expect(M.record).toHaveBeenCalledWith(expect.objectContaining({ reason: 'freeform', note: '净化的note' }));
  });
});
