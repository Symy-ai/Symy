import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座：letta 全链 + agent-manager ———
const sendToAgentMock = vi.fn();
const streamToAgentMock = vi.fn();
vi.mock('@/lib/letta', () => ({
  sendToAgent: (...args: unknown[]) => sendToAgentMock(...(args as [])),
  streamToAgent: (...args: unknown[]) => streamToAgentMock(...(args as [])),
  isLettaConfigured: () => true,
}));
const getUserAgentIdMock = vi.fn();
vi.mock('@/lib/letta-agent-manager', () => ({
  getUserAgentId: (...args: unknown[]) => getUserAgentIdMock(...(args as [])),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// race-timeout 直通真实现（15s 超时不触发，测试内全快路径）
// race-timeout 用真实现 — 透传 (vitest mock 工厂可直接 return importOriginal 的 Promise)
vi.mock('@/lib/race-timeout', (importOriginal) => importOriginal());

import {
  clearButterflyContextFromAgent,
  generateOutline,
  generateCompleteStory,
  regenerateOutline,
  generateChoiceOptions,
  generateButterflySummary,
  isStoryEngineReady,
} from '../story-engine';
import type { ButterflySession, CreateSessionParams } from '../../types';

// ——— SSE 流工厂：Letta token 事件 → Uint8Array 流 ———
function lettaStream(text: string, chunks: string[] = []): ReadableStream<Uint8Array> {
  const events = (chunks.length > 0 ? chunks : [text]).map(
    (t) => `data: ${JSON.stringify({ type: 'token', content: t })}\n\n`,
  );
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < events.length) controller.enqueue(enc.encode(events[i++]));
      else controller.close();
    },
  });
}

function params(overrides: Partial<CreateSessionParams> = {}): CreateSessionParams {
  return {
    decisionType: 'bought',
    decisionDescription: '咖啡机',
    amount: 10,
    platform: 'taobao',
    context: '深夜刷淘宝',
    ...overrides,
  };
}

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 's-1',
    userId: 'u-1',
    decisionType: 'bought',
    decisionDescription: '咖啡机',
    amount: 10,
    platform: null,
    context: null,
    outline: {
      version: 1,
      decisionType: 'bought',
      decisionDescription: '咖啡机',
      chapters: [
        { index: 1, title: 'Ch1', summary: 's1', hasChoice: false, tone: 'neutral', timeSpan: 'now' },
        { index: 2, title: 'Ch2', summary: 's2', hasChoice: true, choicePrompt: 'Which way?', tone: 'neutral', timeSpan: 'later' },
        { index: 3, title: 'Ch3', summary: 's3', hasChoice: false, tone: 'hopeful', timeSpan: 'end' },
      ],
      endingHint: 'Irony ending.',
    },
    currentChapter: 2,
    chapters: [
      { index: 1, title: 'Ch1', content: '第一章内容。', tone: 'neutral', timeSpan: 'now', hasChoice: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    choices: [
      {
        chapterIndex: 2,
        prompt: 'Which way?',
        options: [
          { id: 'A', label: '买入', hint: 'spend' },
          { id: 'B', label: '忍住', hint: 'save' },
        ],
        selectedOption: null,
      },
    ],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    isExample: false,
    isBookmarked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ButterflySession;
}

const VALID_OUTLINE_JSON = JSON.stringify({
  chapters: [
    { index: 1, title: 'The Morning', summary: 'wakes up', tone: 'neutral', timeSpan: 'day 1' },
    { index: 2, title: 'The Fork', summary: 'chooses', tone: 'twist', timeSpan: 'day 2', choicePrompt: 'Buy or save?' },
    { index: 3, title: 'The Echo', summary: 'lives with it', tone: 'hopeful', timeSpan: 'years later' },
  ],
  endingHint: 'The machine remembers.',
});

describe('story-engine (556行编排层)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserAgentIdMock.mockResolvedValue('agent-1');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('resolveAgentId 底座', () => {
    it('无 per-user agent: 所有生成器抛 "start a chat first"', async () => {
      getUserAgentIdMock.mockResolvedValue(null);
      await expect(generateOutline(params(), 'u-1')).rejects.toThrow(
        /start a chat first/i,
      );
    });
  });

  describe('isStoryEngineReady', () => {
    it('透传 isLettaConfigured', () => {
      expect(isStoryEngineReady()).toBe(true);
    });
  });

  describe('generateOutline', () => {
    it('流式累积 + JSON 解析: 章节数/hasChoice/tone 校验链', async () => {
      streamToAgentMock.mockResolvedValue(lettaStream(VALID_OUTLINE_JSON));
      const outline = await generateOutline(params(), 'u-1', 'zh');
      expect(outline.chapters).toHaveLength(3);
      expect(outline.chapters[0].title).toBe('The Morning');
      expect(outline.chapters[1].hasChoice).toBe(true); // CHOICE_CHAPTER_INDICES 含 2
      expect(outline.chapters[2].tone).toBe('hopeful');
      expect(streamToAgentMock).toHaveBeenCalledTimes(1);
    });

    it('SSE 跨 chunk 截断: 行缓冲重组后仍完整解析', async () => {
      // JSON 拆两个 chunk — 第二 chunk 开头没有换行, 行缓冲须拼回
      const half = Math.floor(VALID_OUTLINE_JSON.length / 2);
      streamToAgentMock.mockResolvedValue(
        lettaStream(VALID_OUTLINE_JSON, [VALID_OUTLINE_JSON.slice(0, half), VALID_OUTLINE_JSON.slice(half)]),
      );
      const outline = await generateOutline(params(), 'u-1');
      expect(outline.chapters).toHaveLength(3);
    });

    it('首试失败重试一次: 第2次成功返回 (P0-5 retry 机制)', async () => {
      streamToAgentMock
        .mockRejectedValueOnce(new Error('transient LLM failure'))
        .mockResolvedValueOnce(lettaStream(VALID_OUTLINE_JSON));
      const outline = await generateOutline(params(), 'u-1');
      expect(outline.chapters).toHaveLength(3);
      expect(streamToAgentMock).toHaveBeenCalledTimes(2);
    }, 10_000);

    it('两次全失败: 抛 STORY_OUTLINE_FAILED + code=OUTLINE_GENERATION_FAILED', async () => {
      streamToAgentMock.mockRejectedValue(new Error('LLM down'));
      await expect(generateOutline(params(), 'u-1')).rejects.toThrow(/STORY_OUTLINE_FAILED/);
      const err = (await generateOutline(params(), 'u-1').then(
        () => { throw new Error('expected rejection'); },
        (e: unknown) => e,
      )) as Error & { code?: string };
      expect(err.code).toBe('OUTLINE_GENERATION_FAILED');
    }, 10_000);

    it('无 JSON: 走 fallback outline (不抛错)', async () => {
      streamToAgentMock.mockResolvedValue(lettaStream('抱歉我不知道怎么回答这个问题。'));
      const outline = await generateOutline(params(), 'u-1');
      // parsers 兜底: 生成 fallback 3 章
      expect(outline.chapters.length).toBeGreaterThan(0);
    });
  });

  describe('generateCompleteStory', () => {
    it('一次生成 3 章 + butterflyEffect + finalTone', async () => {
      const COMPLETE_JSON = JSON.stringify({
        chapters: [
          { index: 1, title: 'C1', content: '第一章。', tone: 'neutral', timeSpan: 'now' },
          { index: 2, title: 'C2', content: '第二章。', tone: 'twist', timeSpan: 'later' },
          { index: 3, title: 'C3', content: '第三章。', tone: 'hopeful', timeSpan: 'end' },
        ],
        butterflyEffect: 'One small choice echoed for years.',
        finalTone: 'hopeful',
      });
      streamToAgentMock.mockResolvedValue(lettaStream(COMPLETE_JSON));
      const result = await generateCompleteStory(params(), 'u-1');
      expect(result.chapters).toHaveLength(3);
      expect(result.butterflyEffect).toBe('One small choice echoed for years.');
      expect(result.finalTone).toBe('hopeful');
    });

    it('两次全失败: 抛 STORY_COMPLETE_FAILED + code=STORY_GENERATION_FAILED', async () => {
      streamToAgentMock.mockRejectedValue(new Error('LLM down'));
      await expect(generateCompleteStory(params(), 'u-1')).rejects.toThrow(/STORY_COMPLETE_FAILED/);
      const err = (await generateCompleteStory(params(), 'u-1').then(
        () => { throw new Error('expected rejection'); },
        (e: unknown) => e,
      )) as Error & { code?: string };
      expect(err.code).toBe('STORY_GENERATION_FAILED');
    }, 10_000);
  });

  describe('regenerateOutline', () => {
    it('选择后重生成: 已发生章节保留 + 新章节合入 + version+1', async () => {
      // session 已有 1 章 → 保留 index=1, LLM 返回 2/3/4 章
      const REGEN_JSON = JSON.stringify({
        chapters: [
          { index: 2, title: 'New Ch2', summary: 'x', tone: 'twist', timeSpan: 'later' },
          { index: 3, title: 'New Ch3', summary: 'y', tone: 'dark', timeSpan: 'end' },
        ],
        endingHint: 'New ending.',
      });
      streamToAgentMock.mockResolvedValue(lettaStream(REGEN_JSON));
      const outline = await regenerateOutline(session(), 'A', 'u-1');
      expect(outline.version).toBe(2);
      // 已发生章节 (index 1) 保留原样
      expect(outline.chapters[0].title).toBe('Ch1');
      // 新章节合入
      expect(outline.chapters).toHaveLength(3);
      expect(outline.chapters[1].title).toBe('New Ch2');
      expect(outline.endingHint).toBe('New ending.');
    });

    it('M5 fix: LLM 索引错位 (从 1 开始) → 重新索引合入', async () => {
      // 已有 1 章, LLM 却从 index=1 返回 (错误索引)
      const BAD_INDEX_JSON = JSON.stringify({
        chapters: [
          { index: 1, title: 'WrongIdx', summary: 'x', tone: 'twist', timeSpan: 'later' },
        ],
        endingHint: 'eh',
      });
      streamToAgentMock.mockResolvedValue(lettaStream(BAD_INDEX_JSON));
      const outline = await regenerateOutline(session(), 'A', 'u-1');
      // re-index: 已有1章 → 新章节应从 index 2 起
      const newCh = outline.chapters.find((c) => c.title === 'WrongIdx');
      expect(newCh?.index).toBe(2);
    });

    it('无 outline / 无 choice / 非法 option: 三段防御抛错', async () => {
      await expect(regenerateOutline(session({ outline: null }), 'A', 'u-1')).rejects.toThrow(
        /No existing outline/i,
      );
      await expect(regenerateOutline(session({ choices: [] }), 'A', 'u-1')).rejects.toThrow(
        /No choice found/i,
      );
      await expect(regenerateOutline(session(), 'Z9', 'u-1')).rejects.toThrow(
        /Invalid option/i,
      );
    });
  });

  describe('generateChoiceOptions', () => {
    it('sendToAgent 非流式 + parseChoiceFromLLM', async () => {
      sendToAgentMock.mockResolvedValue({
        reply: JSON.stringify({ prompt: '深夜了, 买还是忍?', options: [
          { id: 'A', label: '下单', hint: '冲动' },
          { id: 'B', label: '关掉 APP', hint: '冷静' },
        ] }),
        toolCalls: [],
      });
      const result = await generateChoiceOptions(
        { index: 2, title: 'Ch2', summary: 's', hasChoice: true, tone: 'neutral', timeSpan: 'later' },
        '第二章内容。',
        'bought',
        'u-1',
      );
      expect(result.prompt).toBe('深夜了, 买还是忍?');
      expect(result.options).toHaveLength(2);
      expect(result.options[0].label).toBe('下单');
    });

    it('工具调用检测: toolCalls 非空走 warn (不抛错)', async () => {
      sendToAgentMock.mockResolvedValue({
        reply: JSON.stringify({ prompt: 'p', options: [{ id: 'A', label: 'L', hint: 'h' }] }),
        toolCalls: [{ name: 'add_tokens' }],
      });
      const result = await generateChoiceOptions(
        { index: 2, title: 'Ch2', summary: 's', hasChoice: true, tone: 'neutral', timeSpan: 'later' },
        'content',
        'bought',
        'u-1',
      );
      expect(result.options).toHaveLength(1);
    });
  });

  describe('generateButterflySummary', () => {
    it('prose 清理 + 章节摘要与选择拼接', async () => {
      sendToAgentMock.mockResolvedValue({ reply: 'A tiny splurge, a decade of echoes.', toolCalls: [] });
      const summary = await generateButterflySummary(session(), 'u-1');
      expect(summary).toBe('A tiny splurge, a decade of echoes.');
      // user prompt 应含章标题与选择 label
      const sent = sendToAgentMock.mock.calls[0][0] as string;
      expect(sent).toContain('Ch1');
      expect(sent).toContain('咖啡机');
    });

    it('空回复: 落兜底金句 (不返回空串)', async () => {
      sendToAgentMock.mockResolvedValue({ reply: '', toolCalls: [] });
      const summary = await generateButterflySummary(session(), 'u-1');
      expect(summary).toContain('butterfly');
      expect(summary.length).toBeGreaterThan(20);
    });
  });

  describe('clearButterflyContextFromAgent (C2 记忆污染防护)', () => {
    it('发送清理指令: FICTIONAL 标记 + 偏好保留指令', async () => {
      sendToAgentMock.mockResolvedValue({ reply: 'ok', toolCalls: [] });
      await clearButterflyContextFromAgent('u-1', '用户倾向保守选择');
      const sent = sendToAgentMock.mock.calls[0][0] as string;
      expect(sent).toContain('FICTIONAL');
      expect(sent).toContain('用户倾向保守选择');
      expect(sent).toContain('CHOICE PREFERENCES');
    });

    it('清理失败不抛错 (非关键路径)', async () => {
      sendToAgentMock.mockRejectedValue(new Error('letta down'));
      await expect(
        clearButterflyContextFromAgent('u-1', 'x'),
      ).resolves.toBeUndefined();
    });
  });
});
