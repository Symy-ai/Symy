/**
 * Butterfly History Detail — Helper Functions
 *
 * 🔧 ARCH fix (2026-07-21): Extracted from butterfly-history-detail.tsx (772 lines)
 *    to improve code organization and reduce component file size.
 *
 * These functions are pure (no side effects, no React hooks) and can be
 * tested independently.
 */

import type { ButterflySession, StoryChapter, StoryTone, ButterflyChoice } from '../types';
import { splitScenes } from '@/features/butterfly/hooks/player';

/** A single scene extracted from a chapter's content */
export interface HistoryScene {
  chapterIndex: number;
  chapterTitle: string;
  tone: StoryTone;
  timeSpan: string;
  sceneIndex: number;
  totalScenes: number;
  text: string;
  imageUrl: string;
}

/**
 * Extract all scenes from a list of chapters.
 * Each chapter's content is split into scenes, and each scene is paired with
 * its corresponding illustration (if available).
 */
export function extractScenes(chapters: StoryChapter[]): HistoryScene[] {
  const scenes: HistoryScene[] = [];
  for (const ch of chapters) {
    const sceneTexts = splitScenes(ch.content);
    const sceneIllust = ch.sceneIllustrations || null;
    sceneTexts.forEach((text, idx) => {
      const imgs = sceneIllust?.[idx];
      const imageUrl = Array.isArray(imgs) && imgs.length > 0
        ? imgs[0]
        : typeof imgs === 'string'
          ? imgs
          : (idx === 0 ? (ch.illustrationUrl || '') : '');
      scenes.push({
        chapterIndex: ch.index,
        chapterTitle: ch.title,
        tone: ch.tone,
        timeSpan: ch.timeSpan,
        sceneIndex: idx,
        totalScenes: sceneTexts.length,
        text,
        imageUrl,
      });
    });
  }
  return scenes;
}

/**
 * Get the choice (if any) for a specific chapter.
 * Returns null if the chapter has no selected choice.
 */
export function getChoiceForChapter(session: ButterflySession, chapterIndex: number): ButterflyChoice | null {
  return session.choices.find(c => c.chapterIndex === chapterIndex && c.selectedOption) || null;
}

/**
 * Get the label for a specific option ID within a choice.
 * Returns the optionId itself if the option is not found (fallback).
 */
export function getOptionLabel(choice: ButterflyChoice, optionId: string | null): string {
  if (!optionId) return '';
  const opt = choice.options.find(o => o.id === optionId);
  return opt ? opt.label : optionId;
}
