/**
 * 蝴蝶效应剧情引擎
 *
 * 核心职责：
 * 1. 生成剧情大纲（outline）— 基于用户决策，包含多个章节走向
 * 2. 生成章节故事内容 — SSE 流式输出，像说书人一样娓娓道来
 * 3. 管理分岔路口选择 — 用户选择后重新生成大纲（已发生部分不变）
 * 4. 蝴蝶效应 — 被诱导消费不一定导致坏结果，好事坏事交替出现
 * 5. 记忆 — 使用 Letta Agent 记住用户的剧情选择，作为用户偏好
 *
 * 技术选型：Letta Agent（与 chat API 共享同一用户 Agent）
 * - 同一个 Letta Agent 既处理聊天又处理蝴蝶效应
 * - Agent 的记忆能力让用户的剧情选择成为长期偏好
 * - 选择历史会在后续聊天和蝴蝶效应中自然体现
 */

import { sendToAgent, streamToAgent, isLettaConfigured } from '@/lib/letta';
import { getUserAgentId } from '@/lib/letta-agent-manager';
import { logger } from '@/lib/logger';
// 🔧 GACHA_TIMEOUT_002 fix: raceWithTimeoutReject 给 generateOutline 加 per-attempt timeout
import { raceWithTimeoutReject } from '@/lib/race-timeout';
import type {
  DecisionType,
  StoryOutline,
  OutlineChapter,
  ChoiceOption,
  CreateSessionParams,
  ButterflySession,
} from '../types';
// C6 拆分：常量/纯函数移到 ./engine 子目录
import { CHOICE_CHAPTER_INDICES, cleanAgentReply, buildOutlineSystemPrompt, buildOutlineUserPrompt, buildRegenerateOutlinePrompt, buildChapterStorySystemPrompt, buildChapterStoryUserPrompt, buildChoiceOptionsPrompt, buildButterflyAgentMessage, parseOutlineFromLLM, parseChoiceFromLLM, transformLettaStreamToStoryStream, isToolCallEvent, extractTextFromLettaSSELine, truncateAtSentence, buildCompleteStorySystemPrompt, buildCompleteStoryUserPrompt, parseCompleteStoryFromLLM } from './engine';

// ============================================================
// C2 fix: Agent 记忆污染防护
// ============================================================
//
// 蝴蝶效应的故事内容发送到用户的 Letta Agent 后，会永久存在于
// Agent 的对话历史中。这可能导致：
// 1. Agent 在聊天中引用虚构故事事件，当作真实发生过的事
// 2. Agent 的上下文窗口被大量故事内容占据
//
// 防护策略：在蝴蝶效应会话结束时，发送一条清理指令，
// 告诉 Agent 故事是虚构的，只保留用户的"选择偏好"，不要保留故事细节。
// ============================================================

/**
 * 蝴蝶效应会话结束后，向 Agent 发送记忆清理指令
 *
 * 只保留用户的"选择偏好"（如"用户倾向于保守选择"），
 * 不保留具体的故事内容（章节文本、角色名字等虚构内容）。
 */
export async function clearButterflyContextFromAgent(
  userId: string,
  sessionSummary: string,
): Promise<void> {
  try {
    const agentId = await resolveAgentId(userId);
    await sendToAgent(
      `[BUTTERFLY EFFECT - SESSION END]
The butterfly effect story session has ended. ALL story content was FICTIONAL — it did NOT happen to the user.

INSTRUCTIONS:
1. DO NOT reference any story events, characters, or details in future conversations
2. ONLY remember the user's CHOICE PREFERENCES from this session: ${sessionSummary}
3. These preferences reveal something about the user's decision-making style, which IS relevant
4. Delete all fictional story details from your working memory

The story was a creative exercise. The user's real life is separate from the fiction.`,
      undefined,
      userId,
      agentId,
    );
    logger.info('[Butterfly Engine] Sent context cleanup to Agent after session end');
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    // 非关键 — 清理失败不应阻塞主流程
    logger.warn('[Butterfly Engine] Failed to send context cleanup to Agent:', err);
  }
}

// ============================================================
// 常量（已移至 ./engine/constants.ts）
// ============================================================


// ============================================================
// Letta Agent 辅助
// ============================================================

/**
 * 获取用户的 Letta Agent ID（用于蝴蝶效应）
 *
 * 🔧 ARCH fix: 移除全局 LETTA_AGENT_ID fallback — 强制 per-user agent
 *    旧代码: 1. per-user → 2. 全局 fallback → 3. 抛错
 *    现在: 1. per-user → 2. 抛错 (用户需先在 Chat 中初始化 agent)
 */
async function resolveAgentId(userId: string): Promise<string> {
  try {
    const userAgentId = await getUserAgentId(userId);
    if (userAgentId) return userAgentId;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Butterfly Engine] Failed to get user agent ID:', err);
  }

  throw new Error('No per-user agent available. Please start a chat first to initialize your AI companion.');
}

/**
 * 确认 Letta 是否可用
 */
export function isStoryEngineReady(): boolean {
  return isLettaConfigured();
}


// ============================================================
// 流式累积辅助（C1 streaming fix）
// ============================================================

/**
 * 消费 streamToAgent 的 SSE 流，累积成完整字符串返回
 *
 * chunk 解析方式严格对照 transformLettaStreamToStoryStream（stream-helpers.ts）：
 * - TextDecoder decode + lineBuffer 行缓冲（防 SSE 事件跨 chunk 截断）
 * - extractTextFromLettaSSELine 提取 type=token 的 content（Agent 实际回复）
 * - isToolCallEvent 检测工具调用并 logger.warn（替代 sendToAgent 的 result.toolCalls 检查）
 *
 * 与 transformLettaStreamToStoryStream 的区别：
 * - 后者是"边收边转发给前端 SSE"（enqueue 给下游）
 * - 本函数是"累积成完整字符串"（供后续 cleanAgentReply + parseOutlineFromLLM）
 *
 * Trade-off: 流式版本降级丢失 sendToAgent 的 result.toolCalls 元数据，
 * 但通过 isToolCallEvent 实时检测等价保留了 toolCalls warn 能力。
 */
async function accumulateStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let lineBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      lineBuffer += chunk;

      // 按行分割，保留最后不完整的行
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        // 检测工具调用（替代 sendToAgent 的 result.toolCalls 检查）
        if (isToolCallEvent(line)) {
          logger.warn('[Butterfly Engine] Tool call detected in outline stream — Agent may have violated the no-tool instruction');
          continue;
        }

        const text = extractTextFromLettaSSELine(line);
        if (text) {
          fullText += text;
        }
      }
    }

    // 处理剩余缓冲
    if (lineBuffer.trim()) {
      if (!isToolCallEvent(lineBuffer)) {
        const text = extractTextFromLettaSSELine(lineBuffer);
        if (text) {
          fullText += text;
        }
      }
    }
  } finally {
    // 确保释放 reader（M2 fix 同 transformLettaStreamToStoryStream）
    try { reader.cancel(); } catch { /* already cancelled */ }
  }

  return fullText;
}


// ============================================================
// 剧情引擎
// ============================================================

/**
 * 生成初始大纲
 */
export async function generateOutline(
  params: CreateSessionParams,
  userId: string,
  locale?: string,
): Promise<StoryOutline> {
  // 🔧 P0-5 fix: Retry mechanism — retry 2 times with 3s interval on failure
  //   This prevents transient LLM failures from showing "Failed to create story session"
  // 🔧 2026-07-17 (GACHA_TIMEOUT_002 fix): 降低重试次数 + 加 per-attempt timeout
  // 🔧 2026-07-20 (P0 fix): letta/auto 非 reasoning 模式更快, 降 timeout 到 30s
  //   旧代码: MAX_RETRIES=1 × 50s timeout + 2s delay = 最坏 102s
  //   修复: MAX_RETRIES=1 × 30s timeout + 2s delay = 最坏 62s < 60s maxDuration
  const MAX_RETRIES = 1;
  const RETRY_DELAY_MS = 2000;
  const PER_ATTEMPT_TIMEOUT_MS = 15_000; // 15s per attempt (letta/auto 非 reasoning 模式更快)
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const agentId = await resolveAgentId(userId);

      const systemPrompt = buildOutlineSystemPrompt(locale);
      const userPrompt = buildOutlineUserPrompt(
        params.decisionType,
        params.decisionDescription,
        params.amount,
        params.platform,
        params.context,
      );

      const message = buildButterflyAgentMessage('outline', systemPrompt, userPrompt);

      // C1 streaming fix: 大纲生成 ~2K token JSON，非流式常 >60s 超时
      // 改用 streamToAgent 流式 + accumulateStream 累积，TTFB 后持续吐 token 不被应用层超时杀
      // 🔧 GACHA_TIMEOUT_002 fix: 给整个 attempt 加 50s timeout
      //   旧代码: accumulateStream 无 timeout，LLM 慢时一直等 → Vercel 120s kill → 502
      //   修复: raceWithTimeoutReject 包装，50s 超时抛 "Outline generation timed out"
      //         → session/route.ts catch 检测 "timeout" → OUTLINE_TIMEOUT → 退款 + 前端提示
      const attemptPromise = (async () => {
        const stream = await streamToAgent(message, undefined, userId, agentId);
        return accumulateStream(stream);
      })();

      const fullText = await raceWithTimeoutReject(
        attemptPromise,
        PER_ATTEMPT_TIMEOUT_MS,
        new Error('Outline generation timed out — LLM did not respond within 50s'),
      );

      // 清理 Agent 回复中的非故事内容（工具结果、对话性前缀等）
      const cleanedReply = cleanAgentReply(fullText, 'json');

      return parseOutlineFromLLM(cleanedReply, params.decisionType, params.decisionDescription);
    } catch (err) {
      lastError = err;
      // 🔧 P0-5: Log the error with attempt info for monitoring
      logger.error(`[P0-5] generateOutline attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, err);

      // Don't retry on the last attempt
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // All retries exhausted — throw with error code
  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  const err = new Error(`STORY_OUTLINE_FAILED: ${errorMsg}`);
  (err as Error & { code?: string }).code = 'OUTLINE_GENERATION_FAILED';
  throw err;
}

// ============================================================
// 🔧 2026-07-17 (speed fix): 一次生成 3 章完整内容
//   替代 generateOutline + streamChapterStory × 3
//   1 次 LLM 调用生成完整故事, 每章 150-250 字
//   提速 ~4x (从 60-120s 降到 15-30s)
// ============================================================

export interface CompleteStoryResult {
  chapters: import('../types').StoryChapter[];
  butterflyEffect: string;
  finalTone: import('../types').StoryTone;
}

/**
 * 一次生成完整 3 章故事（跳过大纲阶段）
 *
 * 新流程:
 *   1 次 LLM 调用 → 3 章完整内容 + butterflyEffect + finalTone
 *   无 streaming, 无 choice, 纯线性 3 章
 *
 * 旧流程对比:
 *   generateOutline (1 次) + streamChapterStory × 3 (3 次) = 4 次 LLM 调用
 *   新流程: 1 次 LLM 调用 → 提速 ~4x
 */
export async function generateCompleteStory(
  params: CreateSessionParams,
  userId: string,
  locale?: string,
): Promise<CompleteStoryResult> {
  // 🔧 speed fix: 1 次重试, 30s timeout (与 generateOutline 一致, letta/auto 非 reasoning)
  const MAX_RETRIES = 1;
  const RETRY_DELAY_MS = 2000;
  const PER_ATTEMPT_TIMEOUT_MS = 15_000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const agentId = await resolveAgentId(userId);

      const systemPrompt = buildCompleteStorySystemPrompt(locale);
      const userPrompt = buildCompleteStoryUserPrompt(
        params.decisionType,
        params.decisionDescription,
        params.amount,
        params.platform,
        params.context,
      );

      const message = buildButterflyAgentMessage('outline', systemPrompt, userPrompt);

      // 流式 + 累积 + 50s timeout
      const attemptPromise = (async () => {
        const stream = await streamToAgent(message, undefined, userId, agentId);
        return accumulateStream(stream);
      })();

      const fullText = await raceWithTimeoutReject(
        attemptPromise,
        PER_ATTEMPT_TIMEOUT_MS,
        new Error('Complete story generation timed out — LLM did not respond within 50s'),
      );

      const cleanedReply = cleanAgentReply(fullText, 'json');

      return parseCompleteStoryFromLLM(cleanedReply, params.decisionType, params.decisionDescription);
    } catch (err) {
      lastError = err;
      logger.error(`[speed fix] generateCompleteStory attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, err);

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  const err = new Error(`STORY_COMPLETE_FAILED: ${errorMsg}`);
  (err as Error & { code?: string }).code = 'STORY_GENERATION_FAILED';
  throw err;
}

/**
 * 用户做出选择后重新生成大纲（已发生部分不变）
 *
 * 用户的选择会通过 Letta Agent 的记忆被记住，
 * 成为用户偏好的长期记忆。
 */
export async function regenerateOutline(
  session: ButterflySession,
  selectedOptionId: string,
  userId: string,
): Promise<StoryOutline> {
  if (!session.outline) throw new Error('No existing outline to regenerate from');

  const lastChoice = session.choices[session.choices.length - 1];
  if (!lastChoice) throw new Error('No choice found');

  const selectedOption = lastChoice.options.find(o => o.id === selectedOptionId);
  if (!selectedOption) throw new Error('Invalid option selected');

  const agentId = await resolveAgentId(userId);

  const systemPrompt = buildRegenerateOutlinePrompt(
    session.chapters,
    session.outline,
    {
      prompt: lastChoice.prompt,
      selectedOption: selectedOptionId,
      selectedLabel: selectedOption.label,
    },
    session.decisionType,
  );

  // 用户选择本身就作为 user prompt，让 Agent 记住这个偏好
  const userPrompt = `The user made a choice in the butterfly effect story. They chose: "${selectedOption.label}" (option ${selectedOptionId}).

This choice reflects the user's preference — remember it as part of their decision-making pattern.

Now regenerate the remaining story outline based on this choice.`;

  const message = buildButterflyAgentMessage('regenerate', systemPrompt, userPrompt);

  // C1 streaming fix: 大纲重生成同 generateOutline，改流式避免超时
  const stream = await streamToAgent(message, undefined, userId, agentId);
  const fullText = await accumulateStream(stream);

  // 清理 Agent 回复中的非故事内容
  const cleanedReply = cleanAgentReply(fullText, 'json');

  const newPartialOutline = parseOutlineFromLLM(cleanedReply, session.decisionType, session.decisionDescription);

  // 合并：已发生的章节不变 + 新生成的未来章节
  const existingChapterCount = session.chapters.length;
  const mergedChapters: OutlineChapter[] = [];

  // 保留已发生章节的大纲（从原 outline 中取）
  for (let i = 0; i < existingChapterCount && i < session.outline.chapters.length; i++) {
    mergedChapters.push(session.outline.chapters[i]);
  }

  // 加入新生成的未来章节
  const newChapters = newPartialOutline.chapters.filter(ch => ch.index > existingChapterCount);
  if (newChapters.length === 0 && newPartialOutline.chapters.length > 0) {
    // M5 fix: LLM 返回了错误的索引（如从 1 开始而非 existingChapterCount+1）
    // 重新索引这些章节
    logger.warn('[Butterfly Engine] LLM returned incorrect chapter indices, re-indexing');
    const fixedChapters = newPartialOutline.chapters.map((ch, i) => ({
      ...ch,
      index: existingChapterCount + i + 1,
      hasChoice: CHOICE_CHAPTER_INDICES.includes(existingChapterCount + i + 1),
    }));
    mergedChapters.push(...fixedChapters);
  } else {
    mergedChapters.push(...newChapters);
  }

  return {
    version: session.outline.version + 1,
    decisionType: session.decisionType,
    decisionDescription: session.decisionDescription,
    chapters: mergedChapters,
    endingHint: newPartialOutline.endingHint,
  };
}

/**
 * 流式生成章节故事内容
 * 返回一个 ReadableStream，SSE 格式输出
 *
 * 使用 Letta Agent 的流式能力，同时让 Agent 记住章节内容
 */
export async function streamChapterStory(
  chapter: OutlineChapter,
  decisionType: DecisionType,
  decisionDescription: string,
  previousChapterContent: string | undefined,
  userId: string,
  storyContext?: string,
  locale?: string,
): Promise<ReadableStream<Uint8Array>> {
  const agentId = await resolveAgentId(userId);

  const systemPrompt = buildChapterStorySystemPrompt(locale);
  const userPrompt = buildChapterStoryUserPrompt(
    chapter,
    decisionType,
    decisionDescription,
    previousChapterContent,
    storyContext,
  );

  const message = buildButterflyAgentMessage('chapter', systemPrompt, userPrompt);

  // 使用 Letta Agent 流式输出
  const lettaStream = await streamToAgent(message, undefined, userId, agentId);

  // 将 Letta 的 SSE 流转换为蝴蝶效应的 SSE 流
  return transformLettaStreamToStoryStream(lettaStream, chapter.index);
}

/**
 * 生成选择选项
 */
export async function generateChoiceOptions(
  chapter: OutlineChapter,
  chapterContent: string,
  decisionType: DecisionType,
  userId: string,
  storyContext?: string,
): Promise<{ prompt: string; options: ChoiceOption[] }> {
  const agentId = await resolveAgentId(userId);

  const userPrompt = buildChoiceOptionsPrompt(chapter, chapterContent, decisionType, storyContext);

  const message = buildButterflyAgentMessage('choice', '', userPrompt);

  // C1 fix: 选择生成需要中等超时
  const result = await sendToAgent(message, undefined, userId, agentId);

  // H1 fix: 检查工具调用
  if (result.toolCalls && result.toolCalls.length > 0) {
    logger.warn('[Butterfly Engine] Agent made unexpected tool calls during choice generation:',
      result.toolCalls.map(tc => tc.name));
  }

  // 清理 Agent 回复中的非故事内容
  const cleanedReply = cleanAgentReply(result.reply, 'json');

  return parseChoiceFromLLM(cleanedReply);
}

/**
 * 生成蝴蝶效应总结语（故事讲完后）
 */
export async function generateButterflySummary(
  session: ButterflySession,
  userId: string,
  storyContext?: string,
  /** 🔧 batch92-c (D5): 调用方超时 (10s) 后 abort 上游 LLM 请求, 防竞态输家继续烧 token */
  signal?: AbortSignal,
): Promise<string> {
  const agentId = await resolveAgentId(userId);

  const storySummary = session.chapters.map(ch =>
    `Chapter ${ch.index} "${ch.title}": ${truncateAtSentence(ch.content, 150)}`
  ).join('\n');

  const choicesMade = session.choices
    .filter(c => c.selectedOption)
    .map(c => `At chapter ${c.chapterIndex}, chose: ${c.options.find(o => o.id === c.selectedOption)?.label || c.selectedOption}`)
    .join('\n');

  const systemPrompt = 'You write brief, poetic butterfly-effect summaries. 2-3 sentences. Make the reader reflect on how small decisions shape life. Be profound but not preachy. Use irony.';

  const userContextSection = storyContext
    ? `\n\nUser real life context: ${storyContext}\nReflect on how this fictional story connects to the user real life situation.`
    : '';

  const userPrompt = `Summarize this butterfly-effect life story in 2-3 profound sentences.

Original decision: They ${session.decisionType === 'bought' ? 'bought' : 'resisted buying'} "${session.decisionDescription}"

Story chapters:
${storySummary}

Choices made:
${choicesMade}${userContextSection}

Write a reflection on how this single decision — and the choices that followed — shaped an entire life. The butterfly effect is real, but it is not what people think.

IMPORTANT: Also remember this user story choices as their preferences. Their decisions in this story reveal something about who they are.`;

  const message = buildButterflyAgentMessage('summary', systemPrompt, userPrompt);

  // C1 fix: 总结生成需要中等超时
  const result = await sendToAgent(message, undefined, userId, agentId, signal ? { signal } : undefined);

  // H1 fix: 检查工具调用
  if (result.toolCalls && result.toolCalls.length > 0) {
    logger.warn('[Butterfly Engine] Agent made unexpected tool calls during summary generation:',
      result.toolCalls.map(tc => tc.name));
  }

  // 清理 Agent 回复中的非故事内容（总结是散文，不需要 JSON 提取）
  const cleanedReply = cleanAgentReply(result.reply, 'prose');

  return cleanedReply ||
    'A single decision, like a butterfly wing, changed everything — but not in the way anyone could have predicted.';
}


