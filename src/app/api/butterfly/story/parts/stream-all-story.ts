/**
 * stream-all-story — 一次 LLM 调用流式生成完整故事 (CH1 + CH2 + CH3A + CH3B)
 *
 * 🔧 2026-07-18: 用户要求一次性流式生成全部内容, 包括两个第三章分支
 *
 * 流程:
 * 1. 一次 LLM 调用, 输出格式:
 *    [CH1]第一章标题
 *    第一章内容...
 *    [CH2]第二章标题
 *    第二章内容...
 *    [CHOICE]选择提示语
 *    A: 选项A标签|选项A提示
 *    B: 选项B标签|选项B提示
 *    [CH3A]第三章A标题
 *    选择A的结局内容...
 *    [CH3B]第三章B标题
 *    选择B的结局内容...
 *    [EFFECT]蝴蝶效应总结
 *
 * 2. 流式发送 SSE 事件:
 *    - outline_generated (stub outline)
 *    - chapter_start (CH1) → chapter_text × N → chapter_end (hasChoice=false)
 *    - chapter_start (CH2) → chapter_text × N → chapter_end (hasChoice=true)
 *    - choice_prompt (A/B 选项)
 *    - CH3A 和 CH3B 内容存入 session.context (JSON), 不发给前端
 *    - 发送 story_complete? 不 — 等用户选完 choice 后, story API 再流式 CH3
 *
 * 3. 用户提交 choice 后:
 *    - choice/route.ts 不调 LLM, 直接从 session.context 读取 CH3A 或 CH3B
 *    - story/route.ts 检测 session.currentChapter=2 + choice 已提交 → 从 context 取 CH3 → 流式发送
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ButterflySession, StoryTone, StoryChapter, ChoiceOption } from '@/features/butterfly/types';
import { streamToAgent } from '@/lib/letta';
import { getUserAgentId } from '@/lib/letta-agent-manager';
import { sendSSEData, closeSSE } from '@/lib/sse';
import { logger } from '@/lib/logger';
import { toJson } from '@/lib/json-helpers';
import { isToolCallEvent, extractTextFromLettaSSELine, buildButterflyAgentMessage } from '@/features/butterfly/lib/engine';

export interface StreamAllStoryParams {
  controller: ReadableStreamDefaultController<Uint8Array>;
  supabase: SupabaseClient;
  user: { id: string };
  session: ButterflySession;
  signal?: AbortSignal;
  locale?: string;
}

// 🔧 2026-07-20 (P0 fix): letta/auto 非 reasoning 模式更快, 50s 足够
//    旧代码: 110s（GLM-5.2 reasoning 需要更长，但 maxDuration=60 会先杀函数）
//    修复: 50s（letta/auto 非 reasoning 模式通常 10-30s 响应，maxDuration=60 留 10s buffer）
//    注意: stream-all-story 一次生成 4 章 (CH1+CH2+CH3A+CH3B), 但 letta/auto 并行生成更快
const STREAM_TIMEOUT_MS = 50_000;

interface ParsedChapter {
  title: string;
  content: string;
}
interface ParsedChoice {
  prompt: string;
  options: { id: string; label: string; hint: string }[];
}
interface ParsedStory {
  ch1: ParsedChapter;
  ch2: ParsedChapter;
  choice: ParsedChoice;
  ch3a: ParsedChapter;
  ch3b: ParsedChapter;
  effect: string;
}

/**
 * 构建一次生成全部内容的 prompt
 */
function buildAllStoryPrompt(
  decisionType: string,
  decisionDescription: string,
  amount?: number,
  platform?: string,
  context?: string,
  locale?: string,
): string {
  const isZh = locale === 'zh';

  // 🔧 2026-07-18 fix: 严格按 locale 选择语言, 不能只对中文加强调
  const langInstruction = isZh
    ? '你必须在**简体中文**中写出整个故事。所有文字必须是中文。不要使用英语，除非引用品牌名或产品名。'
    : 'You MUST write the ENTIRE story in **English**. All text must be in English.';

  const langReminder = isZh
    ? '\n\n⚠️ 重要提醒：你必须用简体中文写全部内容，包括第一章、第二章、选择、第三章A、第三章B和蝴蝶效应总结。不要用英语写任何章节。'
    : '\n\n⚠️ CRITICAL REMINDER: You MUST write ALL content in English — Chapter 1, Chapter 2, the choice, Chapter 3A, Chapter 3B, and the butterfly effect summary. Do NOT write any section in Chinese.';

  const decision = decisionType === 'bought'
    ? `They DECIDED TO BUY: "${decisionDescription}"`
    : decisionType === 'resisted'
      ? `They DECIDED NOT TO BUY: "${decisionDescription}"`
      : `They are CONSIDERING BUYING (pre-purchase reflection): "${decisionDescription}"`;

  const systemPrompt = `You are a mischievous visual novelist specializing in butterfly-effect stories about money decisions. You love irony, dark humor, and unexpected reversals.

## CORE PRINCIPLES
1. BE ENTERTAINING: Think Black Mirror meets TikTok — short, punchy, unpredictable.
2. CHAOS REIGNS: Small causes cascade into disproportionate, often ironic consequences.
3. RANDOM OUTCOMES: Do NOT follow any moral pattern. Subvert expectations.
4. COMPACT TIME: The story happens within a few DAYS.
5. Each chapter is 150-250 words MAX (one page). Short, vivid, cinematic.

## LANGUAGE REQUIREMENT (CRITICAL)
${langInstruction}
ALL sections (CH1, CH2, CHOICE, CH3A, CH3B, EFFECT) MUST be in the SAME language. Do NOT mix languages.
⚠️ Chapter TITLES must also be in the target language — do NOT use English "Chapter 1" as a title. Write a real evocative title in the target language.

## OUTPUT FORMAT (CRITICAL — follow EXACTLY)

Write the story as PLAIN TEXT with these EXACT delimiters (each on its own line):

[CH1]${isZh ? '第一章标题（用中文写一个有画面感的标题，不要写"第一章"）' : 'Chapter 1 Title (evocative, not literal "Chapter 1")'}
${isZh ? '第一章内容（150-250 字，第二人称，生动，结尾留悬念）' : 'Chapter 1 content (150-250 words, second person, vivid, end with a hook)'}

[CH2]${isZh ? '第二章标题（中文）' : 'Chapter 2 Title'}
${isZh ? '第二章内容（150-250 字，后果升级，事情变得奇怪）' : 'Chapter 2 content (150-250 words, consequences escalate, things get weird)'}

[CHOICE]${isZh ? '选择提示问题（中文）' : 'Choice prompt question'}
A: ${isZh ? '选项 A 标签 | 选项 A 提示' : 'Option A label | Option A hint'}
B: ${isZh ? '选项 B 标签 | 选项 B 提示' : 'Option B label | Option B hint'}

[CH3A]${isZh ? '第三章标题（如果用户选 A）（中文）' : 'Chapter 3 Title (if user chooses A)'}
${isZh ? '第三章内容（选择 A 的版本，150-250 字，反转结局）' : 'Chapter 3 content for choice A (150-250 words, TWIST ending, tone=twist)'}

[CH3B]${isZh ? '第三章标题（如果用户选 B）（中文）' : 'Chapter 3 Title (if user chooses B)'}
${isZh ? '第三章内容（选择 B 的版本，150-250 字，反转结局，与 A 不同）' : 'Chapter 3 content for choice B (150-250 words, TWIST ending, tone=twist, DIFFERENT from A)'}

[EFFECT]${isZh ? '一句话蝴蝶效应总结（中文）' : 'One sentence butterfly effect summary'}

## RULES
- Start EVERY section with the exact delimiter above (e.g. [CH1]Title)
- Each chapter 150-250 words MAX
- Chapter 3 (both A and B) MUST have tone "twist" — a reversal
- The two Chapter 3 versions must be DIFFERENT stories — not just slightly different endings
- Write in SECOND PERSON (${isZh ? '"你走进店里..."' : '"You walk into the store..."'})
- The choice must feel like a REAL dilemma — both options equally tempting and risky
- Do NOT use === or other delimiter styles. Use [CH1], [CH2], [CHOICE], [CH3A], [CH3B], [EFFECT] exactly.`;

  const userPrompt = `Generate a complete butterfly-effect story with two endings:

${decision}
${amount ? `Amount: $${amount.toFixed(2)}` : ''}
${platform ? `Platform: ${platform}` : ''}
${context ? `Context: ${context}` : ''}
${langReminder}

Use the exact delimiters: [CH1], [CH2], [CHOICE], [CH3A], [CH3B], [EFFECT]. Each chapter 150-250 words. Chapter 3 (both versions) must be twist endings. Start NOW.`;

  return buildButterflyAgentMessage('chapter', systemPrompt, userPrompt);
}

/**
 * 从累积文本中解析完整故事
 */
function parseStory(fullText: string): ParsedStory | null {
  // 🔧 2026-07-18: 先尝试用 [TAG] 格式解析, 失败则尝试用 ===CHAPTER N=== 格式
  const extract = (tag: string): string | null => {
    const re = new RegExp(`\\[${tag}\\]([^\\[]*)`, 's');
    const m = fullText.match(re);
    return m ? m[1].trim() : null;
  };

  // 🔧 2026-07-18: 也尝试匹配 ===CHAPTER N: Title=== 格式 (LLM 不听话时的 fallback)
  const extractByEquals = (chapterNum: string, branch?: string): string | null => {
    const tag = branch ? `CHAPTER ${chapterNum}${branch}` : `CHAPTER ${chapterNum}`;
    const re = new RegExp(`={3,}\\s*${tag}[^=\\n]*={3,}([\\s\\S]*?)(?=={3,}|$)`, 'i');
    const m = fullText.match(re);
    return m ? m[1].trim() : null;
  };

  let ch1Raw = extract('CH1');
  let ch2Raw = extract('CH2');
  const choiceRaw = extract('CHOICE');
  let ch3aRaw = extract('CH3A');
  let ch3bRaw = extract('CH3B');
  const effectRaw = extract('EFFECT');

  // Fallback: 如果 [TAG] 格式没匹配到, 尝试 === 格式
  if (!ch1Raw) ch1Raw = extractByEquals('1');
  if (!ch2Raw) ch2Raw = extractByEquals('2');
  if (!ch3aRaw) ch3aRaw = extractByEquals('3', '\\s*A') || extractByEquals('3A');
  if (!ch3bRaw) ch3bRaw = extractByEquals('3', '\\s*B') || extractByEquals('3B');

  if (!ch1Raw || !ch2Raw || !choiceRaw || !ch3aRaw || !ch3bRaw) {
    logger.warn('[StreamAllStory] Missing sections:', { hasCh1: !!ch1Raw, hasCh2: !!ch2Raw, hasChoice: !!choiceRaw, hasCh3a: !!ch3aRaw, hasCh3b: !!ch3bRaw });
    return null;
  }

  // 解析 chapter: 第一行是 title, 剩下是 content
  // 🔧 2026-07-18: 清理可能残留的 ===CHAPTER N: Title=== 分隔符
  const cleanDelimiter = (text: string): string => {
    return text
      .replace(/={3,}\s*CHAPTER\s+\d+\s*:\s*.+?\s*={3,}/gi, '')
      .replace(/={3,}\s*BUTTERFLY\s+EFFECT\s*={3,}/gi, '')
      .trim();
  };

  const parseChapter = (raw: string): ParsedChapter => {
    const cleaned = cleanDelimiter(raw);
    const lines = cleaned.split('\n').filter(l => l.trim());
    const title = lines[0]?.trim() || 'Chapter';
    const content = lines.slice(1).join('\n').trim();
    return { title: cleanDelimiter(title), content: cleanDelimiter(content) };
  };

  // 解析 choice: 第一行是 prompt, 后续是 A: label|hint 和 B: label|hint
  const parseChoice = (raw: string): ParsedChoice => {
    const lines = raw.split('\n').filter(l => l.trim());
    const prompt = lines[0]?.trim() || 'Which path do you take?';
    const options: { id: string; label: string; hint: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(/^([AB])\s*:\s*([^|]+)\|(.*)/);
      if (m) {
        options.push({ id: m[1], label: m[2].trim(), hint: m[3].trim() });
      }
    }
    if (options.length < 2) {
      options.push({ id: 'A', label: 'The familiar path', hint: 'Safety has its own cost.' });
      options.push({ id: 'B', label: 'The uncharted path', hint: 'The unknown holds both treasure and danger.' });
    }
    return { prompt, options };
  };

  return {
    ch1: parseChapter(ch1Raw),
    ch2: parseChapter(ch2Raw),
    choice: parseChoice(choiceRaw),
    ch3a: parseChapter(ch3aRaw),
    ch3b: parseChapter(ch3bRaw),
    effect: effectRaw || 'The ripples of this decision spread further than anyone could have predicted.',
  };
}

export async function streamAllStory(params: StreamAllStoryParams): Promise<void> {
  const { controller, supabase, user, session, signal, locale } = params;

  let timedOut = false;
  let streamClosed = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const timeout = setTimeout(() => {
    timedOut = true;
    streamClosed = true;
    activeReader?.cancel();
    try {
      sendSSEData(controller, { type: 'error', data: { message: 'Story generation timed out' } });
      controller.close();
    } catch { /* controller already closed */ }
  }, STREAM_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) { timedOut = true; }
    else {
      signal.addEventListener('abort', () => {
        timedOut = true; streamClosed = true;
        activeReader?.cancel();
        try { controller.close(); } catch { /* already closed */ }
      }, { once: true });
    }
  }

  const send = (event: { type: string; data: unknown }) => {
    if (streamClosed || timedOut) return;
    try { sendSSEData(controller, event); } catch { /* controller closed */ }
  };

  try {
    // 1. 发送 outline_generated (stub)
    send({
      type: 'outline_generated',
      data: {
        version: 1,
        chapters: session.outline?.chapters || [],
        endingHint: session.outline?.endingHint || '',
      },
    });

    // 2. 调 LLM 流式生成
    const agentId = await getUserAgentId(user.id);
    if (!agentId) throw new Error('No agent ID available');

    const prompt = buildAllStoryPrompt(
      session.decisionType,
      session.decisionDescription,
      session.amount ?? undefined,
      session.platform ?? undefined,
      session.context ?? undefined,
      locale,
    );

    const lettaStream = await streamToAgent(prompt, undefined, user.id, agentId);
    const reader = lettaStream.getReader();
    activeReader = reader;
    const decoder = new TextDecoder();

    // 🔧 P1-2 fix: 实时流式发送 CH1 和 CH2 (之前累积全部文本后才发送, 用户等 30-90s)
    //   旧设计: 累积 fullText → 解析 → 分段发送 (模拟流式)
    //   问题: LLM 生成全部内容需 30-90s, 期间用户看到加载状态, 无流式文本
    //   新设计: 在累积 fullText 的同时, 检测 [CH1]/[CH2]/[CHOICE] 标记, 实时发送 CH1/CH2 文本
    //   CH3A/CH3B/EFFECT 仍然累积, 等全部完成后解析 (因为需要根据用户选择决定发哪个)
    let fullText = '';
    let sseLineBuffer = '';

    // 流式状态机: 跟踪当前正在生成哪个章节
    // 'before_ch1' → 'ch1' → 'ch2' → 'after_ch2' (CH3A/CH3B/EFFECT 累积)
    let streamPhase: 'before_ch1' | 'ch1' | 'ch2' | 'after_ch2' = 'before_ch1';
    let ch1Sent = false; // 是否已发送 CH1 chapter_start
    let ch2Sent = false; // 是否已发送 CH2 chapter_start
    let ch1Ended = false; // 是否已标记 CH1 结束 (不再发送 chapter_text)
    let ch2Ended = false; // 是否已标记 CH2 结束 (不再发送 chapter_text)
    let ch1EndedSent = false; // 是否已发送 CH1 chapter_end (解析后发送)
    let ch2EndedSent = false; // 是否已发送 CH2 chapter_end (解析后发送)
    // 缓冲 CH1/CH2 文本, 按标记分割后发送 (避免标记本身发给前端)
    let pendingChunk = ''; // 当前章节待发送的文本 (可能包含未完成的标记)

    // 标记常量
    const CH1_MARKER = '[CH1]';
    const CH2_MARKER = '[CH2]';
    const CHOICE_MARKER = '[CHOICE]';

    // 辅助: 发送 CH1 chapter_start (只发一次)
    function ensureCh1Started() {
      if (ch1Sent) return;
      ch1Sent = true;
      // 🔧 P1-2.1 fix (2026-07-21): i18n — 旧代码硬编码英文 "that evening"
      send({
        type: 'chapter_start',
        data: { chapterIndex: 1, title: '', tone: 'neutral' as StoryTone, timeSpan: locale === 'zh' ? '那天傍晚' : 'that evening' },
      });
      logger.info('[StreamAllStory] Streaming CH1 started (real-time)');
    }

    // 辅助: 结束 CH1, 开始 CH2
    function transitionCh1ToCh2() {
      if (!ch2Sent) {
        ch2Sent = true;
        // 注意: CH1 chapter_end 延迟到解析后发送 (带 title + fullText)
        ch1Ended = true; // 标记 CH1 已结束 (不再发送 chapter_text)
        // 🔧 P1-2.1 fix (2026-07-21): i18n — 旧代码硬编码英文 "the next morning"
        send({
          type: 'chapter_start',
          data: { chapterIndex: 2, title: '', tone: 'neutral' as StoryTone, timeSpan: locale === 'zh' ? '第二天早上' : 'the next morning' },
        });
        logger.info('[StreamAllStory] Streaming CH2 started (real-time)');
      }
    }

    // 辅助: 结束 CH2
    function endCh2() {
      // 注意: CH2 chapter_end 延迟到解析后发送 (带 title + fullText)
      ch2Ended = true; // 标记 CH2 已结束 (不再发送 chapter_text)
      logger.info('[StreamAllStory] Streaming CH2 ended (real-time, chapter_end deferred)');
    }

    // 辅助: 发送 chapter_text (按 50 字符分块, 模拟流式节奏)
    function sendChapterText(chapterIndex: number, text: string) {
      if (!text) return;
      const chunks = splitIntoChunks(text, 50);
      for (const chunk of chunks) {
        send({ type: 'chapter_text', data: { chapterIndex, text: chunk } });
      }
    }

    while (true) {
      if (timedOut) break;
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      sseLineBuffer += chunk;

      const lines = sseLineBuffer.split('\n');
      sseLineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (isToolCallEvent(line)) continue;
        const text = extractTextFromLettaSSELine(line);
        if (!text) continue;

        fullText += text;

        // 🔧 P1-2: 实时流式发送 CH1/CH2
        // 将 text 加入 pendingChunk, 然后检测标记
        pendingChunk += text;

        if (streamPhase === 'before_ch1') {
          // 检测 [CH1] 标记
          const idx = pendingChunk.indexOf(CH1_MARKER);
          if (idx >= 0) {
            streamPhase = 'ch1';
            ensureCh1Started();
            // 标记之后的内容是 CH1 文本 (可能还有未完成的标记)
            pendingChunk = pendingChunk.substring(idx + CH1_MARKER.length);
            // 发送已有的 CH1 文本
            const toSend = pendingChunk;
            pendingChunk = '';
            if (toSend) sendChapterText(1, toSend);
          }
          // 如果没检测到 [CH1], 保留 pendingChunk (可能标记还没完整到达)
          // 但 pendingChunk 可能很长 (LLM 可能先输出一些前导文本), 限制缓冲区大小
          if (pendingChunk.length > 200 && streamPhase === 'before_ch1') {
            // 前导文本太长, 可能没有 [CH1] 标记 (LLM 没按格式输出), 直接当 CH1 发送
            streamPhase = 'ch1';
            ensureCh1Started();
            sendChapterText(1, pendingChunk);
            pendingChunk = '';
          }
        } else if (streamPhase === 'ch1') {
          // 检测 [CH2] 标记
          const idx = pendingChunk.indexOf(CH2_MARKER);
          if (idx >= 0) {
            // 发送 [CH2] 之前的 CH1 文本
            const ch1Text = pendingChunk.substring(0, idx);
            if (ch1Text) sendChapterText(1, ch1Text);
            // 转换到 CH2
            transitionCh1ToCh2();
            streamPhase = 'ch2';
            pendingChunk = pendingChunk.substring(idx + CH2_MARKER.length);
            // 发送已有的 CH2 文本
            const toSend = pendingChunk;
            pendingChunk = '';
            if (toSend) sendChapterText(2, toSend);
          } else {
            // 没检测到 [CH2], 发送 CH1 文本 (保留最后 10 字符防止标记被拆分)
            if (pendingChunk.length > 10) {
              const toSend = pendingChunk.substring(0, pendingChunk.length - 10);
              pendingChunk = pendingChunk.substring(pendingChunk.length - 10);
              if (toSend) sendChapterText(1, toSend);
            }
          }
        } else if (streamPhase === 'ch2') {
          // 检测 [CHOICE] 标记
          const idx = pendingChunk.indexOf(CHOICE_MARKER);
          if (idx >= 0) {
            // 发送 [CHOICE] 之前的 CH2 文本
            const ch2Text = pendingChunk.substring(0, idx);
            if (ch2Text) sendChapterText(2, ch2Text);
            // 结束 CH2
            endCh2();
            streamPhase = 'after_ch2';
            pendingChunk = ''; // CHOICE 之后的内容累积到 fullText, 等解析
          } else {
            // 没检测到 [CHOICE], 发送 CH2 文本 (保留最后 10 字符)
            if (pendingChunk.length > 10) {
              const toSend = pendingChunk.substring(0, pendingChunk.length - 10);
              pendingChunk = pendingChunk.substring(pendingChunk.length - 10);
              if (toSend) sendChapterText(2, toSend);
            }
          }
        }
        // after_ch2 阶段: 不发送, 累积到 fullText
      }
    }
    // 处理剩余 buffer
    if (sseLineBuffer.trim()) {
      if (!isToolCallEvent(sseLineBuffer)) {
        const text = extractTextFromLettaSSELine(sseLineBuffer);
        if (text) fullText += text;
      }
    }

    // 流结束后, 发送剩余的 pendingChunk
    if (streamPhase === 'ch1' && pendingChunk) {
      sendChapterText(1, pendingChunk);
      pendingChunk = '';
      if (!ch1Ended) {
        transitionCh1ToCh2();
        endCh2();
      }
    } else if (streamPhase === 'ch2' && pendingChunk) {
      sendChapterText(2, pendingChunk);
      pendingChunk = '';
      if (!ch2Ended) {
        endCh2();
      }
    }

    logger.info('[StreamAllStory] LLM stream done, fullText length:', fullText.length);

    // 4. 解析故事
    const story = parseStory(fullText);
    if (!story) {
      // 解析失败 — 用 fallback
      logger.error('[StreamAllStory] Failed to parse story, using fallback');
      send({ type: 'error', data: { message: 'Story generation failed — could not parse AI response. Please try again.' } });
      clearTimeout(timeout);
      streamClosed = true;
      closeSSE(controller);
      return;
    }

    // 🔧 P1-2 fallback: 如果流式期间没有成功发送 CH1 (LLM 没按格式输出标记),
    //   用解析后的数据重新发送 CH1/CH2 (退回旧逻辑)
    if (!ch1Sent) {
      logger.warn('[StreamAllStory] CH1 not streamed in real-time (no markers detected), falling back to post-parse send');
      // CH1
      ensureCh1Started();
      const ch1Chunks = splitIntoChunks(story.ch1.content, 50);
      for (const chunk of ch1Chunks) {
        send({ type: 'chapter_text', data: { chapterIndex: 1, text: chunk } });
      }
      send({
        type: 'chapter_end',
        data: { chapterIndex: 1, hasChoice: false, fullText: story.ch1.content, title: story.ch1.title },
      });
      ch1EndedSent = true;
      // CH2
      transitionCh1ToCh2();
      const ch2Chunks = splitIntoChunks(story.ch2.content, 50);
      for (const chunk of ch2Chunks) {
        send({ type: 'chapter_text', data: { chapterIndex: 2, text: chunk } });
      }
      send({
        type: 'chapter_end',
        data: { chapterIndex: 2, hasChoice: true, fullText: story.ch2.content, title: story.ch2.title },
      });
      ch2EndedSent = true;
    }

    // 5. 将 CH3A, CH3B, effect 存入 session.context (JSON)
    const branchData = {
      ch3a: story.ch3a,
      ch3b: story.ch3b,
      effect: story.effect,
    };
    await supabase
      .from('butterfly_sessions')
      .update({ context: JSON.stringify(branchData) })
      .eq('id', session.id)
      .eq('user_id', user.id);

    logger.info('[StreamAllStory] Branch data saved to session.context');

    // 6. 🔧 P1-2 fix: CH1/CH2 已在流式期间实时发送 chapter_text, 这里发送 chapter_end (带 title + fullText)
    //   并保存到 DB
    const now = new Date().toISOString();

    // 发送 CH1 chapter_end (带 title + fullText, 补充流式期间缺失的元数据)
    if (ch1Sent && !ch1EndedSent) {
      send({
        type: 'chapter_end',
        data: { chapterIndex: 1, hasChoice: false, fullText: story.ch1.content, title: story.ch1.title },
      });
      ch1EndedSent = true;
    }

    // 保存 CH1 到 DB
    const ch1: StoryChapter = {
      index: 1, title: story.ch1.title, content: story.ch1.content,
      tone: 'neutral' as StoryTone, timeSpan: locale === 'zh' ? '那天傍晚' : 'that evening', hasChoice: false, createdAt: now,
    };
    // 🔧 2026-07-21 audit fix (agent-4 #1): 旧代码完全忽略 append_chapter RPC 返回值 →
    //    章节已通过 SSE 发给前端 (line 547 chapter_end) 但未持久化, 用户刷新后丢章
    //    且无任何错误提示。现在检查错误, 失败则通知前端 + 关流 (与 stream-chapter 同模式)。
    // 🔧 P0 fix (2026-08-14): append_chapter RPC requires admin service (migration 075 REVOKE authenticated).
    //   Using admin client to avoid 42501 permission error that prevents chapter persistence.
    const adminResult = await import('@/lib/supabase-admin').then(m => m.createAdminClient());
    const adminSupabase = adminResult.supabase;
    if (!adminSupabase) throw new Error('Admin client unavailable');
    const { data: ch1Result, error: ch1Err } = await adminSupabase.rpc('append_chapter', {
      p_session_id: session.id,
      p_chapter: toJson(ch1),
      p_current_chapter: 1,
      p_choices: null,
    });
    if (ch1Err || !ch1Result || (ch1Result as { success?: boolean }).success === false) {
      // 🔧 2026-07-21 adversarial-review C2: 记录持久化失败但不中断流。
      //   append_chapter RPC 仅 admin service 可执行 (migration 075 REVOKE authenticated),
      //   而 story/route.ts 用 authenticated client → RPC 会 42501。若中断流 (send error+close+return),
      //   用户只看到 CH1 + error, 比原来的静默吞 (至少 CH1+CH2+choice 都发) 更糟。
      //   改为记录 + 继续: CH2/choice 仍通过 SSE 发送, 持久化失败可见于日志供 ops 排查。
      //   ⚠️ 根因 (append_chapter 权限) 见 download/audit-2026-07-21-followups.md 第 0 项（本地文档）, 需确认 prod GRANT 状态后修。
      logger.error('[Butterfly all-story] append_chapter CH1 FAILED — chapter sent to client but NOT persisted (will be lost on refresh):', ch1Err?.message);
    }

    // 发送 CH2 chapter_end (带 title + fullText)
    if (ch2Sent && !ch2EndedSent) {
      send({
        type: 'chapter_end',
        data: { chapterIndex: 2, hasChoice: true, fullText: story.ch2.content, title: story.ch2.title },
      });
      ch2EndedSent = true;
    }

    // 保存 CH2 + choice 到 DB
    const ch2: StoryChapter = {
      index: 2, title: story.ch2.title, content: story.ch2.content,
      tone: 'neutral' as StoryTone, timeSpan: locale === 'zh' ? '第二天早上' : 'the next morning', hasChoice: true, createdAt: now,
    };
    const choiceObj = {
      id: `choice-2-${Date.now()}`,
      chapterIndex: 2,
      prompt: story.choice.prompt,
      options: story.choice.options as ChoiceOption[],
      selectedOption: null,
      createdAt: now,
      outlineRegenerated: false,
    };
    // 🔧 2026-07-21 audit fix (agent-4 #1): 同上 — 检查 CH2 RPC 错误, 防止丢章。
    const { data: ch2Result, error: ch2Err } = await adminSupabase.rpc('append_chapter', {
      p_session_id: session.id,
      p_chapter: toJson(ch2),
      p_current_chapter: 2,
      p_choices: toJson([choiceObj]),
    });
    if (ch2Err || !ch2Result || (ch2Result as { success?: boolean }).success === false) {
      // 🔧 2026-07-21 adversarial-review C2: 同 CH1 — 记录但不中断流 (见上方注释)。
      logger.error('[Butterfly all-story] append_chapter CH2 FAILED — chapter sent to client but NOT persisted (will be lost on refresh):', ch2Err?.message);
    }

    // 发送 choice_prompt
    send({
      type: 'choice_prompt',
      data: {
        chapterIndex: 2,
        prompt: story.choice.prompt,
        options: story.choice.options as ChoiceOption[],
      },
    });

    // 不发送 story_complete — 等用户选完 choice 后, story API 从 context 取 CH3 再流式发送
    logger.info('[StreamAllStory] CH1+CH2 sent, choice_prompt sent, waiting for user choice');

  } catch (err) {
    clearTimeout(timeout);
    logger.error('[StreamAllStory] Error:', err);
    try {
      if (!streamClosed) {
        send({ type: 'error', data: { message: err instanceof Error ? err.message : 'Unknown error' } });
      }
    } catch { /* controller already closed */ }
    streamClosed = true;
    closeSSE(controller);
    return;
  }

  clearTimeout(timeout);
  streamClosed = true;
  closeSSE(controller);
}

/**
 * 将文本分割成指定大小的块 (用于模拟流式发送)
 */
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [''];
}

/**
 * 从 session.context 读取预加载的 CH3 分支
 */
export function getPreloadedChapter3(
  session: ButterflySession,
  selectedOption: string,
): { title: string; content: string; effect: string } | null {
  try {
    if (!session.context) return null;
    const data = JSON.parse(session.context) as { ch3a?: ParsedChapter; ch3b?: ParsedChapter; effect?: string };
    const branch = selectedOption === 'A' ? data.ch3a : selectedOption === 'B' ? data.ch3b : null;
    if (!branch) return null;
    return { title: branch.title, content: branch.content, effect: data.effect || '' };
  } catch {
    // safe to ignore: context JSON 解析失败返回 null, story API fallback 到 streamStoryChapter
    return null;
  }
}
