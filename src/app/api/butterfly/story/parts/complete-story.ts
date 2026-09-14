/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * Story Completion Helpers — Shared between early-return and final-chapter paths
 *
 * 提取自 src/app/api/butterfly/story/route.ts (Round 79 拆分)
 *
 * 两个路径都需要:
 * 1. 生成蝴蝶效应总结 (10s 超时)
 * 2. 更新 session status='completed' (乐观锁 + 失败重试)
 * 3. 清理 Agent 记忆中的虚构故事 (fire-and-forget + waitUntil)
 *
 * 提取到共享 helper 消除重复, 集中维护完成逻辑。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ButterflySession, StoryCompleteData, StoryTone } from '@/features/butterfly/types';
import { generateButterflySummary, clearButterflyContextFromAgent } from '@/features/butterfly/lib/story-engine';
import { logger } from '@/lib/logger';
import { fireAndForgetSafely } from '@/lib/admin-audit';
import { createHealthEvent } from '@/lib/health-impact';
// 🔧 P1-5 机制闭合 (Round 90): Gacha 完成后补充 breath + bump intimacy
import { fireBumpIntimacy } from '@/lib/companion-rpc';

const DEFAULT_SUMMARY = 'A single decision, like a butterfly\'s wing, changed everything — but not in the way anyone could have predicted.';

export interface CompleteStoryParams {
  supabase: SupabaseClient;
  user: { id: string };
  session: ButterflySession;
  /** sessionRow.updated_at — 用于乐观锁 */
  sessionRowUpdatedAt: string;
  /** 最终 tone — 早返回路径用 outline 最后一个 chapter, final-chapter 路径用当前 chapter */
  finalTone: StoryTone;
  /** 用于生成总结的 session (可能含刚保存的 chapters/choices) */
  sessionForSummary: ButterflySession;
  /** 用于清理 Agent 记忆的 choices (可能含刚保存的 choice) */
  choicesForAgentClear: ButterflySession['choices'];
}

export interface CompleteStoryResult {
  summary: string;
  finalTone: StoryTone;
  storyCompleteData: StoryCompleteData;
}

/**
 * 生成蝴蝶效应总结 + 更新 session 为 completed + 异步清理 Agent 记忆。
 *
 * 行为:
 * - 10s 超时保护总结生成, 失败用占位文本
 * - 乐观锁更新 session status='completed', 失败重试不带锁
 * - 异步清理 Agent 记忆 (waitUntil + fallback fire-and-forget)
 *
 * 返回 story_complete 事件 data, 调用方负责 send。
 */
export async function completeStorySession(
  params: CompleteStoryParams,
): Promise<CompleteStoryResult> {
  const { supabase, user, session, sessionRowUpdatedAt, finalTone, sessionForSummary, choicesForAgentClear } = params;

  // 1. 生成总结 (10s 超时)
  let summary = DEFAULT_SUMMARY;
  try {
    let summaryTimer: ReturnType<typeof setTimeout> | null = null;
    summary = await Promise.race([
      generateButterflySummary(sessionForSummary, user.id, sessionForSummary.context || undefined).then(result => {
        if (summaryTimer) clearTimeout(summaryTimer);
        return result;
      }).catch(err => {
        if (summaryTimer) clearTimeout(summaryTimer);
        throw err;
      }),
      new Promise<string>((resolve) => {
        summaryTimer = setTimeout(() => resolve(summary), 10_000);
      }),
    ]);
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Butterfly API] Summary generation failed:', err);
  }

  // 2. 更新 session status='completed' (乐观锁 + 失败重试)
  // 🔧 ARCH fix (Round 2 H8): 加乐观锁, 失败重试不带锁 (status='completed' 是幂等)
  const { data: completedRow } = await supabase
    .from('butterfly_sessions')
    .update({
      status: 'completed',
      butterfly_effect: summary,
      final_tone: finalTone,
    })
    .eq('id', session.id)
    .eq('updated_at', sessionRowUpdatedAt)
    .select('id')
    .maybeSingle();

  if (!completedRow) {
    logger.info('[Butterfly Story] Optimistic lock failed, retrying without lock');
    await supabase
      .from('butterfly_sessions')
      .update({
        status: 'completed',
        butterfly_effect: summary,
        final_tone: finalTone,
      })
      .eq('id', session.id);
  }

  // 3. 异步清理 Agent 记忆 (fire-and-forget + waitUntil)
  clearAgentMemoryFireAndForget(user.id, choicesForAgentClear);

  // 4. 🔧 P1-4 fix: 即时奖励 — 故事完成时给 15 tokens + 5 vitality
  //    降低完成门槛后，给用户正向反馈，提升完成率
  try {
    await createHealthEvent({
      userId: user.id,
      eventType: 'butterfly_completed',
      description: 'You completed a reclaimed life story. +15 tokens, +5 vitality.',
      vitalityOverride: 5,
      tokenOverride: 15,
      metadata: { sessionId: session.id, storyType: (session as unknown as Record<string, unknown>).storyType ?? undefined },
      triggerSource: 'butterfly_story',
      triggerId: `bf-complete:${session.id}`,
    });
    logger.info('[Butterfly Story] Completion reward given: +15 tokens, +5 vitality', { sessionId: session.id, userId: user.id });
      // safe to ignore: non-critical background operation, error already logged
  } catch (rewardErr) {
    logger.warn('[Butterfly Story] Failed to give completion reward (non-blocking):', rewardErr);
  }

  // 🔧 P1-5 机制闭合 (Round 90): Gacha 完成后 bump intimacy
  //    🔧 PM-P2-7 fix (2026-07-17): 删除 breath 补充 (breath 属性已移除)
  //    旧代码: fireReplenishDailyNeed(user.id, 'breath', 25) + fireBumpIntimacy(user.id, 2)
  //    新代码: 只 bump intimacy +2 (深度互动)
  // 🔧 Round 91 fix: await RPC 调用 (fire-and-forget 在 Vercel serverless 会被 kill)
  await fireBumpIntimacy(user.id, 2);

  return {
    summary,
    finalTone,
    storyCompleteData: {
      finalTone,
      totalChapters: sessionForSummary.chapters.length,
      butterflyEffect: summary,
    },
  };
}

/**
 * 异步清理 Agent 记忆中的虚构故事内容。
 *
 * 行为:
 * - fire-and-forget (不阻塞主流程)
 * - 用 waitUntil (Vercel) 延长函数生命周期, 防止 Vercel 杀函数导致清理未完成
 * - 失败时 logger.warn (不静默吞错, 不阻塞主流程)
 */
export function clearAgentMemoryFireAndForget(
  userId: string,
  choices: ButterflySession['choices'],
): void {
  // C2 fix: 会话结束后清理 Agent 记忆
  const choicesSummary = choices
    .filter(c => c.selectedOption)
    .map(c => `At chapter ${c.chapterIndex}, chose: ${c.options.find(o => o.id === c.selectedOption)?.label || c.selectedOption}`)
    .join('; ');
  // 🔧 ARCH fix (Round 11 H4): 旧代码 .catch(() => {}) 静默吞错 → Agent 记忆污染不可见
  //    根因修复: 至少记录 warning (fire-and-forget 仍保留, 不阻塞主流程)
  // 🔧 ARCH fix (Round 21 BUG-R21-H2/M6 — fire-and-forget 在 serverless 中丢失):
  //    Vercel 在响应发送后可能杀函数 → Letta API 调用未完成 → Agent 记忆中残留虚构故事
  //    → 后续聊天中 Agent 把虚构事件当真实发生过的事引用。
  //    根因修复: 用 waitUntil (Vercel) 延长函数生命周期; fallback 到 fire-and-forget。
  const clearPromise = clearButterflyContextFromAgent(userId, choicesSummary).catch(err => {
    logger.warn('[Butterfly Story] Failed to clear butterfly context from Agent — memory may be polluted:', err);
  });
  // 🔧 ARCH fix (Round 5 AUDIT-1 M-2): 用共享 fireAndForgetSafely 替代 5 处重复的 waitUntil 模式
  fireAndForgetSafely(clearPromise);
}
