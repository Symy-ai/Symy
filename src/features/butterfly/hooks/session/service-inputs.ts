/**
 * service-inputs — XState service/actor input type definitions
 *
 * 🔧 ARCH fix (Round 62 — machine-services.ts god component 拆分):
 *    从 machine-services.ts 提取所有 service input 接口 (~100 行)。
 *    machine-services.ts 从 1192 行 → ~1092 行。
 *
 * 高内聚低耦合: 类型定义内聚到此文件, machine-services 只 import。
 */

import type { ButterflySession, CreateSessionParams, StoryChapter, StoryOutline, ChoiceOption } from '../../types';
import type { ButterflyEndpoints } from './butterfly-machine';

export interface LoadActiveInput {
  userId: string | null;
  isDemo: boolean;
  endpoints: ButterflyEndpoints;
}

export interface GenerateOutlineInput {
  params: CreateSessionParams;
  userId: string | null;
  isDemo: boolean;
  endpoints: ButterflyEndpoints;
}

export interface StreamStoryInput {
  session: ButterflySession | null;
  isDemo: boolean;
  isLight: boolean;
  endpoints: ButterflyEndpoints;
  /** UI locale — 请求体带给 story API，故事内容按此语言生成（profile.locale 缺失时的兜底） */
  locale?: string;
  demoOverride?: { currentChapter: number; choices: Record<number, string> };
}

export interface SubmitChoiceInput {
  session: ButterflySession | null;
  chapterIndex: number;
  selectedOption: string;
  isDemo: boolean;
  isLight: boolean;
  endpoints: ButterflyEndpoints;
  preloadedBranches: Record<string, { chapter: StoryChapter; outline: StoryOutline | null; choice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null }>;
  pendingChoice: { chapterIndex: number; prompt: string; options: ChoiceOption[] } | null;
}

export interface RegenerateInput {
  session: ButterflySession | null;
  chapterIndex: number;
  isDemo: boolean;
  endpoints: ButterflyEndpoints;
}

// spawn actor input 类型
export interface PreloadNextChapterInput {
  session: ButterflySession;
  isDemo: boolean;
  isLight: boolean;
  endpoints: ButterflyEndpoints;
}

export interface PreloadBranchInput {
  session: ButterflySession;
  optionId: string;
  isDemo: boolean;
  isLight: boolean;
  endpoints: ButterflyEndpoints;
}

export interface TryClientIllustrationInput {
  chapterIndex: number;
  title: string;
  tone: import('../../types').StoryTone;
  timeSpan: string;
  decisionDescription: string;
  // 🔧 2026-07-17 (task 1 fix): 加 'considering' (与 DecisionType 对齐)
  decisionType: 'bought' | 'resisted' | 'considering';
}

export interface GenerateSceneIllustrationsInput {
  chapterIndex: number;
  chapterContent: string;
  chapterTitle: string;
  tone: import('../../types').StoryTone;
  decisionDescription: string;
  isDemo: boolean;
  endpoints: ButterflyEndpoints;
}

export interface IllustrationPollingInput {
  sessionId: string;
  currentChapters: StoryChapter[];
  endpoints: ButterflyEndpoints;
}
