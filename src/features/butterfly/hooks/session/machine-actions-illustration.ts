/**
 * machine-actions-illustration — XState illustration tracking actions
 *
 * 提取自 machine-actions.ts (Round 4 拆分)
 * 包含: markChapterTriggered, pushClientIllustrationAttempted, pushGeneratingScene,
 *       pushRegenerating, assignClientIllustration, assignSceneIllustrationDone,
 *       assignPollingUpdate, clearPollingActive
 *
 * 🔧 ARCH fix Round 74 (Finding 15): Migrated typedAssign from `<TFn extends (...args: any[]) => any>`
 *    to explicit ButterflyAssignFn type (same pattern as machine-actions.ts Round 70).
 *    This gives compile-time checking that the function returns Partial<Context>.
 */

import { assign, type ActionFunction } from 'xstate';
import type { ButterflyMachineContext, ButterflyMachineEvent } from './butterfly-machine';
import type { StoryChapter } from '../../types';

const appendUnique = <T>(arr: T[], item: T): T[] =>
  arr.includes(item) ? arr : [...arr, item];

// 🔧 ARCH fix Round 74 (Finding 15): Explicit ButterflyAssignFn type (not (...args: any[]) => any)
type ButterflyAssignFn = (params: {
  context: ButterflyMachineContext;
  event: ButterflyMachineEvent;
}) => Partial<ButterflyMachineContext> | Record<string, never>;

function typedAssign(
  fn: ButterflyAssignFn,
): ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent> {
  // XState v5 assign() type inference limitation: actions defined outside setup() lose TEvent inference.
  // This cast is a known limitation; long-term fix is setup({ actions }) pattern.
  return assign(fn as Parameters<typeof assign>[0]) as unknown as ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent>;
}

function typedAssignObject(
  obj: Partial<ButterflyMachineContext>,
): ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent> {
  return assign(obj as Parameters<typeof assign>[0]) as unknown as ActionFunction<ButterflyMachineContext, ButterflyMachineEvent, ButterflyMachineEvent, undefined, never, never, never, never, ButterflyMachineEvent>;
}

export const IllustrationActions = {
  // ── illustration tracking ──
  markChapterTriggered: typedAssign(({ context, event }) => {
    if (event.type !== 'CHAPTER_END') return {};
    return {
      chapterSceneTriggered: appendUnique(context.chapterSceneTriggered, event.data.chapterIndex),
    };
  }),

  pushClientIllustrationAttempted: typedAssign(({ context, event }) => {
    if (event.type !== 'CLIENT_ILLU_DONE') return {};
    // 🔧 P0-A fix: CLIENT_ILLU_DONE event has { chapterIndex, url } at top-level (not in .data)
    //   旧代码: event.data.chapterIndex → event.data is undefined → crash
    //   修复: read from event.chapterIndex
    const e = event as { chapterIndex?: number };
    if (e.chapterIndex === undefined) return {};
    return {
      clientIllustrationAttempted: appendUnique(context.clientIllustrationAttempted, e.chapterIndex),
    };
  }),

  // 🔧 ARCH fix Round 74 (Finding 15): pushGeneratingScene DELETED — was dead code.
  //    Referenced context.generatingScenes (doesn't exist in ButterflyMachineContext)
  //    and event.type 'GENERATING_SCENE' (doesn't exist in ButterflyMachineEvent union).
  //    The action was never called (zero references in butterfly-machine.ts).
  //    Tighter typedAssign typing revealed these phantom references.

  pushRegenerating: typedAssign(({ context, event }) => {
    if (event.type !== 'REGENERATE_ILLUSTRATION') return {};
    // 🔧 P0-A fix: defensive — event.data may be undefined
    const e = event as { data?: { chapterIndex: number } };
    if (!e.data) return {};
    const chapterIdx = e.data.chapterIndex;
    const existing = context.regeneratingChapters.find((idx: number) => idx === chapterIdx);
    if (existing) return {};
    return {
      regeneratingChapters: [...context.regeneratingChapters, chapterIdx],
    };
  }),

  assignClientIllustration: typedAssign(({ context, event }) => {
    if (event.type !== 'CLIENT_ILLU_DONE') return {};
    // 🔧 P0-A fix: CLIENT_ILLU_DONE event has { chapterIndex, url } at top-level (not in .data)
    //   旧代码: const { chapterIndex, illustrationUrl } = event.data → event.data undefined → crash
    //   修复: read chapterIndex + url from top-level (field is 'url', not 'illustrationUrl')
    const chapterIndex = event.chapterIndex;
    const illustrationUrl = event.url;
    if (chapterIndex === undefined) return {};
    const updatedChapters = context.completedChapters.map((ch: StoryChapter) =>
      ch.index === chapterIndex ? { ...ch, illustrationUrl: illustrationUrl ?? ch.illustrationUrl } : ch,
    );
    return {
      completedChapters: updatedChapters,
      regeneratingChapters: context.regeneratingChapters.filter((idx: number) => idx !== chapterIndex),
    };
  }),

  assignSceneIllustrationDone: typedAssign(({ context, event }) => {
    // 🔧 ARCH fix Round 74 (Finding 15): Fixed event type guard — was 'SCENE_ILLUSTRATION_DONE'
    //    (doesn't exist in event union), actual event type is 'SCENE_ILLU_DONE'.
    //    Old guard was always true → action always returned {} → scene illustrations NEVER applied.
    //    Also fixed: context.completedChapters is StoryChapter[] (not ChapterData[]).
    //    StoryChapter has sceneIllustrations?: Record<number, string[]> (not scenes: SceneData[]).
    //    Now correctly updates sceneIllustrations[sceneIndex] with the new URL.
    if (event.type !== 'SCENE_ILLU_DONE') return {};
    const chapterIndex = event.chapterIndex;
    const sceneIndex = event.sceneIndex;
    const illustrationUrl = event.url;
    if (chapterIndex === undefined || sceneIndex === undefined) return {};
    const updatedChapters = context.completedChapters.map((ch: StoryChapter) => {
      if (ch.index !== chapterIndex) return ch;
      if (!illustrationUrl) return ch; // null URL → no update
      const existing = ch.sceneIllustrations?.[sceneIndex] || [];
      return {
        ...ch,
        sceneIllustrations: {
          ...ch.sceneIllustrations,
          [sceneIndex]: [...existing, illustrationUrl],
        },
      };
    });
    return {
      completedChapters: updatedChapters,
    };
  }),

  assignPollingUpdate: typedAssign(({ event }) => {
    // 🔧 P0-A fix: ILLUSTRATION_POLLING_UPDATE event has { chapters } at top-level (not in .data)
    //   旧代码: guard checked ILLUSTRATION_POLLING_DONE (wrong event) + read event.data.currentChapters (undefined) → crash
    //   修复: check ILLUSTRATION_POLLING_UPDATE, read event.chapters (top-level field)
    // 🔧 ARCH fix Round 74: cast to StoryChapter[] (not ChapterData[] — completedChapters is StoryChapter[])
    if (event.type !== 'ILLUSTRATION_POLLING_UPDATE') return {};
    const currentChapters = event.chapters;
    if (!Array.isArray(currentChapters)) return {};
    return {
      completedChapters: currentChapters as StoryChapter[],
      chapterSceneTriggered: [],
      clientIllustrationAttempted: [],
    };
  }),

  clearPollingActive: typedAssignObject({
    isPollingActive: false,
  }),
};
