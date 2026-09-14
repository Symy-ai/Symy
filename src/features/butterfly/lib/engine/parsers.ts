/**
 * story-engine — LLM 输出解析器 + fallback 生成（从 story-engine.ts 抽出，C6 拆分）
 *
 * 纯函数，无副作用。行为零变化。
 */

import type {
  DecisionType,
  StoryOutline,
  OutlineChapter,
  ChoiceOption,
  StoryTone,
  StoryChapter,
} from '../../types';
import { CHOICE_CHAPTER_INDICES, DEFAULT_CHAPTER_COUNT } from './constants';

export function parseOutlineFromLLM(
  content: string,
  decisionType: DecisionType,
  decisionDescription: string,
): StoryOutline {
  // 尝试提取 JSON（LLM 可能在 JSON 前后加文字）
  // M5 fix: 先尝试非贪心匹配，再尝试贪心匹配作为后备
  let jsonStr: string | null = null;
  const lazyMatch = content.match(/\{[\s\S]*?\}(?=\s*$|\s*```)/);
  if (lazyMatch) {
    try {
      JSON.parse(lazyMatch[0]);
      jsonStr = lazyMatch[0];
    } catch {
      // 非贪心匹配结果不是有效 JSON，继续尝试贪心
    }
  }
  if (!jsonStr) {
    const greedyMatch = content.match(/\{[\s\S]*\}/);
    if (greedyMatch) {
      jsonStr = greedyMatch[0];
    }
  }
  if (!jsonStr) {
    return generateFallbackOutline(decisionType, decisionDescription);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const chapters: OutlineChapter[] = (parsed.chapters || []).map(
      (ch: Record<string, unknown>, i: number) => ({
        index: typeof ch.index === 'number' ? ch.index : i + 1,
        title: String(ch.title || `Chapter ${i + 1}`),
        summary: String(ch.summary || ''),
        hasChoice: CHOICE_CHAPTER_INDICES.includes(i + 1),
        choicePrompt: ch.choicePrompt ? String(ch.choicePrompt) : undefined,
        tone: validateTone(ch.tone),
        timeSpan: String(ch.timeSpan || 'sometime later'),
      })
    );

    // 确保 hasChoice 正确
    for (const ch of chapters) {
      ch.hasChoice = CHOICE_CHAPTER_INDICES.includes(ch.index);
    }

    return {
      version: 1,
      decisionType,
      decisionDescription,
      chapters,
      endingHint: String(parsed.endingHint || 'The future remains unwritten.'),
    };
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return generateFallbackOutline(decisionType, decisionDescription);
  }
}

/**
 * 🔧 2026-07-17 (speed fix): 解析完整故事 JSON (一次生成 3 章内容)
 *   格式: { chapters: [{index, title, content, tone, timeSpan}], butterflyEffect, finalTone }
 *   失败时返回 fallback 3 章内容
 */
export function parseCompleteStoryFromLLM(
  content: string,
  decisionType: DecisionType,
  decisionDescription: string,
): {
  chapters: StoryChapter[];
  butterflyEffect: string;
  finalTone: StoryTone;
} {
  // 提取 JSON
  let jsonStr: string | null = null;
  const greedyMatch = content.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    jsonStr = greedyMatch[0];
  }

  if (!jsonStr) {
    return generateFallbackCompleteStory(decisionType, decisionDescription);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const now = new Date().toISOString();
    const chapters: StoryChapter[] = (parsed.chapters || []).slice(0, DEFAULT_CHAPTER_COUNT).map(
      (ch: Record<string, unknown>, i: number) => ({
        index: typeof ch.index === 'number' ? ch.index : i + 1,
        title: String(ch.title || `Chapter ${i + 1}`),
        content: String(ch.content || ''),
        tone: validateTone(ch.tone),
        timeSpan: String(ch.timeSpan || 'sometime later'),
        hasChoice: false, // 🔧 speed fix: 无 choice, 纯线性 3 章
        choice: undefined,
        illustrationUrl: undefined,
        sceneIllustrations: undefined,
        createdAt: now,
      }),
    );

    // 补齐不足 3 章的情况
    while (chapters.length < DEFAULT_CHAPTER_COUNT) {
      const idx = chapters.length + 1;
      chapters.push({
        index: idx,
        title: `Chapter ${idx}`,
        content: '',
        tone: 'neutral',
        timeSpan: 'sometime later',
        hasChoice: false,
        createdAt: now,
      });
    }

    const butterflyEffect = String(parsed.butterflyEffect || 'The ripples of this decision spread further than anyone could have predicted.');
    const finalTone = validateTone(parsed.finalTone || chapters[chapters.length - 1].tone);

    return { chapters, butterflyEffect, finalTone };
  } catch {
    // safe to ignore: JSON 解析失败时返回 fallback 故事, 用户仍能看到 3 章内容 (虽是占位)
    return generateFallbackCompleteStory(decisionType, decisionDescription);
  }
}

/**
 * 🔧 speed fix: fallback 完整故事 (LLM 失败时用)
 */
function generateFallbackCompleteStory(
  decisionType: DecisionType,
  decisionDescription: string,
): {
  chapters: StoryChapter[];
  butterflyEffect: string;
  finalTone: StoryTone;
} {
  const action = decisionType === 'bought' ? 'bought' : decisionType === 'resisted' ? 'resisted' : 'imagined buying';
  const now = new Date().toISOString();
  const chapters: StoryChapter[] = [
    {
      index: 1,
      title: 'The Moment of Decision',
      content: `The moment you ${action} "${decisionDescription}" — a choice that seems small, but ripples are already forming.`,
      tone: 'neutral',
      timeSpan: 'that evening',
      hasChoice: false,
      createdAt: now,
    },
    {
      index: 2,
      title: 'The First Ripple',
      content: 'Consequences start to emerge, not in the way you expected. The decision\'s impact begins to take shape.',
      tone: 'dark',
      timeSpan: 'the next morning',
      hasChoice: false,
      createdAt: now,
    },
    {
      index: 3,
      title: 'The Twist',
      content: 'In a final ironic turn, you realize the outcome was never what it seemed. The butterfly effect has the last laugh.',
      tone: 'twist',
      timeSpan: 'two days later',
      hasChoice: false,
      createdAt: now,
    },
  ];
  return {
    chapters,
    butterflyEffect: 'Sometimes the smallest decisions echo the loudest.',
    finalTone: 'twist',
  };
}

/**
 * 从 LLM 响应中解析选择 JSON
 */
export function parseChoiceFromLLM(content: string): { prompt: string; options: ChoiceOption[] } {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      prompt: 'Which path do you take?',
      options: [
        { id: 'A', label: 'The safe path', hint: 'Sometimes safety is its own reward.' },
        { id: 'B', label: 'The unknown path', hint: 'The road less traveled holds surprises.' },
      ],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const rawOptions: ChoiceOption[] = (parsed.options || []).map((opt: Record<string, unknown>, i: number) => ({
      id: String(opt.id || String.fromCharCode(65 + i)), // A, B, C, ...
      label: String(opt.label || 'Option'),
      hint: String(opt.hint || ''),
    }));
    // M13 fix: 确保选项 ID 唯一
    const seenIds = new Set<string>();
    const options = rawOptions.map(opt => {
      let id = opt.id;
      let counter = 0;
      while (seenIds.has(id)) {
        counter++;
        id = `${opt.id}_${counter}`;
      }
      seenIds.add(id);
      return { ...opt, id };
    });
    return {
      prompt: String(parsed.prompt || 'What do you choose?'),
      options,
    };
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return {
      prompt: 'Which path do you take?',
      options: [
        { id: 'A', label: 'The safe path', hint: 'Sometimes safety is its own reward.' },
        { id: 'B', label: 'The unknown path', hint: 'The road less traveled holds surprises.' },
      ],
    };
  }
}

/**
 * 验证 tone 值
 */
export function validateTone(tone: unknown): StoryTone {
  const valid: StoryTone[] = ['hopeful', 'neutral', 'dark', 'twist'];
  if (typeof tone === 'string' && valid.includes(tone as StoryTone)) {
    return tone as StoryTone;
  }
  return 'neutral';
}

/**
 * 降级大纲（LLM 解析失败时使用）
 *
 * 🔧 ARCH fix (Round 75 ARCH-DEEP-75 — fallback 大纲仍是旧的 5 章节结构):
 *    旧代码返回 5 个章节, hasChoice=true 在第 2 + 第 4 章。但 DEFAULT_CHAPTER_COUNT=3
 *    且 CHOICE_CHAPTER_INDICES=[2] (V37 优化: 5→3 章节, 选择只发生在第 2 章)。
 *    后果: LLM 完全失败时, 用户看到 5 章 (而非 3 章) 且第 4 章后出现一个本不应存在的
 *    choice prompt — 用户选择后 regenerateOutline 试图合并, 但 session.chapters.length
 *    可能 > DEFAULT_CHAPTER_COUNT, 导致剧情流混乱。
 *    根因修复: 对齐到 3 章节结构, hasChoice 只在第 2 章, 第 3 章为结局 (tone=twist)。
 */
export function generateFallbackOutline(
  decisionType: DecisionType,
  decisionDescription: string,
): StoryOutline {
  // 🔧 2026-07-17 (task 1): considering → "imagined buying" (假设性 bought)
  const action = decisionType === 'bought' ? 'bought' : decisionType === 'resisted' ? 'resisted' : 'imagined buying';
  return {
    version: 1,
    decisionType,
    decisionDescription,
    chapters: [
      {
        index: 1,
        title: 'The Moment of Decision',
        summary: `The moment you ${action} "${decisionDescription}" — a choice that seems small, but ripples are already forming.`,
        hasChoice: false,
        tone: 'neutral',
        timeSpan: 'that evening',
      },
      {
        index: 2,
        title: 'The First Ripple',
        summary: 'Consequences start to emerge, not in the way you expected. The decision\'s impact begins to take shape.',
        hasChoice: true,
        tone: 'twist',
        timeSpan: 'the next morning',
      },
      {
        index: 3,
        title: 'Where the Ripples End',
        summary: 'You stand at a crossroads you never saw coming. The path behind you and the path ahead seem to belong to different stories.',
        hasChoice: false,
        tone: 'twist',
        timeSpan: 'later that afternoon',
      },
    ],
    endingHint: 'The ending is neither what you feared nor what you hoped for.',
  };
}

