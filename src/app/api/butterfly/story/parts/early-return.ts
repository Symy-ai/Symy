/**
 * Early-Return Path — All chapters already told
 *
 * 提取自 src/app/api/butterfly/story/route.ts (Round 79 拆分)
 *
 * 当 nextChapter 为 undefined (所有章节已讲完) 时走此路径:
 * 1. 用 completeStorySession helper 生成总结 + 更新 session + 清理 Agent 记忆
 * 2. 发送 story_complete SSE 事件
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ButterflySession, StoryEvent, StoryTone } from '@/features/butterfly/types';
import { SSE_HEADERS } from '@/lib/sse';
import { createSSEStream } from './create-sse-stream';
import { completeStorySession } from './complete-story';

export interface EarlyReturnParams {
  supabase: SupabaseClient;
  user: { id: string };
  session: ButterflySession;
  sessionRowUpdatedAt: string;
}

export interface EarlyReturnResult {
  response: Response;
}

/**
 * 处理所有章节已讲完的早返回路径。
 *
 * 返回 SSE Response (调用方直接 return)。
 *
 * 行为:
 * - 用 completeStorySession 完成 session (生成总结 + 更新 status + 清理 Agent)
 * - 发送 story_complete 事件
 */
export async function handleStoryCompleteEarlyReturn(
  params: EarlyReturnParams,
): Promise<EarlyReturnResult> {
  const { supabase, user, session, sessionRowUpdatedAt } = params;

  // 🔧 ARCH fix (Round 79): session.outline 已在 route.ts 检查过, 用 non-null assertion
  const outline = session.outline!;
  const finalTone = (outline.chapters[outline.chapters.length - 1]?.tone || 'twist') as StoryTone;

  // 用共享 helper 完成 session (总结 + 更新 status + 清理 Agent 记忆)
  const { storyCompleteData } = await completeStorySession({
    supabase,
    user,
    session,
    sessionRowUpdatedAt,
    finalTone,
    sessionForSummary: session,
    choicesForAgentClear: session.choices,
  });

  const completeEvent: StoryEvent = {
    type: 'story_complete',
    data: storyCompleteData,
  };

  // eslint-disable-next-line require-await -- async for API consistency
  const stream = createSSEStream(async (send) => {
    send(completeEvent);
  });

  // 调用方负责用 mergeCookiesOnResponse 包装返回的 response
  return { response: new Response(stream, { headers: { ...SSE_HEADERS } }) };
}
