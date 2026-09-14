/**
 * 预加载 SSE 流解析纯逻辑（从 use-butterfly-session.ts 抽出，阶段1拆分）
 *
 * 纯函数，无 React hooks，无副作用。行为零变化。
 * preloadNextChapter / preloadBranch 共享的 SSE 事件累积逻辑。
 */

import type {
  StoryEvent,
  ChapterStartData,
  ChapterTextData,
  ChapterEndData,
  IllustrationData,
  ChoicePromptData,
  OutlineData,
  StoryCompleteData,
  StoryChapter,
  StoryTone,
  StoryOutline,
  ChoiceOption,
  DecisionType,
} from '../../types';
import { getDemoChapterIllustrationUrl } from '../../lib/demo-content';

// ============================================================
// 累积器类型 — preloadNextChapter / preloadBranch 共用
// ============================================================

export interface PreloadAccumulator {
  chapterText: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterTone: StoryTone;
  chapterTimeSpan: string;
  hasChoice: boolean;
  illustrationUrl: string | null;
  choiceData: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null;
  newOutline: StoryOutline | null;
  /** story_complete 事件的数据（handler 需据此执行副作用） */
  storyCompleteData: StoryCompleteData | null;
}

/** 创建初始空累积器 */
export function createPreloadAccumulator(): PreloadAccumulator {
  return {
    chapterText: '',
    chapterIndex: 0,
    chapterTitle: '',
    chapterTone: 'neutral',
    chapterTimeSpan: '',
    hasChoice: false,
    illustrationUrl: null,
    choiceData: null,
    newOutline: null,
    storyCompleteData: null,
  };
}

// ============================================================
// SSE 行解析
// ============================================================

/**
 * 从 SSE 行解析出 StoryEvent，无效行返回 null。
 * 行格式：`data: {...JSON...}`，`data: [DONE]` 跳过。
 */
export function parseSSELine(line: string): StoryEvent | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (!data || data === '[DONE]') return null;
  try {
    return JSON.parse(data) as StoryEvent;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return null;
  }
}

// ============================================================
// SSE 事件累积（纯逻辑，副作用留 handler）
// ============================================================

/** reducePreloadEvent 的上下文参数 */
export interface PreloadContext {
  isDemo: boolean;
  decisionType: DecisionType | undefined;
  decisionDescription: string | undefined;
}

/**
 * 纯函数：根据 SSE event 更新累积器状态。
 * - outline_generated/outline_updated: 需 ctx.decisionType/decisionDescription 构造 newOutline
 * - chapter_start: illustrationUrl 按 ctx.isDemo 选择（demo 用预置 CDN，normal 留空等 AI 生成）
 * - story_complete: 仅记录数据到 acc.storyCompleteData，handler 据此执行副作用
 *
 * 不执行任何 setState / ref 赋值 / 外部调用 — 纯数据转换。
 * 返回新对象，不 mutate 原 acc。
 */
export function reducePreloadEvent(
  event: StoryEvent,
  acc: PreloadAccumulator,
  ctx: PreloadContext,
): PreloadAccumulator {
  switch (event.type) {
    case 'outline_generated':
    case 'outline_updated': {
      // BUG-287 fix: decisionType/decisionDescription 缺失时跳过（原 sessionRef.current 为 null 时 break）
      if (ctx.decisionType === undefined || ctx.decisionDescription === undefined) return acc;
      const outlineData = event.data as OutlineData;
      return {
        ...acc,
        newOutline: {
          version: outlineData.version,
          decisionType: ctx.decisionType,
          decisionDescription: ctx.decisionDescription,
          chapters: outlineData.chapters,
          endingHint: outlineData.endingHint,
        },
      };
    }

    case 'chapter_start': {
      const startData = event.data as ChapterStartData;
      return {
        ...acc,
        chapterIndex: startData.chapterIndex,
        chapterTitle: startData.title,
        chapterTone: startData.tone,
        chapterTimeSpan: startData.timeSpan,
        // V20: Normal mode no longer uses SVG placeholder, wait for AI illustration
        illustrationUrl: ctx.isDemo
          ? getDemoChapterIllustrationUrl(startData.chapterIndex)
          : '',
      };
    }

    case 'chapter_text': {
      const textData = event.data as ChapterTextData;
      return { ...acc, chapterText: acc.chapterText + textData.text };
    }

    case 'chapter_end': {
      const endData = event.data as ChapterEndData;
      return {
        ...acc,
        chapterText: endData.fullText ? endData.fullText : acc.chapterText,
        hasChoice: endData.hasChoice,
      };
    }

    case 'illustration_generated': {
      const illustData = event.data as IllustrationData;
      if (illustData.chapterIndex === acc.chapterIndex) {
        return { ...acc, illustrationUrl: illustData.illustrationUrl };
      }
      return acc;
    }

    case 'choice_prompt': {
      const choicePrompt = event.data as ChoicePromptData;
      return {
        ...acc,
        choiceData: {
          chapterIndex: choicePrompt.chapterIndex,
          prompt: choicePrompt.prompt,
          options: choicePrompt.options,
        },
      };
    }

    case 'story_complete': {
      // V32: 仅记录数据，handler 据此执行副作用（不在此处 setState）
      const completeData = event.data as StoryCompleteData;
      return { ...acc, storyCompleteData: completeData };
    }

    default:
      return acc;
  }
}

// ============================================================
// 从累积器构造 StoryChapter
// ============================================================

/**
 * 从累积器构造预加载的 StoryChapter 对象。
 * 仅当 chapterIndex > 0 && chapterText 有值时调用。
 */
export function buildPreloadedChapter(acc: PreloadAccumulator): StoryChapter {
  return {
    index: acc.chapterIndex,
    title: acc.chapterTitle,
    content: acc.chapterText,
    tone: acc.chapterTone,
    timeSpan: acc.chapterTimeSpan,
    hasChoice: acc.hasChoice,
    illustrationUrl: acc.illustrationUrl || undefined,
    createdAt: new Date().toISOString(),
  };
}
