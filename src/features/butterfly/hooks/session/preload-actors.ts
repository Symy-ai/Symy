/**
 * preload-actors — XState preload spawn actors
 *
 * 🔧 ARCH fix (Round 64 — machine-services.ts god component 拆分):
 *    从 machine-services.ts 提取 preloadNextChapterActor + preloadBranchActor (~220 行)。
 *    machine-services.ts 从 867 行 → ~650 行 (✅ 低于 800 行限制)。
 *
 * 高内聚低耦合: preload actor 逻辑内聚到此文件, machine-services 只 re-export。
 */

import { fromCallback } from 'xstate';
import type { ButterflyMachineEvent } from './butterfly-machine';
import type {
  PreloadNextChapterInput,
  PreloadBranchInput,
} from './service-inputs';
import type { ChoicePromptData } from '../../types';
import {
  createPreloadAccumulator,
  parseSSELine,
  reducePreloadEvent,
  buildPreloadedChapter,
} from './preload-logic';
import { buildChoicesMap } from './helpers';

// ── preloadNextChapterActor：后台预加载下一章（fromCallback + sendBack）──
export const preloadNextChapterActor = fromCallback<ButterflyMachineEvent, PreloadNextChapterInput>(({ input, sendBack }) => {
  let cancelled = false;
  const abortController = new AbortController();
  const timer = setTimeout(async () => {
    if (cancelled) return;
    if (!input.session || input.session?.status === 'completed') {
      sendBack({ type: 'PRELOAD_CHAPTER_DONE', data: null });
      return;
    }

    try {
      const response = await fetch(input.endpoints.story, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.isDemo ? {
          sessionId: input.session!.id,
          decisionType: input.session!.decisionType,
          decisionDescription: input.session!.decisionDescription,
          currentChapter: input.session!.currentChapter,
          choices: buildChoicesMap(input.session!.choices),
        } : { sessionId: input.session!.id, isLight: input.isLight }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        sendBack({ type: 'PRELOAD_CHAPTER_DONE', data: null });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        sendBack({ type: 'PRELOAD_CHAPTER_DONE', data: null });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let acc = createPreloadAccumulator();

      while (true) {
        if (cancelled) return;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const event = parseSSELine(line);
          if (!event) continue;

          acc = reducePreloadEvent(event, acc, {
            isDemo: input.isDemo,
            decisionType: input.session?.decisionType,
            decisionDescription: input.session?.decisionDescription,
          });

          if (acc.storyCompleteData) {
            sendBack({
              type: 'PRELOAD_STORY_COMPLETE_DONE',
              data: {
                finalTone: acc.storyCompleteData.finalTone,
                totalChapters: acc.storyCompleteData.totalChapters,
                butterflyEffect: acc.storyCompleteData.butterflyEffect,
              },
            });
            sendBack({ type: 'PRELOAD_CHAPTER_DONE', data: null });
            return;
          }
        }
      }

      if (acc.chapterIndex > 0 && acc.chapterText) {
        const preloadedChapter = buildPreloadedChapter(acc);
        sendBack({
          type: 'PRELOAD_CHAPTER_DONE',
          data: {
            chapter: preloadedChapter,
            choice: acc.choiceData,
            outline: acc.newOutline,
            illustrationUrl: acc.illustrationUrl,
          },
        });
        if (acc.choiceData) {
          sendBack({
            type: 'CHOICE_PROMPT',
            data: {
              chapterIndex: acc.choiceData.chapterIndex,
              prompt: acc.choiceData.prompt,
              options: acc.choiceData.options,
            } as ChoicePromptData,
          });
        }
      } else {
        sendBack({ type: 'PRELOAD_CHAPTER_DONE', data: null });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      sendBack({ type: 'PRELOAD_CHAPTER_DONE', data: null });
    }
  }, 500);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    abortController.abort();
  };
});

// ── preloadBranchActor：预加载选择分支（fromCallback + sendBack）──
export const preloadBranchActor = fromCallback<ButterflyMachineEvent, PreloadBranchInput>(({ input, sendBack }) => {
  let cancelled = false;
  const abortController = new AbortController();

  (async () => {
    if (!input.session || input.isDemo) {
      sendBack({ type: 'PRELOAD_BRANCH_DONE', optionId: input.optionId, data: null });
      return;
    }

    try {
      const response = await fetch(input.endpoints.preloadBranch, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: input.session!.id,
          chapterIndex: input.session!.currentChapter,
          selectedOption: input.optionId,
          isLight: input.isLight,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || cancelled) {
        sendBack({ type: 'PRELOAD_BRANCH_DONE', optionId: input.optionId, data: null });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        sendBack({ type: 'PRELOAD_BRANCH_DONE', optionId: input.optionId, data: null });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let acc = createPreloadAccumulator();

      while (true) {
        if (cancelled) return;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const event = parseSSELine(line);
          if (!event) continue;
          acc = reducePreloadEvent(event, acc, {
            isDemo: input.isDemo,
            decisionType: input.session?.decisionType,
            decisionDescription: input.session?.decisionDescription,
          });
        }
      }

      if (acc.chapterIndex > 0 && acc.chapterText) {
        const preloadedChapter = buildPreloadedChapter(acc);
        sendBack({
          type: 'PRELOAD_BRANCH_DONE',
          optionId: input.optionId,
          data: {
            chapter: preloadedChapter,
            outline: acc.newOutline,
            choice: acc.choiceData,
          },
        });
      } else {
        sendBack({ type: 'PRELOAD_BRANCH_DONE', optionId: input.optionId, data: null });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      sendBack({ type: 'PRELOAD_BRANCH_DONE', optionId: input.optionId, data: null });
    }
  })();

  return () => {
    cancelled = true;
    abortController.abort();
  };
});
