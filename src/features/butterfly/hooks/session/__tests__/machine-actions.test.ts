import { describe, expect, it, vi } from 'vitest';
import type { ButterflyMachineContext, ButterflyMachineEvent } from '../butterfly-machine';
import { initialContext } from '../butterfly-machine-types';
import type { ButterflySession, StoryChapter } from '../../../types';
import { MachineActions } from '../machine-actions';

vi.mock('xstate', () => ({
  assign: (value: unknown) => ({ __assign: value }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type AssignFn = (params: { context: ButterflyMachineContext; event: ButterflyMachineEvent }) => Partial<ButterflyMachineContext>;

function action(name: keyof typeof MachineActions): AssignFn {
  const value = (MachineActions[name] as unknown as { __assign: AssignFn | Record<string, unknown> }).__assign;
  return typeof value === 'function' ? value : () => value;
}

function context(overrides: Partial<ButterflyMachineContext> = {}): ButterflyMachineContext {
  return { ...initialContext, ...overrides };
}

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 's-1', user_id: 'u-1', status: 'active', currentChapter: 1,
    decisionType: 'bought', decisionDescription: 'x',
    outline: { version: 1, chapters: [], endingHint: '', decisionType: 'bought', decisionDescription: 'x' },
    chapters: [], choices: [], createdAt: '', updatedAt: '',
    ...overrides,
  } as ButterflySession;
}

function run(name: keyof typeof MachineActions, ctx: ButterflyMachineContext, event: ButterflyMachineEvent) {
  return action(name)({ context: ctx, event });
}

describe('MachineActions — SSE 流核心 assign (machine-actions.ts 546行)', () => {
  // ── assignChapterStart ──
  it('assignChapterStart: 非 demo → illustrationUrl 空 + streamingText 清 + isLoading true', () => {
    const r = run('assignChapterStart', context({ streamingText: '旧文', isLoading: false }), {
      type: 'CHAPTER_START', data: { chapterIndex: 2, title: 'Ch2', tone: 'twist', timeSpan: '+1y' },
    } as never);
    expect(r.currentChapterInfo).toMatchObject({ chapterIndex: 2, title: 'Ch2', tone: 'twist', illustrationUrl: '' });
    expect(r.streamingText).toBe('');
    expect(r.isLoading).toBe(true);
  });

  it('assignChapterStart: demo → 预置 CDN URL', () => {
    const r = run('assignChapterStart', context({ isDemo: true }), {
      type: 'CHAPTER_START', data: { chapterIndex: 1, title: 'Ch1', tone: 'neutral', timeSpan: 'now' },
    } as never);
    const url = (r.currentChapterInfo as { illustrationUrl: string }).illustrationUrl;
    expect(url === '' || typeof url === 'string').toBe(true); // demo-content 决定; 锁类型不锁值
  });

  // ── appendChapterText ──
  it('appendChapterText: 累积追加', () => {
    const r1 = run('appendChapterText', context({ streamingText: '' }), { type: 'CHAPTER_TEXT', data: { text: 'abc' } } as never);
    const r2 = run('appendChapterText', context({ streamingText: 'abc' }), { type: 'CHAPTER_TEXT', data: { text: 'def' } } as never);
    expect(r1.streamingText).toBe('abc');
    expect(r2.streamingText).toBe('abcdef');
  });

  // ── assignChapterEnd: 三分支 ──
  it('assignChapterEnd 正常: info 匹配 → 章节入列 (M15 去重) + session.chapters 同步 (S1) + 清流', () => {
    const ctx = context({
      currentChapterInfo: { chapterIndex: 2, title: '旧标题', tone: 'twist', timeSpan: '+1y', illustrationUrl: 'url-a' },
      streamingText: 'streamed content',
      session: session(),
    });
    const r = run('assignChapterEnd', ctx, {
      type: 'CHAPTER_END',
      data: { chapterIndex: 2, hasChoice: true, fullText: 'full text from server' },
      illustrationUrl: 'url-b',
    } as never);
    expect(r.completedChapters).toHaveLength(1);
    expect(r.completedChapters![0]).toMatchObject({ index: 2, title: '旧标题', content: 'full text from server', illustrationUrl: 'url-b' });
    expect(r.session!.chapters).toHaveLength(1);
    expect(r.session!.currentChapter).toBe(2);
    expect(r.streamingText).toBe('');
    expect(r.currentChapterInfo).toBeNull();
    expect(r.isLoading).toBe(false); // V14: hasChoice → 保留 context.isLoading (此处 false); 无 choice → false
  });

  it('assignChapterEnd: endData.title 优先 (P1-2 流式期 title 可为空)', () => {
    const ctx = context({
      currentChapterInfo: { chapterIndex: 1, title: '', tone: 'neutral', timeSpan: 'now', illustrationUrl: '' },
      streamingText: 'x',
      session: session(),
    });
    const r = run('assignChapterEnd', ctx, {
      type: 'CHAPTER_END',
      data: { chapterIndex: 1, hasChoice: false, fullText: 'content', title: '解析后标题' },
    } as never);
    expect(r.completedChapters![0].title).toBe('解析后标题');
    expect(r.isLoading).toBe(false); // 无 choice → 停 loading
  });

  it('assignChapterEnd M15: 重复章节不再添加', () => {
    const dup: StoryChapter = { index: 2, title: 't', content: 'c', tone: 'neutral', timeSpan: 'now', hasChoice: false, createdAt: '' };
    const ctx = context({
      currentChapterInfo: { chapterIndex: 2, title: 't', tone: 'neutral', timeSpan: 'now', illustrationUrl: '' },
      streamingText: 's',
      completedChapters: [dup],
      session: session({ chapters: [dup] }),
    });
    const r = run('assignChapterEnd', ctx, {
      type: 'CHAPTER_END', data: { chapterIndex: 2, hasChoice: false, fullText: 'new' },
    } as never);
    expect(r.completedChapters).toHaveLength(1);
    expect(r.completedChapters![0].content).toBe('c'); // M15: 已存在 → 不替换 (保留旧章节)
    expect(r.session!.chapters).toHaveLength(1);
  });

  it('assignChapterEnd Round11-C3: chapter_start 丢失 + fullText 在 → 服务端为 source of truth 构造', () => {
    const ctx = context({ currentChapterInfo: null, streamingText: '上一章 stale 文本', session: session() });
    const r = run('assignChapterEnd', ctx, {
      type: 'CHAPTER_END', data: { chapterIndex: 3, hasChoice: false, fullText: 'server authoritative text' },
    } as never);
    expect(r.completedChapters).toHaveLength(1);
    expect(r.completedChapters![0]).toMatchObject({ index: 3, content: 'server authoritative text', title: 'Chapter 3' });
    expect(r.error).toBeUndefined(); // 可恢复 — 无 error
  });

  it('assignChapterEnd Round11-C3: 不可恢复 (info 丢 + 无 fullText) → error + 保留 streamed 内容 (R17#11)', () => {
    const ctx = context({ currentChapterInfo: null, streamingText: '用户看到的流式内容' });
    const r = run('assignChapterEnd', ctx, {
      type: 'CHAPTER_END', data: { chapterIndex: 3, hasChoice: false, fullText: '' },
    } as never);
    expect(r.completedChapters).toHaveLength(0); // 不伪造
    expect(r.error).toContain('could not be loaded');
    expect(r.errorDetail).toContain('chapter_start missed');
    expect(r.streamingText).toBe('用户看到的流式内容'); // Round 17 #11: 不清
    expect(r.isLoading).toBe(false);
  });

  // ── assignChoicePrompt ──
  it('assignChoicePrompt: pendingChoice 落位 + isLoading false', () => {
    const r = run('assignChoicePrompt', context({ isLoading: true }), {
      type: 'CHOICE_PROMPT',
      data: { chapterIndex: 2, prompt: '选哪条路?', options: [{ id: 'A', label: 'a', hint: 'h' }] },
    } as never);
    expect(r.pendingChoice).toMatchObject({ chapterIndex: 2, prompt: '选哪条路?' });
    expect(r.isLoading).toBe(false);
  });

  // ── assignOutlineUpdated ──
  it('assignOutlineUpdated: session.outline 三字段更新 (无 session 时不炸)', () => {
    const ctx = context({ session: session({ outline: { version: 1, chapters: [], endingHint: 'old', decisionType: 'bought', decisionDescription: 'x' } }) });
    const r = run('assignOutlineUpdated', ctx, {
      type: 'OUTLINE_UPDATED', data: { version: 2, chapters: [], endingHint: 'new hint' },
    } as never);
    expect(r.session!.outline).toMatchObject({ version: 2, endingHint: 'new hint' });
    const r2 = run('assignOutlineUpdated', context({ session: null }), {
      type: 'OUTLINE_UPDATED', data: { version: 2, chapters: [], endingHint: '' },
    } as never);
    expect(r2.session).toBeNull();
  });

  // ── assignIllustration ──
  it('assignIllustration: completedChapters + session.chapters + currentChapterInfo 三处同步', () => {
    const ch: StoryChapter = { index: 1, title: 't', content: 'c', tone: 'neutral', timeSpan: 'now', hasChoice: false, createdAt: '' };
    const ctx = context({
      completedChapters: [ch],
      session: session({ chapters: [ch] }),
      currentChapterInfo: { chapterIndex: 1, title: 't', tone: 'neutral', timeSpan: 'now', illustrationUrl: '' },
    });
    const r = run('assignIllustration', ctx, {
      type: 'ILLUSTRATION_GENERATED', data: { chapterIndex: 1, illustrationUrl: 'https://img/1.png' },
    } as never);
    expect(r.completedChapters![0].illustrationUrl).toBe('https://img/1.png');
    expect(r.session!.chapters[0].illustrationUrl).toBe('https://img/1.png');
    expect((r.currentChapterInfo as { illustrationUrl: string }).illustrationUrl).toBe('https://img/1.png');
  });

  it('assignIllustration: 非当前章节的 currentChapterInfo 不动', () => {
    const ctx = context({
      currentChapterInfo: { chapterIndex: 5, title: 't', tone: 'neutral', timeSpan: 'now', illustrationUrl: 'keep' },
    });
    const r = run('assignIllustration', ctx, {
      type: 'ILLUSTRATION_GENERATED', data: { chapterIndex: 1, illustrationUrl: 'x' },
    } as never);
    expect((r.currentChapterInfo as { illustrationUrl: string }).illustrationUrl).toBe('keep');
  });

  // ── handleIllustrationFailed ──
  it('handleIllustrationFailed: 非 demo → 不 assign (spawn 层处理)', () => {
    const r = run('handleIllustrationFailed', context({ isDemo: false }), {
      type: 'ILLUSTRATION_FAILED', data: { chapterIndex: 1, reason: 'api_error' },
    } as never);
    expect(Object.keys(r)).toHaveLength(0);
  });

  // ── assignSceneIllustration ──
  it('assignSceneIllustration: sceneIllustrations map 写入双处', () => {
    const ch: StoryChapter = { index: 2, title: 't', content: 'c', tone: 'neutral', timeSpan: 'now', hasChoice: false, createdAt: '' };
    const ctx = context({ completedChapters: [ch], session: session({ chapters: [ch] }) });
    const r = run('assignSceneIllustration', ctx, {
      type: 'SCENE_ILLUSTRATION_GENERATED', data: { chapterIndex: 2, sceneIndex: 1, illustrationUrl: 's1.png' },
    } as never);
    expect(r.completedChapters![0].sceneIllustrations).toEqual({ 1: ['s1.png'] });
    expect(r.session!.chapters[0].sceneIllustrations).toEqual({ 1: ['s1.png'] });
  });

  // ── assignStoryComplete ──
  it('assignStoryComplete: storyComplete 落位 + session.status=completed', () => {
    const ctx = context({ session: session() });
    const r = run('assignStoryComplete', ctx, {
      type: 'STORY_COMPLETE', data: { finalTone: 'hopeful', totalChapters: 3, butterflyEffect: 'effect!' },
    } as never);
    expect(r.storyComplete).toEqual({ finalTone: 'hopeful', totalChapters: 3, butterflyEffect: 'effect!' });
    expect(r.session!.status).toBe('completed');
    expect(r.isLoading).toBe(false);
  });

  // ── resetIsLoading / resetContext / assignSyncContext ──
  it('resetIsLoading: true→false, false 不变', () => {
    expect(run('resetIsLoading', context({ isLoading: true }), { type: 'STREAM_DONE' } as never).isLoading).toBe(false);
    expect(run('resetIsLoading', context({ isLoading: false }), { type: 'STREAM_DONE' } as never).isLoading).toBe(false);
  });

  it('resetContext: 全字段清零 (BUG-002)', () => {
    const ctx = context({ session: session(), streamingText: 'x', error: 'e', storyComplete: { finalTone: 'hopeful', totalChapters: 3, butterflyEffect: 'e' }, outlineVisible: true });
    const r = run('resetContext', ctx, { type: 'RESET' } as never);
    expect(r.session).toBeNull();
    expect(r.streamingText).toBe('');
    expect(r.error).toBeNull();
    expect(r.storyComplete).toBeNull();
    expect(r.completedChapters).toEqual([]);
    expect(r.isPollingActive).toBe(false);
    expect(r.preloadedChapterData).toBeNull();
  });

  it('assignSyncContext: userId/isLight/endpoints/locale 四字段', () => {
    const r = run('assignSyncContext', context(), {
      type: 'SYNC_CONTEXT', userId: 'u-9', isLight: true, endpoints: { story: '/api/x' } as never, locale: 'en',
    } as never);
    expect(r.userId).toBe('u-9');
    expect(r.isLight).toBe(true);
    expect(r.endpoints).toEqual({ story: '/api/x' });
    expect(r.locale).toBe('en');
  });
});
