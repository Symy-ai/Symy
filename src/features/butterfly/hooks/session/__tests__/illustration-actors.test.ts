import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/client-illustration-engine', () => ({
  generateIllustrationClient: vi.fn(),
}));
vi.mock('../../../lib/demo-content', () => ({
  getDemoSceneIllustrations: vi.fn(() => ({ 0: ['https://cdn/s0.png'], 2: ['https://cdn/s2.png'] })),
}));

import {
  generateSceneIllustrationsActor,
  illustrationPollingActor,
  tryClientIllustrationActor,
} from '../illustration-actors';
import { generateIllustrationClient } from '../../../lib/client-illustration-engine';

type SendBack = (event: unknown) => void;
type CallbackActor = { config: (ctx: { input: unknown; sendBack: SendBack }) => () => void };

function invokeFactory(actor: CallbackActor, input: unknown, sendBack: SendBack): () => void {
  return actor.config({ input, sendBack });
}

const genClient = vi.mocked(generateIllustrationClient);

const fetchErr = () =>
  vi.fn(() => Promise.resolve({ ok: false } as never)) as unknown as typeof fetch;

describe('tryClientIllustrationActor (客户端插图 fallback)', () => {
  it('成功 → CLIENT_ILLU_DONE 携带 url+chapterIndex', async () => {
    const events: unknown[] = [];
    genClient.mockResolvedValueOnce({ success: true, imageUrl: 'https://img/x.png' } as never);
    const cleanup = invokeFactory(tryClientIllustrationActor as never, {
      chapterIndex: 2, title: '夜市', tone: 'warm', timeSpan: '傍晚',
      decisionDescription: '买了烤肠', decisionType: 'bought',
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 20));
    cleanup();
    expect(events).toEqual([{ type: 'CLIENT_ILLU_DONE', chapterIndex: 2, url: 'https://img/x.png' }]);
  });

  it('失败 → url null', async () => {
    const events: unknown[] = [];
    genClient.mockResolvedValueOnce({ success: false } as never);
    invokeFactory(tryClientIllustrationActor as never, {
      chapterIndex: 1, title: 't', tone: 'warm', timeSpan: '晚',
      decisionDescription: 'd', decisionType: 'resisted',
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual([{ type: 'CLIENT_ILLU_DONE', chapterIndex: 1, url: null }]);
  });

  it('异常 (非 Abort) → url null; size=136x238 透传', async () => {
    const events: unknown[] = [];
    genClient.mockRejectedValueOnce(new Error('boom'));
    invokeFactory(tryClientIllustrationActor as never, {
      chapterIndex: 3, title: 't', tone: 'warm', timeSpan: '晚',
      decisionDescription: 'd', decisionType: 'bought',
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual([{ type: 'CLIENT_ILLU_DONE', chapterIndex: 3, url: null }]);
    expect(genClient.mock.calls[0][0].size).toBe('136x238');
  });

  it('清理: AbortError 静默零事件', async () => {
    const events: unknown[] = [];
    genClient.mockImplementationOnce((_p: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => setTimeout(() => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), 10)));
    const cleanup = invokeFactory(tryClientIllustrationActor as never, {
      chapterIndex: 4, title: 't', tone: 'warm', timeSpan: '晚',
      decisionDescription: 'd', decisionType: 'bought',
    }, (e) => events.push(e));
    cleanup(); // 立即清理 → abort
    await new Promise((r) => setTimeout(r, 30));
    expect(events).toEqual([]);
  });
});

describe('generateSceneIllustrationsActor (场景插图)', () => {
  it('demo: 预置 CDN 逐场景发 SCENE_ILLU_DONE (无 fetch)', async () => {
    const events: unknown[] = [];
    globalThis.fetch = vi.fn() as never;
    invokeFactory(generateSceneIllustrationsActor as never, {
      chapterIndex: 1, chapterContent: '', chapterTitle: '', tone: 'warm',
      decisionDescription: '', isDemo: true, endpoints: {},
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 20));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'SCENE_ILLU_DONE', chapterIndex: 1, sceneIndex: 0, url: 'https://cdn/s0.png' },
      { type: 'SCENE_ILLU_DONE', chapterIndex: 1, sceneIndex: 2, url: 'https://cdn/s2.png' },
    ]);
  });

  it('正常: ||| 分割场景逐个 POST, 500ms 间隔, 成功回 url', async () => {
    const events: unknown[] = [];
    let calls = 0;
    globalThis.fetch = vi.fn(() => {
      calls++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, imageUrl: `https://i/${calls}.png` }) } as never);
    }) as unknown as typeof fetch;
    invokeFactory(generateSceneIllustrationsActor as never, {
      chapterIndex: 5, chapterContent: '场景一 ||| 场景二', chapterTitle: '标题', tone: 'calm',
      decisionDescription: 'd', isDemo: false, endpoints: { illustration: '/api/illu' },
    }, (e) => events.push(e));
    // 2 场景 + 1 个 500ms 间隔 — 等 800ms
    await new Promise((r) => setTimeout(r, 800));
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    expect(events).toEqual([
      { type: 'SCENE_ILLU_DONE', chapterIndex: 5, sceneIndex: 0, url: 'https://i/1.png' },
      { type: 'SCENE_ILLU_DONE', chapterIndex: 5, sceneIndex: 1, url: 'https://i/2.png' },
    ]);
    // body: isSceneLevel + sceneText
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.isSceneLevel).toBe(true);
    expect(body.sceneText).toBe('场景一');
  });

  it('POST body 四字段落位: title/tone/decisionDescription/size', async () => {
    globalThis.fetch = fetchErr();
    invokeFactory(generateSceneIllustrationsActor as never, {
      chapterIndex: 6, chapterContent: 'solo scene', chapterTitle: '章题', tone: 'night',
      decisionDescription: '买了夜宵', isDemo: false, endpoints: { illustration: '/api/i' },
    }, () => {});
    await new Promise((r) => setTimeout(r, 60));
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body).toMatchObject({ title: '章题', tone: 'night', decisionDescription: '买了夜宵', size: '136x238' });
  });

  it('HTTP 失败 → 不发该场景事件 (静默降级)', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchErr();
    invokeFactory(generateSceneIllustrationsActor as never, {
      chapterIndex: 7, chapterContent: 's1 ||| s2', chapterTitle: '', tone: 'calm',
      decisionDescription: '', isDemo: false, endpoints: { illustration: '/x' },
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 800));
    expect(events).toEqual([]);
  });
});

describe('illustrationPollingActor (插图轮询)', () => {
  const chapters = (urls: (string | undefined)[]) =>
    urls.map((u, i) => ({ index: i + 1, content: 'c', illustrationUrl: u }));

  it('无缺失插图 → 立即 POLLING_DONE (零 fetch)', async () => {
    const events: unknown[] = [];
    globalThis.fetch = vi.fn() as never;
    invokeFactory(illustrationPollingActor as never, {
      sessionId: 's1', currentChapters: chapters(['a.png', 'b.png']), endpoints: { session: '/api/s' },
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 30));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'ILLUSTRATION_POLLING_DONE' }]);
  });

  it('新插图出现 → POLLING_UPDATE 携带 fresh chapters, 随即全齐 → DONE', async () => {
    vi.useFakeTimers();
    try {
      const events: unknown[] = [];
      let round = 0;
      globalThis.fetch = vi.fn(() => {
        round++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          session: { id: 's1', chapters: chapters(round === 1 ? ['a.png', 'b.png'] : ['x.png', 'y.png']) },
        }) } as never);
      }) as unknown as typeof fetch;
      invokeFactory(illustrationPollingActor as never, {
        sessionId: 's1', currentChapters: chapters(['a.png', undefined]), endpoints: { session: '/api/s' },
      }, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(5010);
      expect(events[0]).toMatchObject({ type: 'ILLUSTRATION_POLLING_UPDATE' });
      expect((events[0] as { chapters: { illustrationUrl?: string }[] }).chapters[1].illustrationUrl).toBe('b.png');
      await vi.advanceTimersByTimeAsync(5010);
      expect(events[events.length - 1]).toEqual({ type: 'ILLUSTRATION_POLLING_DONE' });
    } finally { vi.useRealTimers(); }
  });

  it('session id 漂移 (换会话) → 立即 DONE', async () => {
    vi.useFakeTimers();
    try {
      const events: unknown[] = [];
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({
        session: { id: 'OTHER', chapters: [] },
      }) } as never)) as unknown as typeof fetch;
      invokeFactory(illustrationPollingActor as never, {
        sessionId: 's1', currentChapters: chapters([undefined]), endpoints: { session: '/api/s' },
      }, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(5010);
      expect(events).toEqual([{ type: 'ILLUSTRATION_POLLING_DONE' }]);
    } finally { vi.useRealTimers(); }
  });

  it('无新插图 → retryCount 递增至 max (24) 后 DONE (2 分钟超时兜底)', async () => {
    vi.useFakeTimers();
    try {
      const events: unknown[] = [];
      let polls = 0;
      globalThis.fetch = vi.fn(() => {
        polls++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          session: { id: 's1', chapters: chapters(['a.png', undefined]) },
        }) } as never);
      }) as unknown as typeof fetch;
      invokeFactory(illustrationPollingActor as never, {
        sessionId: 's1', currentChapters: chapters(['a.png', undefined]), endpoints: { session: '/api/s' },
      }, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(24 * 5010);
      expect(polls).toBe(24);
      expect(events.filter((e) => (e as { type: string }).type === 'ILLUSTRATION_POLLING_UPDATE')).toEqual([]);
      expect(events[events.length - 1]).toEqual({ type: 'ILLUSTRATION_POLLING_DONE' });
    } finally { vi.useRealTimers(); }
  });

  it('fetch 异常 → 立即 DONE', async () => {
    vi.useFakeTimers();
    try {
      const events: unknown[] = [];
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('net'))) as unknown as typeof fetch;
      invokeFactory(illustrationPollingActor as never, {
        sessionId: 's1', currentChapters: chapters([undefined]), endpoints: { session: '/api/s' },
      }, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(5010);
      expect(events).toEqual([{ type: 'ILLUSTRATION_POLLING_DONE' }]);
    } finally { vi.useRealTimers(); }
  });

  it('清理: cancelled 后不发 DONE', async () => {
    vi.useFakeTimers();
    try {
      const events: unknown[] = [];
      globalThis.fetch = vi.fn() as never;
      const cleanup = invokeFactory(illustrationPollingActor as never, {
        sessionId: 's1', currentChapters: chapters([undefined]), endpoints: { session: '/api/s' },
      }, (e) => events.push(e));
      cleanup();
      await vi.advanceTimersByTimeAsync(30000);
      expect(events).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});
