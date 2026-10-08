import { describe, expect, it } from 'vitest';

import type {
  ButterflySession,
  ChapterEndData,
  ChapterStartData,
  ChapterTextData,
  ChoiceOption,
  ChoicePromptData,
  CreateSessionParams,
  DecisionType,
  IllustrationData,
  OutlineChapter,
  OutlineData,
  SceneIllustrationData,
  SessionStatus,
  StoryChapter,
  StoryEvent,
  StoryEventType,
  StoryOutline,
  StoryTone,
} from '../index';

/**
 * types/index.ts (300行) — butterfly 域类型聚合件 (24 export)。
 *
 * 纯类型件策略 (R130 方法论): satisfies 锚定关键联合类型与核心接口字段,
 * 防下游 (preload-logic/parsers/machine 等 15+ 文件) 漂移。
 */

describe('butterfly types 联合类型锚定', () => {
  it('DecisionType 三值 / SessionStatus 三值 / StoryTone 四值', () => {
    const d: DecisionType[] = ['bought', 'resisted', 'considering'];
    const s: SessionStatus[] = ['active', 'completed', 'abandoned'];
    const t: StoryTone[] = ['hopeful', 'neutral', 'dark', 'twist'];
    expect(d).toHaveLength(3);
    expect(s).toHaveLength(3);
    expect(t).toHaveLength(4); // 与 parsers validateTone 合法集一致 (R122 锚定)
  });
});

describe('核心接口字段锚定', () => {
  it('StoryOutline: version/decisionType/description/chapters/endingHint', () => {
    const o = {
      version: 1,
      decisionType: 'bought' as DecisionType,
      decisionDescription: 'd',
      chapters: [{
        index: 1, title: 't', summary: 's', hasChoice: false, tone: 'neutral' as StoryTone, timeSpan: 'x',
      } satisfies OutlineChapter],
      endingHint: 'e',
    } satisfies StoryOutline;
    expect(o.chapters[0].index).toBe(1);
  });

  it('StoryChapter 十字段 (index/title/content/tone/timeSpan/hasChoice + 可选插图)', () => {
    const ch = {
      index: 2,
      title: '二',
      content: '正文',
      tone: 'twist' as StoryTone,
      timeSpan: '次日',
      hasChoice: true,
      illustrationUrl: 'https://i/x.png',
      sceneIllustrations: { 0: ['https://i/s0.png'] },
      createdAt: 't',
    } satisfies StoryChapter;
    expect(ch.sceneIllustrations?.[0]).toHaveLength(1);
  });

  it('ButterflySession 核心字段 (含 amount/platform 可空)', () => {
    const s = {
      id: 's1', userId: 'u1',
      decisionType: 'resisted' as DecisionType, decisionDescription: 'd',
      amount: null, platform: null, context: null,
      outline: null, currentChapter: 0, chapters: [], choices: [],
      butterflyEffect: null, finalTone: null,
      status: 'active' as SessionStatus,
      createdAt: 't', updatedAt: 't',
    } satisfies ButterflySession;
    expect(s.status).toBe('active');
    expect(s.amount).toBeNull();
  });

  it('CreateSessionParams + ChoiceOption + ButterflyChoice', () => {
    const opt = { id: 'A', label: '甲', hint: 'h' } satisfies ChoiceOption;
    const params = {
      decisionType: 'bought' as DecisionType,
      decisionDescription: 'd',
      locale: 'zh',
      isDemo: false,
    } as CreateSessionParams;
    expect(opt.id).toBe('A');
    expect(params.locale).toBe('zh');
  });

  it('SSE 事件名 11 种 (outline_generated/.../scene_illustration_generated/error)', () => {
    const et: StoryEventType[] = [
      'outline_generated', 'chapter_start', 'chapter_text', 'chapter_end',
      'choice_prompt', 'outline_updated', 'illustration_generated',
      'illustration_failed', 'scene_illustration_generated', 'story_complete', 'error',
    ];
    expect(et).toHaveLength(11);
  });

  it('SSE 载荷族: *Data 无 type 字段 (StoryEvent={type,data} 信封分离)', () => {
    const text = { chapterIndex: 1, text: '正文' } satisfies ChapterTextData;
    const start = { chapterIndex: 1, title: '一', tone: 'neutral' as StoryTone, timeSpan: '晚' } satisfies ChapterStartData;
    const end = { chapterIndex: 1, hasChoice: false } satisfies ChapterEndData;
    const prompt = { chapterIndex: 2, prompt: '选哪条?', options: [] } satisfies ChoicePromptData;
    const outline = { version: 1, chapters: [], endingHint: 'e' } satisfies OutlineData;
    const illu = { chapterIndex: 1, illustrationUrl: 'u' } satisfies IllustrationData;
    const scene = { chapterIndex: 1, sceneIndex: 0, illustrationUrl: 'su' } satisfies SceneIllustrationData;
    const ev = { type: 'chapter_text' as StoryEventType, data: text } satisfies StoryEvent;
    expect(text.text).toBe('正文');
    expect(start.timeSpan).toBe('晚');
    expect(end.hasChoice).toBe(false);
    expect(prompt.options).toEqual([]);
    expect(outline.version).toBe(1);
    expect(illu.illustrationUrl).toBe('u');
    expect(scene.sceneIndex).toBe(0);
    expect(ev.type).toBe('chapter_text');
  });
});
