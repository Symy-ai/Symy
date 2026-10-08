import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：全部外部依赖 ———
const streamChapterStoryMock = vi.fn();
const generateChoiceOptionsMock = vi.fn();
vi.mock('@/features/butterfly/lib/story-engine', () => ({
  streamChapterStory: (...a: unknown[]) => streamChapterStoryMock(...(a as [])),
  generateChoiceOptions: (...a: unknown[]) => generateChoiceOptionsMock(...(a as [])),
}));
const generateIllustrationMock = vi.fn();
const persistIllustrationUrlMock = vi.fn();
const generateSceneIllustrationsMock = vi.fn();
const regenerateWithContentMock = vi.fn();
vi.mock('@/features/butterfly/lib/illustration-engine', () => ({
  generateIllustration: (...a: unknown[]) => generateIllustrationMock(...(a as [])),
  persistIllustrationUrl: (...a: unknown[]) => persistIllustrationUrlMock(...(a as [])),
  generateSceneIllustrations: (...a: unknown[]) => generateSceneIllustrationsMock(...(a as [])),
  regenerateWithContent: (...a: unknown[]) => regenerateWithContentMock(...(a as [])),
}));
vi.mock('@/lib/json-helpers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/json-helpers')>();
  return real;
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/admin-audit', () => ({
  // 测试直接观察 fireAndForget 的 promise, 不走真 waitUntil
  fireAndForgetSafely: vi.fn((p: Promise<unknown>) => { p?.catch?.(() => {}); }),
}));
vi.mock('@/lib/sse', () => ({
  sendSSEData: vi.fn((_controller: { __events: unknown[] }, event: unknown) => {
    _controller.__events.push(event);
  }),
  closeSSE: vi.fn((_controller: unknown) => {}),
}));
vi.mock('@/lib/feature-flags', () => ({
  featureFlags: { butterflyIllustrationEnabled: false },
}));
const completeStorySessionMock = vi.fn();
vi.mock('../complete-story', () => ({
  completeStorySession: (...a: unknown[]) => completeStorySessionMock(...(a as [])),
}));
vi.mock('@/lib/health-impact', () => ({
  createHealthEvent: vi.fn(() => Promise.resolve()),
}));

// supabase-admin 动态 import
const adminRpcMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => Promise.resolve({ supabase: { rpc: adminRpcMock } })),
}));

import { streamStoryChapter } from '../stream-chapter';

// ——— 测试基建 ———
function makeStream(events: string[] = []) {
  const enc = new TextEncoder();
  const chunks = events.map(e => enc.encode(e));
  return new ReadableStream<Uint8Array>({
    start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); },
  });
}

function makeController() {
  return { __events: [] as unknown[] } as unknown as ReadableStreamDefaultController<Uint8Array>;
}

function chapterEvent(text: string) {
  return `data: ${JSON.stringify({ type: 'chapter_text', data: { text } })}\n\n`;
}

const baseParams = {
  controller: makeController(),
  supabase: {} as never,
  user: { id: 'u-1' },
  session: { id: 's-1', chapters: [], choices: [], context: 'ctx', currentChapter: 1, status: 'active' } as never,
  sessionRowUpdatedAt: '2026-10-09T00:00:00Z',
  nextChapter: { index: 1, title: 'Ch1', tone: 'neutral', timeSpan: 'now', hasChoice: false },
  isLight: false,
  isFirstChapter: true,
  outline: { version: 1, chapters: [{ index: 1, title: 'Ch1', tone: 'neutral', timeSpan: 'now', hasChoice: false }, { index: 2, title: 'Ch2', tone: 'warm', timeSpan: '+1y', hasChoice: true }], endingHint: 'hope' },
  decisionType: 'bought' as const,
  decisionDesc: 'coffee machine',
  signal: undefined,
  locale: 'zh',
};

const ev = (p: unknown) => ((p as { controller: { __events: unknown[] } }).controller.__events) as Array<{ type: string; data: Record<string, unknown> }>;
const types = (p: unknown) => ev(p).map(e => e.type);

describe('streamStoryChapter (770行 SSE 章节流核心)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminRpcMock.mockResolvedValue({ data: { success: true }, error: null });
    streamChapterStoryMock.mockResolvedValue(makeStream([chapterEvent('The machine hummed in the kitchen. ||| Years later, the garden bloomed.')]));
    generateChoiceOptionsMock.mockResolvedValue({ prompt: 'Which path?', options: [{ id: 'A', label: 'a' }, { id: 'B', label: 'b' }] });
    generateIllustrationMock.mockResolvedValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('正常流: 首章 outline → chapter_start → chapter_text (含场景分隔符清理) → chapter_end → close', async () => {
    const p = { ...baseParams, controller: makeController() };
    await streamStoryChapter(p as never);
    const seq = types(p);
    expect(seq[0]).toBe('outline_generated');
    expect(seq[1]).toBe('chapter_start');
    expect(seq).toContain('chapter_text');
    expect(seq[seq.length - 1]).toBe('chapter_end');
    // 分隔符 ===CHAPTER=== 清理: 场景间 ||| 保留, 无 ===CHAPTER=== 泄漏
    const textEvents = ev(p).filter(e => e.type === 'chapter_text');
    const allText = textEvents.map(e => (e.data as { text: string }).text).join('');
    expect(allText).toContain('The machine hummed');
    expect(allText).not.toContain('===CHAPTER');
  });

  it('非首章 + 大纲 v1: 不发 outline (only first chapter)', async () => {
    const p = { ...baseParams, controller: makeController(), isFirstChapter: false };
    await streamStoryChapter(p as never);
    expect(types(p)).not.toContain('outline_generated');
    expect(types(p)).toContain('chapter_start');
  });

  it('非首章 + 大纲 v2: 发 outline_updated (C4 选择重生成)', async () => {
    const p = { ...baseParams, controller: makeController(), isFirstChapter: false, outline: { ...baseParams.outline, version: 2 } };
    await streamStoryChapter(p as never);
    expect(types(p)).toContain('outline_updated');
    expect(types(p)).not.toContain('outline_generated');
  });

  it('章节跨 chunk 截断: lineBuffer 拼接保证完整事件 (C1 fix)', async () => {
    const enc = new TextEncoder();
    const raw = chapterEvent('aaaa') + chapterEvent('bbbb');
    const mid = Math.floor(raw.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode(raw.slice(0, mid))); c.enqueue(enc.encode(raw.slice(mid))); c.close(); },
    });
    streamChapterStoryMock.mockResolvedValueOnce(stream);
    const p = { ...baseParams, controller: makeController() };
    await streamStoryChapter(p as never);
    const textEvents = ev(p).filter(e => e.type === 'chapter_text');
    // 两事件文本共 8 字符 < DELIM_SAFE_MARGIN(50) → 缓冲到 final flush 合并发送
    expect(textEvents.length).toBe(1);
    expect((textEvents[0].data as { text: string }).text).toBe('aaaabbbb');
  });

  it('hasChoice: choice_prompt 事件 + RPC 带 choices (append_chapter)', async () => {
    const p = { ...baseParams, controller: makeController(), nextChapter: { ...baseParams.outline.chapters[1], index: 2 } };
    await streamStoryChapter(p as never);
    expect(types(p)).toContain('choice_prompt');
    const choiceEv = ev(p).find(e => e.type === 'choice_prompt');
    expect((choiceEv!.data as { prompt: string }).prompt).toBe('Which path?');
    // RPC: p_choices 非空 (choices 增量)
    expect(adminRpcMock).toHaveBeenCalledWith('append_chapter', expect.objectContaining({ p_session_id: 's-1', p_current_chapter: 2 }));
  });

  it('AI 空响应: 重试 2 次 + 全空发 error (AI-RETRY)', async () => {
    streamChapterStoryMock.mockReset();
    // 真 0-chunk: 空流立即 close (无任何字节) — storyChunkCount=0 才触发 AI-RETRY
    streamChapterStoryMock.mockImplementation(() => Promise.resolve(makeStream([]))); // 每次尝试新流实例
    const p = { ...baseParams, controller: makeController() };
    await streamStoryChapter(p as never);
    // 1 + 2 retries = 3 次调用
    expect(streamChapterStoryMock).toHaveBeenCalledTimes(3);
    const errEv = ev(p).find(e => e.type === 'error');
    expect((errEv!.data as { message: string }).message).toContain('empty response');
  });

  it('choice 生成超时: 降级默认选择 (N69)', async () => {
    generateChoiceOptionsMock.mockImplementation(() => new Promise(() => {})); // 永不 resolve
    const p = { ...baseParams, controller: makeController(), nextChapter: { ...baseParams.outline.chapters[1], index: 2 } };
    // choice 10s 超时 — 测试不能等 10s; fake timers? 里面的 setTimeout 15s/10s...
    // 用 Promise.race 的 reject 路径: mock 10s timer 无法跳过 → 用 vi.useFakeTimers
    vi.useFakeTimers();
    const runP = streamStoryChapter(p as never);
    // 推进 10s 触发 choice timeout
    await vi.advanceTimersByTimeAsync(10_500);
    await runP;
    vi.useRealTimers();
    const choiceEv = ev(p).find(e => e.type === 'choice_prompt');
    expect((choiceEv!.data as { prompt: string }).prompt).toBe('Which path do you take?');
  });

  it('RPC 失败: error 事件 + close (409 修复后的失败分支)', async () => {
    adminRpcMock.mockResolvedValueOnce({ data: null, error: { message: 'append failed' } });
    const p = { ...baseParams, controller: makeController() };
    await streamStoryChapter(p as never);
    const errEv = ev(p).find(e => e.type === 'error');
    expect((errEv!.data as { message: string }).message).toContain('Failed to save chapter');
  });

  it('最后一章: story_complete + completeStorySession 调用', async () => {
    completeStorySessionMock.mockResolvedValue({ storyCompleteData: { finalTone: 'hopeful', butterflyEffect: 'test', totalChapters: 1 } });
    const p = {
      ...baseParams, controller: makeController(),
      outline: { version: 1, chapters: [baseParams.outline.chapters[0]], endingHint: 'hope' },
    };
    await streamStoryChapter(p as never);
    expect(types(p)).toContain('story_complete');
    expect(completeStorySessionMock).toHaveBeenCalledTimes(1);
  });

  it('章节奖励: 章1 +5 tokens health event (P1-4 fire-and-forget)', async () => {
    const { createHealthEvent } = await import('@/lib/health-impact');
    const p = { ...baseParams, controller: makeController() };
    await streamStoryChapter(p as never);
    // 章 1 < 总章数 2 → 奖励
    expect(createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', eventType: 'butterfly_chapter_viewed', tokenOverride: 5 }));
  });
});
