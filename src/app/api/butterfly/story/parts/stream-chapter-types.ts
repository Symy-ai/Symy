/**
 * stream-chapter-types — Type definitions and constants extracted from stream-chapter.ts
 *
 * 🔧 ARCH fix (2026-07-22): Extracted types to reduce stream-chapter.ts
 *    from 802 to <800 lines. Types are pure declarations with no runtime
 *    code, safe to extract without behavior change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ButterflySession, OutlineChapter, DecisionType } from '@/features/butterfly/types';

// Vercel serverless 函数超时保护
// 🔧 2026-07-20 (P0 fix): letta/auto 非 reasoning 模式更快, 30s 足够
//    旧代码: 110s（GLM-5.2 reasoning 需要更长，maxDuration=120 留 10s buffer）
//    修复: 30s（letta/auto 非 reasoning 模式通常 10-30s 响应，maxDuration=60 留 30s buffer）
export const STREAM_TIMEOUT_MS = 30_000;

// 🔧 AI-RETRY fix: 如果 AI 返回空内容, 最多重试 2 次
export const MAX_STORY_RETRIES = 2;

export interface StreamChapterParams {
  controller: ReadableStreamDefaultController<Uint8Array>;
  supabase: SupabaseClient;
  user: { id: string };
  session: ButterflySession;
  sessionRowUpdatedAt: string;
  nextChapter: OutlineChapter;
  isLight: boolean;
  isFirstChapter: boolean;
  outline: {
    version: number;
    chapters: OutlineChapter[];
    endingHint: string;
  };
  decisionType: DecisionType;
  decisionDesc: string;
  /**
   * 🔧 ARCH fix Round 73 (Finding 8.4): AbortSignal from the client request.
   * When the client disconnects, this signal fires. streamStoryChapter attaches an
   * abort listener that cancels the active Letta stream reader → cascades to Letta
   * HTTP abort → stops GLM token generation (cost leak prevention).
   *
   * Passed by route.ts from `request.signal` (Next.js provides this).
   */
  signal?: AbortSignal;
  /** 🔧 2026-07-17: 用户语言设置, 用于生成对应语言的故事 */
  locale?: string;
}
