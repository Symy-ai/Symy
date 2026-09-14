/**
 * use-butterflyNormalPlayer — Reducer（集中状态管理）
 *
 * 替代 19 个 useState，所有状态转换集中到 reducer。
 * 行为零变化：只改 state 管理方式，不改逻辑。
 */

import type { DecisionType, StoryTone, ChoiceOption } from '../../types';
import type { ChapterData, NormalPhase } from './types';

// ============================================================
// State 类型
// ============================================================

export interface NormalPlayerState {
  // UI state
  phase: NormalPhase;
  decisionType: DecisionType | null;
  decisionDescription: string;
  currentChapterIndex: number;
  currentSceneIndex: number;
  completedChapters: ChapterData[];
  currentChoice: { prompt: string; options: ChoiceOption[] } | null;
  butterflyEffect: string | null;
  finalTone: StoryTone | null;
  choices: Record<number, string>;
  isLoading: boolean;
  error: string | null;

  // Streaming chapter state
  isStreamingChapter: boolean;
  streamingChapterMeta: {
    index: number;
    title: string;
    tone: StoryTone;
    timeSpan: string;
    illustrationUrl: string;
  } | null;
}

export const initialNormalPlayerState: NormalPlayerState = {
  phase: 'idle',
  decisionType: null,
  decisionDescription: '',
  currentChapterIndex: 1,
  currentSceneIndex: 0,
  completedChapters: [],
  currentChoice: null,
  butterflyEffect: null,
  finalTone: null,
  choices: {},
  isLoading: false,
  error: null,
  isStreamingChapter: false,
  streamingChapterMeta: null,
};

// ============================================================
// Action 类型
// ============================================================

export type NormalPlayerAction =
  | { type: 'SET_PHASE'; payload: NormalPhase }
  | { type: 'SET_DECISION_TYPE'; payload: DecisionType | null }
  | { type: 'SET_DECISION_DESCRIPTION'; payload: string }
  | { type: 'SET_CURRENT_CHAPTER_INDEX'; payload: number }
  | { type: 'SET_CURRENT_SCENE_INDEX'; payload: number }
  | { type: 'SET_COMPLETED_CHAPTERS'; payload: ChapterData[] }
  | { type: 'UPDATE_COMPLETED_CHAPTERS'; payload: (prev: ChapterData[]) => ChapterData[] }
  | { type: 'SET_CURRENT_CHOICE'; payload: { prompt: string; options: ChoiceOption[] } | null }
  | { type: 'SET_BUTTERFLY_EFFECT'; payload: string | null }
  | { type: 'SET_FINAL_TONE'; payload: StoryTone | null }
  | { type: 'SET_CHOICES'; payload: Record<number, string> }
  | { type: 'UPDATE_CHOICES'; payload: (prev: Record<number, string>) => Record<number, string> }
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_IS_STREAMING_CHAPTER'; payload: boolean }
  | { type: 'SET_STREAMING_CHAPTER_META'; payload: NormalPlayerState['streamingChapterMeta'] }
  | { type: 'RESET_PLAYER' };

// ============================================================
// Reducer
// ============================================================

export function normalPlayerReducer(
  state: NormalPlayerState,
  action: NormalPlayerAction,
): NormalPlayerState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    case 'SET_DECISION_TYPE':
      return { ...state, decisionType: action.payload };
    case 'SET_DECISION_DESCRIPTION':
      return { ...state, decisionDescription: action.payload };
    case 'SET_CURRENT_CHAPTER_INDEX':
      return { ...state, currentChapterIndex: action.payload };
    case 'SET_CURRENT_SCENE_INDEX':
      return { ...state, currentSceneIndex: action.payload };
    case 'SET_COMPLETED_CHAPTERS':
      return { ...state, completedChapters: action.payload };
    case 'UPDATE_COMPLETED_CHAPTERS':
      return { ...state, completedChapters: action.payload(state.completedChapters) };
    case 'SET_CURRENT_CHOICE':
      return { ...state, currentChoice: action.payload };
    case 'SET_BUTTERFLY_EFFECT':
      return { ...state, butterflyEffect: action.payload };
    case 'SET_FINAL_TONE':
      return { ...state, finalTone: action.payload };
    case 'SET_CHOICES':
      return { ...state, choices: action.payload };
    case 'UPDATE_CHOICES':
      return { ...state, choices: action.payload(state.choices) };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_IS_STREAMING_CHAPTER':
      return { ...state, isStreamingChapter: action.payload };
    case 'SET_STREAMING_CHAPTER_META':
      return { ...state, streamingChapterMeta: action.payload };
    case 'RESET_PLAYER':
      return { ...initialNormalPlayerState };
    default:
      return state;
  }
}
