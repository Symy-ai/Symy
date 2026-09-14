/**
 * sse-event-mapper — Maps SSE event types to XState machine events
 *
 * 🔧 ARCH fix (Round 64 — machine-services.ts god component 拆分):
 *    从 machine-services.ts 提取 mapSSEEventToMachineEvent (~33 行)。
 *    machine-services.ts 从 898 行 → ~865 行。
 *
 * 高内聚低耦合: SSE 事件映射逻辑内聚到此文件, machine-services 只 import。
 */

import type { ButterflyMachineEvent } from './butterfly-machine';

/**
 * Map an SSE event object to a ButterflyMachineEvent.
 * Returns null for unknown event types (silently dropped).
 */
export function mapSSEEventToMachineEvent(event: { type: string; data: unknown }): ButterflyMachineEvent | null {
  switch (event.type) {
    case 'chapter_start':
      return { type: 'CHAPTER_START', data: event.data as import('../../types').ChapterStartData };
    case 'chapter_text':
      return { type: 'CHAPTER_TEXT', data: event.data as import('../../types').ChapterTextData };
    case 'chapter_end':
      return { type: 'CHAPTER_END', data: event.data as import('../../types').ChapterEndData };
    case 'choice_prompt':
      return { type: 'CHOICE_PROMPT', data: event.data as import('../../types').ChoicePromptData };
    case 'outline_updated':
      return { type: 'OUTLINE_UPDATED', data: event.data as import('../../types').OutlineData };
    case 'illustration_generated':
      return { type: 'ILLUSTRATION_GENERATED', data: event.data as import('../../types').IllustrationData };
    case 'illustration_failed':
      return { type: 'ILLUSTRATION_FAILED', data: event.data as { chapterIndex: number; reason: string } };
    case 'scene_illustration_generated':
      return { type: 'SCENE_ILLUSTRATION_GENERATED', data: event.data as import('../../types').SceneIllustrationData };
    case 'story_complete':
      return { type: 'STORY_COMPLETE', data: event.data as import('../../types').StoryCompleteData };
    case 'error':
      return { type: 'STREAM_ERROR', data: event.data as import('../../types').StoryErrorData };
    default:
      return null;
  }
}
