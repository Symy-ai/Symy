/**
 * useButterflyNormalPlayer — 纯辅助函数（从 use-butterfly-normal-player.ts 抽出，C2 拆分）
 *
 * 纯函数，无 React hooks，无副作用。行为零变化。
 */

import type { StoryChapter, StoryTone, ButterflySession } from '../../types';
// eslint-disable-next-line no-duplicate-imports
import type { StoryCompleteData } from '../../types';
import type { SceneData, ChapterData } from './types';

// ============================================================
// 场景分割
// ============================================================

export function splitScenes(content: string): string[] {
  if (!content) return [];
  const scenes = content.split('|||').map(s => s.trim()).filter(s => s.length > 0);
  if (scenes.length <= 1 && content.length > 80) {
    const sentences = content.match(/[^.!?。！？]+[.!?。！？]+/g) || [content];
    const result: string[] = [];
    let current = '';
    // 🔧 BUG-275 fix: 使用索引循环替代 indexOf，正确处理重复句子
    for (let i = 0; i < sentences.length; i++) {
      current += sentences[i];
      if (current.length > 50 || i === sentences.length - 1) {
        result.push(current.trim());
        current = '';
      }
    }
    return result.filter(s => s.length > 0);
  }
  return scenes.length > 0 ? scenes : [content];
}

// ============================================================
// StoryChapter → ChapterData 转换
// ============================================================

export function convertStoryChapterToChapterData(ch: StoryChapter): ChapterData {
  const sceneTexts = splitScenes(ch.content);
  // V24: Normal模式不再fallback到demo图片，AI图片未到时显示空字符串（渐变背景）
  const sceneIllust = ch.sceneIllustrations || null;

  const scenes: SceneData[] = sceneTexts.map((text, idx) => {
    const imgs = sceneIllust?.[idx];
    // 🔧 ARCH fix (Round 65 LOW-5): 移除冗余 `as unknown as string` 双重断言
    //   旧代码: typeof imgs === 'string' ? (imgs as unknown as string) — TS 在 typeof === 'string'
    //   分支里已将 imgs 收窄为 string, 双重断言多余且掩盖真实类型。
    const imageUrl = Array.isArray(imgs) && imgs.length > 0
      ? imgs[0]
      : typeof imgs === 'string'
        ? imgs
        : ch.illustrationUrl || ''; // AI图片未到时imageUrl为空，DemoScenePlayer显示渐变背景
    return { text, imageUrl };
  });

  return {
    index: ch.index,
    title: ch.title,
    tone: ch.tone,
    timeSpan: ch.timeSpan,
    hasChoice: ch.hasChoice,
    scenes,
  };
}

// ============================================================
// submitChoice 后续处理辅助函数
// 解决 TS 跨 await 保留属性访问 narrowing 的问题 (独立函数不传播 narrowing)
// ============================================================

// 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): StoryCompleteData 单一 source of truth (../../types)
//    旧代码: 此处重复定义, 与 types/index.ts drift 风险
//    根因修复: re-export from canonical location
export type { StoryCompleteData };

/**
 * 检查 submitChoice 完成后是否需要切换到 'complete' 阶段。
 * 独立函数：参数为 declared types，TS 不会跨函数边界传播 narrowing，
 * 因此可以正确判断 status === 'completed' 等条件。
 */
export function shouldCompleteAfterSubmit(args: {
  butterflyEffect: string | null;
  storyComplete: StoryCompleteData | null;
  preloadedStoryComplete: StoryCompleteData | null;
  session: ButterflySession | null;
}): boolean {
  return !!(args.butterflyEffect || args.storyComplete || args.preloadedStoryComplete || args.session?.status === 'completed');
}

/**
 * 计算 butterflyEffect / finalTone 的最终值，优先级：
 * butterflyEffectRef > preloadedStoryComplete > storyComplete > session > 默认值
 */
export function computeCompleteValues(args: {
  butterflyEffect: string | null;
  finalTone: StoryTone | null;
  storyComplete: StoryCompleteData | null;
  preloadedStoryComplete: StoryCompleteData | null;
  session: ButterflySession | null;
}): { bf: string; ft: StoryTone } {
  const bf = args.butterflyEffect
    || args.preloadedStoryComplete?.butterflyEffect
    || args.storyComplete?.butterflyEffect
    || args.session?.butterflyEffect
    || 'Your butterfly effect story is complete.';
  const ft = args.finalTone
    || args.preloadedStoryComplete?.finalTone
    || args.storyComplete?.finalTone
    || args.session?.finalTone
    || 'twist';
  return { bf, ft };
}

// ============================================================
// 🔧 架构优化 Round 58: i18n fallback choice (Finding 5)
// ============================================================

import type { useI18n } from '@/i18n/provider';

/**
 * Get localized fallback choice when AI/DB fails to deliver choice data.
 *
 * 🔧 架构优化: 旧代码在两处硬编码英文 fallback, 中文用户看到英文
 * 修复: 提取为纯函数, 通过 t() 本地化
 */
export function getFallbackChoice(
  t: ReturnType<typeof useI18n>['t'],
): { prompt: string; options: Array<{ id: string; label: string; hint: string }> } {
  return {
    prompt: t('butterfly.fallbackChoicePrompt', { defaultValue: 'Which path do you take?' }),
    options: [
      {
        id: 'A',
        label: t('butterfly.fallbackChoiceA', { defaultValue: 'The familiar path' }),
        hint: t('butterfly.fallbackChoiceAHint', { defaultValue: 'Safety has its own cost.' }),
      },
      {
        id: 'B',
        label: t('butterfly.fallbackChoiceB', { defaultValue: 'The uncharted path' }),
        hint: t('butterfly.fallbackChoiceBHint', { defaultValue: 'The unknown holds both treasure and danger.' }),
      },
    ],
  };
}
