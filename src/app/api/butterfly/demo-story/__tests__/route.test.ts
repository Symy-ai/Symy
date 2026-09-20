/**
 * demo-story route 契约测试 — wool v6 §十二.4 D7
 *
 * 钉四面:
 * 1. 限流键去共享桶 (D7-①): 无 IP 头不再落 'unknown' 共享桶 — 按 UA 哈希分桶,
 *    两并发不互相 429; 有 IP 按 demo-story:ip 分桶; 零身份信号放行
 * 2. 章节钳制双层防线 (D7-②): schema 拒 >99 (400); 范围钳制收 3..99 与 session 投毒
 *    (demo-choice 可写 0..10) — 越界请求落在最后一章实体内容, 不再一键直达结局;
 *    合法进度 1 照常拿第 2 章
 * 3. choices/description 净化 (D7-③): 零宽字符剥离后命中 A 分支; description
 *    不可见字符不进大纲文本; 模板花括号惰性不破坏故事
 * 4. 既有契约: 缺 decisionDescription 400; schema 上界 99; 限流拒绝 429
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/features/butterfly/lib/demo-session-store', () => ({
  getDemoSession: vi.fn(),
}));

import { checkRateLimit } from '@/lib/distributed-lock';
import { getDemoSession } from '@/features/butterfly/lib/demo-session-store';
import type { ButterflySession } from '@/features/butterfly/types';

type SSEEvent = { type: string; data: Record<string, unknown> };

function createRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: () => Promise.resolve(body),
  } as unknown as NextRequest;
}

/** 读取 SSE 流直到收集满 count 个事件（reader 跨 waitFor 重试续读, cancel 兜底断流） */
async function readSSEEvents(res: Response, count: number, timeoutMs = 10_000): Promise<SSEEvent[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SSEEvent[] = [];
  const parseBuffer = () => {
    for (;;) {
      const idx = buffer.indexOf('\n\n');
      if (idx === -1) return;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) events.push(JSON.parse(dataLine.slice('data: '.length)));
    }
  };
  try {
    await vi.waitFor(async () => {
      while (events.length < count) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`stream ended after ${events.length} events, wanted ${count}`);
        buffer += decoder.decode(value, { stream: true });
        parseBuffer();
      }
    }, { timeout: timeoutMs, interval: 20 });
  } finally {
    await reader.cancel().catch(() => {});
  }
  return events;
}

/** 读完整章（直到 chapter_end）, 返回该章累计文本 — 全章流约 4-6s（35ms/chunk + 1.5s 场景停顿） */
async function readFullChapter(res: Response, timeoutMs = 30_000): Promise<{ text: string; events: SSEEvent[] }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SSEEvent[] = [];
  const parseBuffer = () => {
    for (;;) {
      const idx = buffer.indexOf('\n\n');
      if (idx === -1) return;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) events.push(JSON.parse(dataLine.slice('data: '.length)));
    }
  };
  try {
    await vi.waitFor(async () => {
      while (!events.some(e => e.type === 'chapter_end')) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        parseBuffer();
      }
      if (!events.some(e => e.type === 'chapter_end')) {
        throw new Error(`no chapter_end yet, got: ${events.map(e => e.type).join(',')}`);
      }
    }, { timeout: timeoutMs, interval: 20 });
  } finally {
    await reader.cancel().catch(() => {});
  }
  const text = events
    .filter(e => e.type === 'chapter_text')
    .map(e => e.data.text as string)
    .join('');
  return { text, events };
}

function makeSessionFixture(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 'demo-sess-1',
    userId: 'demo-user',
    decisionType: 'bought',
    decisionDescription: 'a demo teapot',
    outline: null,
    currentChapter: 10,
    chapters: [],
    choices: [{ chapterIndex: 2, selectedOption: 'B' }],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ButterflySession;
}

describe('demo-story rate limit — D7-① 去共享桶', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDemoSession).mockReturnValue(null);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 20 });
  });

  it('无 IP 头的两并发请求按 UA 分桶, 键互不相同, 不互相 429', async () => {
    const [resA, resB] = await Promise.all([
      POST(createRequest({ decisionDescription: 'a', locale: 'en' }, { 'user-agent': 'Mozilla-UA-A' })),
      POST(createRequest({ decisionDescription: 'a', locale: 'en' }, { 'user-agent': 'Mozilla-UA-B' })),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const calls = vi.mocked(checkRateLimit).mock.calls;
    expect(calls).toHaveLength(2);
    const [keyA, keyB] = [calls[0][0], calls[1][0]];
    expect(keyA).toMatch(/^demo-story:ua:/);
    expect(keyB).toMatch(/^demo-story:ua:/);
    expect(keyA).not.toBe(keyB);
  });

  it('有 IP 头时按 demo-story:ip:<ip> 分桶（生产行为不变）', async () => {
    const res = await POST(createRequest(
      { decisionDescription: 'a', locale: 'en' },
      { 'x-vercel-forwarded-for': '10.0.0.9' },
    ));
    expect(res.status).toBe(200);
    expect(vi.mocked(checkRateLimit).mock.calls[0][0]).toBe('demo-story:ip:10.0.0.9');
  });

  it('限流拒绝时 429', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(createRequest(
      { decisionDescription: 'a', locale: 'en' },
      { 'x-forwarded-for': '10.0.0.1' },
    ));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Rate limit');
  });

  it('零身份信号（无 IP 无 UA）放行, 不调 checkRateLimit', async () => {
    const res = await POST(createRequest({ decisionDescription: 'a', locale: 'en' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(checkRateLimit)).not.toHaveBeenCalled();
    const events = await readSSEEvents(res, 1);
    expect(events[0].type).toBe('outline_generated');
  });
});

describe('demo-story 章节钳制 — D7-② 不信任客户端跳章', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDemoSession).mockReturnValue(null);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 20 });
  });

  it('currentChapter=50 (过 schema、超章节范围) 钳制到最后一章实体内容, 不直达结局', async () => {
    const res = await POST(createRequest({ currentChapter: 50, decisionDescription: 'a demo teapot', locale: 'en' }));
    expect(res.status).toBe(200);
    const events = await readSSEEvents(res, 2);
    expect(events[0].type).not.toBe('story_complete');
    expect(events[0].type).toBe('outline_updated');
    expect(events[1].type).toBe('chapter_start');
    expect(events[1].data.chapterIndex).toBe(3);
  });

  it('session 进度被投毒 (currentChapter=10) 同样钳回实体章节', async () => {
    vi.mocked(getDemoSession).mockReturnValue(makeSessionFixture({ currentChapter: 10 }));
    const res = await POST(createRequest({ sessionId: 'demo-sess-1' }));
    expect(res.status).toBe(200);
    const events = await readSSEEvents(res, 2);
    expect(events[0].type).not.toBe('story_complete');
    expect(events[1].data.chapterIndex).toBe(3);
  });

  it('合法进度 1 照常拿到第 2 章（不过度钳制, 逐章走协议保留）', async () => {
    const res = await POST(createRequest({ currentChapter: 1, decisionDescription: 'a demo teapot', locale: 'en' }));
    expect(res.status).toBe(200);
    const events = await readSSEEvents(res, 2);
    expect(events[0].type).toBe('outline_updated');
    expect(events[1].type).toBe('chapter_start');
    expect(events[1].data.chapterIndex).toBe(2);
  });

  it('首发请求 (currentChapter 缺省 0) 照常发大纲 + 第 1 章', async () => {
    const res = await POST(createRequest({ decisionDescription: 'a demo teapot', locale: 'en' }));
    expect(res.status).toBe(200);
    const events = await readSSEEvents(res, 2);
    expect(events[0].type).toBe('outline_generated');
    expect(events[1].data.chapterIndex).toBe(1);
  });
});

describe('demo-story 输入净化 — D7-③ 内容注入面', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDemoSession).mockReturnValue(null);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 20 });
  });

  it('choices 零宽字符剥离后命中 A 分支（旧代码零宽 A 落泛化分支）', async () => {
    const res = await POST(createRequest({
      currentChapter: 1,
      decisionDescription: 'a silk scarf',
      choices: { '2': '\u200BA\u200B' },
      locale: 'en',
    }));
    expect(res.status).toBe(200);
    const { text } = await readFullChapter(res);
    expect(text).toContain('You chose to keep it close');
    expect(text).not.toContain('Life offers a playful little turn');
  }, 40_000);

  it('choices 模板语法 ({{}}/${}) 不破坏章节生成', async () => {
    const res = await POST(createRequest({
      currentChapter: 1,
      decisionDescription: 'a silk scarf',
      choices: { '2': '{{outline}}${dangerous}' },
      locale: 'en',
    }));
    expect(res.status).toBe(200);
    const { text } = await readFullChapter(res);
    expect(text).not.toContain('{{outline}}');
    expect(text).not.toContain('${dangerous}');
    expect(text).toContain('Life offers a playful little turn');
  }, 40_000);

  it('description 零宽字符剥离进大纲文本, 模板花括号惰性保留', async () => {
    const res = await POST(createRequest({ decisionDescription: 'tea\u200Bpot {{x}} ${y}', locale: 'en' }));
    expect(res.status).toBe(200);
    const events = await readSSEEvents(res, 1);
    expect(events[0].type).toBe('outline_generated');
    const summary = (events[0].data.chapters as Array<{ summary: string }>)[0].summary;
    expect(summary).toContain('teapot {{x}} ${y}');
    expect(summary).not.toContain('\u200B');
  });
});

describe('demo-story 既有契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDemoSession).mockReturnValue(null);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 20 });
  });

  it('缺 decisionDescription 返回 400', async () => {
    const res = await POST(createRequest({}));
    expect(res.status).toBe(400);
  });

  it('currentChapter 超 schema 上界 99 (100 / 简报载荷 999) 返回 400', async () => {
    for (const currentChapter of [100, 999]) {
      const res = await POST(createRequest({ currentChapter, decisionDescription: 'a demo teapot' }));
      expect(res.status).toBe(400);
    }
  });
});
