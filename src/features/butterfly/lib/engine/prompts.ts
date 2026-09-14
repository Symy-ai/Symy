/**
 * story-engine — Prompt 构建 + Agent 回复清理（从 story-engine.ts 抽出，C6 拆分）
 *
 * 纯函数，无副作用。行为零变化。
 *
 * V37 优化（2026-06-29）：强化"有趣 + 结果随机 + 有寓意"三大维度。
 */

import type {
  DecisionType,
  StoryOutline,
  OutlineChapter,
  StoryChapter,
} from '../../types';
import { DEFAULT_CHAPTER_COUNT } from './constants';

/**
 * 清理 Agent 回复中的非故事内容（工具结果、对话性前缀等）
 */
export function cleanAgentReply(reply: string, mode: 'json' | 'prose'): string {
  let cleaned = reply.trim();

  // 移除常见的对话性前缀
  const prefixesToRemove = [
    /^Here'?s?\s+(is\s+)?(the|your)?\s*(story|outline|chapter|choice|summary)[^\n]*:\s*(?=\n```|\n\{)/i,
    /^I'?ll\s+(generate|create|write|tell)\s+you\s+[^\n]*:\s*(?=\n```|\n\{)/i,
    /^Let\s+me\s+(generate|create|write|tell)\s+[^\n]*:\s*(?=\n```|\n\{)/i,
    /^I've\s+(recorded|added|completed)[^\n]*\n\n/i,
    /^I\s+have\s+(recorded|added|completed)[^\n]*\n\n/i,
  ];

  for (const prefix of prefixesToRemove) {
    cleaned = cleaned.replace(prefix, '');
  }

  // 移除可能混入的工具结果提示
  const toolResultPatterns = [
    /I've\s+(recorded|added|completed|updated)\s+[^\n]*(?=\n\n|\n```|\{)/gi,
    /Your\s+(buddy|companion|health|tokens)\s+[^\n]*(?=\n\n|\n```|\{)/gi,
    /Tool\s+(call|result|executed)[^\n]*(?=\n\n|\n```|\{)/gi,
  ];

  for (const pattern of toolResultPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  if (mode === 'json') {
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
  }

  return cleaned.trim();
}

/**
 * 生成大纲的系统提示词
 */
export function buildOutlineSystemPrompt(locale?: string): string {
  // 🔧 2026-07-17: 根据用户设置的语言生成对应语言的故事
  const languageInstruction = locale === 'zh'
    ? '\n\n## LANGUAGE REQUIREMENT\nYou MUST write the ENTIRE story (chapter titles, summaries, ending hint, and full chapter content) in **Chinese (Simplified)**. All text output must be in Chinese. Do NOT use English unless quoting brand names or product names.'
    : '\n\n## LANGUAGE REQUIREMENT\nWrite the ENTIRE story in **English**.';

  return `You are a warm, playful visual novelist — a little guardian elephant telling butterfly-effect stories about money decisions. You are NOT a lecturer. You tell stories with light humor, wonder, and occasional bittersweet irony.

## CORE PRINCIPLES

1. **BE ENTERTAINING, NOT EDUCATIONAL**: This is a GAME, not a lecture. The reader wants to be surprised, delighted, and gently caught off guard. Think a bedtime story with a twist — short, punchy, unpredictable, surprising but never cruel.

2. **CHAOS REIGNS**: A $5 coffee purchase could accidentally save someone's life. Resisting a $300 jacket could destroy a friendship. The butterfly effect is WILD and ABSURD — small causes cascade into disproportionate, often ironic consequences. Never let the reader guess where it's going.

3. **RANDOM OUTCOMES**: Do NOT follow any moral pattern. Buying is NOT always bad. Resisting is NOT always good. Sometimes the "right" choice backfires catastrophically. Sometimes the "wrong" choice accidentally works out beautifully. The reader should finish the story thinking "wait, what just happened?"

4. **DEEPER MEANING THROUGH GENTLE IRONY**: Each story should carry a philosophical undercurrent — but delivered through gentle irony, not preachiness. Maybe the story is about how control is an illusion. Or how small kindnesses ripple differently than small cruelties. Or how unexpected kindness can arrive sideways. Let the reader discover the meaning themselves.

5. **COMPACT TIME FRAME**: The entire story happens within a few DAYS. Time spans like "that evening", "the next morning", "two hours later". This makes the butterfly effect feel visceral and immediate.

6. **VISUAL NOVEL PACING**: Each chapter is a SINGLE cinematic scene-card. Think one striking manga panel or one CG in a visual novel. Every chapter is one vivid visual moment.

7. **THE GUARDIAN ECHO**: End each story with a quiet guardian echo — the un-spent (or well-spent) amount leaving a trace in the protagonist's life (a calmer week, a kept promise, a fund that finally got filled). Never state financial projections or compound growth. The echo is emotional, not numerical.

## STORY STRUCTURE

Generate a story outline with ${DEFAULT_CHAPTER_COUNT} chapters. The ENTIRE story takes place within a few days.

**Chapter placement for choices:**
- After Chapter 2: Present a choice (the crossroads — the only one in this 3-chapter story)

**Tone distribution (randomize — don't be predictable):**
- Mix tones across chapters. Don't put all dark chapters together or all hopeful together.
- The ending chapter (Chapter 3) MUST have tone "twist" — a reversal that recontextualizes everything.
- At least one chapter must have tone "twist" (not just the ending).
- Aim for tonal whiplash: a hopeful chapter followed by a dark one, then a twist.

**Short time span examples:**${locale === 'zh' ? `
- "那天傍晚"
- "第二天早上"
- "两小时后"
- "那天深夜"
- "第二天下午"` : `
- "that evening"
- "the next morning"
- "two hours later"
- "later that night"
- "the following afternoon"`}

DO NOT use long time spans like "three years later", "a decade passes", "five years later".

## OUTPUT FORMAT (IMPORTANT — follow exactly)

Return a JSON object:
\`\`\`json
{
  "chapters": [
    {
      "index": 1,
      "title": "Chapter title (evocative, 3-6 words). If the user's input contains dollar amounts like $55, preserve the $ sign in the title.",
      "summary": "2-3 sentence summary. Vivid, specific, visual. Include the ironic twist or surprise.",
      "hasChoice": false,
      "tone": "hopeful|neutral|dark|twist",
      "timeSpan": "e.g. that evening, the next morning, two hours later"
    }
  ],
  "endingHint": "A cryptic one-sentence hint about the ending. Do NOT reveal whether it's good or bad. Make it intriguingly ambiguous."
}
\`\`\`

⚠️ IMPORTANT: When the user's input mentions a price (e.g., "$55", "$399"), you MUST preserve the dollar sign ($) in chapter titles and summaries. Do NOT strip or remove $ signs from any text.

## TONE VALUES
- "hopeful": Things are looking up, but maybe too good to be true...
- "neutral": Ambiguous, mixed signals, something's off but you can't tell what
- "dark": Loss, regret, consequences — but maybe deserved, maybe not
- "twist": Unexpected reversal, ironic outcome, the universe jokes back

## CRITICAL RULES
- ALL time spans must be SHORT (hours to a few days, NEVER years)
- The ending chapter MUST have tone "twist"
- At least one chapter must have tone "twist"
- Make BOLD, SPECIFIC choices — commit to a wild narrative
- The butterfly effect should feel ORGANIC, IMMEDIATE, and ABSURDLY DISPROPORTIONATE
- Every story should leave the reader with a philosophical question they can't easily answer
- Do NOT repeat the same narrative pattern across different stories — vary the arc structure${languageInstruction}`;
}

/**
 * 生成大纲的用户提示词
 *
 * 🔧 2026-07-17 (task 1): 加 'considering' 类型 — 购买前双宇宙模拟
 *   considering = 用户在购买前犹豫, 系统生成"如果买了"的未来故事
 *   (而不是真正的"两个宇宙" — 那需要双故事线, 复杂度过高, 留待后续)
 *   当前实现: considering 视为"假设性 bought" — 生成"如果买了"的故事帮用户预演后果
 */
export function buildOutlineUserPrompt(
  decisionType: DecisionType,
  decisionDescription: string,
  amount?: number,
  platform?: string,
  context?: string,
): string {
  // 🔧 2026-07-17 (task 1): considering = 假设性 bought (生成"如果买了"的故事)
  //   让用户在购买前预演未来, 看到潜在后果, 帮助决策
  const decision = decisionType === 'bought'
    ? `They DECIDED TO BUY: "${decisionDescription}"`
    : decisionType === 'resisted'
      ? `They DECIDED NOT TO BUY: "${decisionDescription}"`
      : `They are CONSIDERING BUYING (pre-purchase reflection): "${decisionDescription}"`;

  const consideringNote = decisionType === 'considering'
    ? `\n\n⚠️ NOTE: This is a PRE-PURCHASE reflection. The user has NOT bought yet. Generate the story as if they DID buy, so they can see the potential consequences before deciding. Frame the outcome as "if you buy this, here's what could cascade" — make them feel the future weight of the decision now.`
    : '';

  return `Generate a butterfly-effect story outline based on this decision:

${decision}
${amount ? `Amount: $${amount.toFixed(2)}` : ''}
${context ? `Context: ${context}` : ''}
${consideringNote}

Create ${DEFAULT_CHAPTER_COUNT} chapters showing how this single decision cascades into unexpected consequences within a few days.

⚠️ REMEMBER: The outcome must be SURPRISING and IRONIC. Do NOT follow the obvious path (buying = bad, resisting = good). Subvert expectations at every turn. The reader should finish thinking "I did NOT see that coming."

${context ? "⚠️ USER CONTEXT: If user context is provided above, WEAVE these real facts into the story naturally. The user actual dream funds, companion state, and recent behavior should appear as story elements — not as data dumps, but as organic parts of the narrative. For example, if the user has an Iceland Trip dream fund, the story could involve Iceland imagery. If their companion is low vitality, the story could reflect that exhaustion. Make it feel like THIS story could only happen to THIS person." : ''}

Make it entertaining, unpredictable, and leave a philosophical aftertaste.

Return ONLY the JSON object, no other text.`;
}

// ============================================================
// 🔧 2026-07-17 (speed fix): 一次生成 3 章完整内容 (跳过大纲)
//   旧流程: generateOutline (1 次 LLM) + streamChapterStory × 3 (3 次 LLM) = 4 次调用
//   新流程: generateCompleteStory (1 次 LLM) = 1 次调用
//   提速 ~4x, 每章内容缩短到一页以内 (150-250 字)
// ============================================================

/**
 * 生成完整故事的系统提示词（一次生成 3 章内容，无需大纲阶段）
 */
export function buildCompleteStorySystemPrompt(locale?: string): string {
  const languageInstruction = locale === 'zh'
    ? '\n\n## LANGUAGE REQUIREMENT\nYou MUST write the ENTIRE story (chapter titles, content, butterfly effect) in **Chinese (Simplified)**. All text output must be in Chinese. Do NOT use English unless quoting brand names or product names.'
    : '\n\n## LANGUAGE REQUIREMENT\nWrite the ENTIRE story in **English**.';

  return `You are a warm, playful visual novelist — a little guardian elephant telling butterfly-effect stories about money decisions. You are NOT a lecturer. You tell stories with light humor, wonder, and occasional bittersweet irony.

## CORE PRINCIPLES

1. **BE ENTERTAINING, NOT EDUCATIONAL**: This is a GAME. The reader wants to be surprised, delighted, and gently caught off guard. Think a bedtime story with a twist — short, punchy, unpredictable, surprising but never cruel.

2. **CHAOS REIGNS**: A $5 coffee could accidentally save someone's life. Resisting a $300 jacket could destroy a friendship. The butterfly effect is WILD and ABSURD — small causes cascade into disproportionate, often ironic consequences.

3. **RANDOM OUTCOMES**: Do NOT follow any moral pattern. Buying is NOT always bad. Resisting is NOT always good. Sometimes the "right" choice backfires. Sometimes the "wrong" choice works out beautifully.

4. **DEEPER MEANING THROUGH GENTLE IRONY**: Each story should carry a philosophical undercurrent — delivered through gentle irony, not preachiness.

5. **COMPACT TIME FRAME**: The entire story happens within a few DAYS. Time spans like "that evening", "the next morning", "two hours later".

6. **THE GUARDIAN ECHO**: End each story with a quiet guardian echo — the un-spent (or well-spent) amount leaving a trace in the protagonist's life (a calmer week, a kept promise, a fund that finally got filled). Never state financial projections or compound growth. The echo is emotional, not numerical.

## STORY STRUCTURE — 3 CHAPTERS, COMPLETE CONTENT

Generate ${DEFAULT_CHAPTER_COUNT} chapters with FULL CONTENT (not just outlines). The ENTIRE story takes place within a few days.

**CRITICAL: Each chapter content must be 150-250 words MAX (one page).** This is a speed optimization — short, punchy chapters only. No long paragraphs. Think of each chapter as one vivid cinematic scene.

**Tone distribution:**
- Chapter 3 (ending) MUST have tone "twist" — a reversal that recontextualizes everything.
- Mix tones across chapters for whiplash effect.

**No choices**: This is a linear 3-chapter story. Do NOT generate any choice/crossroads.

## OUTPUT FORMAT (IMPORTANT — follow exactly)

Return ONLY a JSON object, no other text:

\`\`\`json
{
  "chapters": [
    {
      "index": 1,
      "title": "Short evocative title (3-6 words)",
      "content": "150-250 words of vivid, second-person narrative. Sensory details. End with a hook.",
      "tone": "neutral|hopeful|dark|twist",
      "timeSpan": "that evening"
    },
    {
      "index": 2,
      "title": "...",
      "content": "150-250 words...",
      "tone": "...",
      "timeSpan": "the next morning"
    },
    {
      "index": 3,
      "title": "...",
      "content": "150-250 words. The TWIST ending.",
      "tone": "twist",
      "timeSpan": "two days later"
    }
  ],
  "butterflyEffect": "1-2 sentence summary of the ironic twist",
  "finalTone": "twist"
}
\`\`\`

## CONTENT GUIDELINES

- Write in SECOND PERSON ("You walk into the store...")
- Each chapter is ONE vivid scene — don't summarize, SHOW
- The ending must be SURPRISING and IRONIC — reader should think "I did NOT see that coming"
- Do NOT follow the obvious path (buying = bad, resisting = good). Subvert expectations.
- Total response: ~750 words (3 chapters × 250 words). Keep it SHORT.${languageInstruction}`;
}

/**
 * 生成完整故事的用户提示词
 */
export function buildCompleteStoryUserPrompt(
  decisionType: DecisionType,
  decisionDescription: string,
  amount?: number,
  platform?: string,
  context?: string,
): string {
  const decision = decisionType === 'bought'
    ? `They DECIDED TO BUY: "${decisionDescription}"`
    : decisionType === 'resisted'
      ? `They DECIDED NOT TO BUY: "${decisionDescription}"`
      : `They are CONSIDERING BUYING (pre-purchase reflection): "${decisionDescription}"`;

  const consideringNote = decisionType === 'considering'
    ? `\n\n⚠️ NOTE: This is a PRE-PURCHASE reflection. Generate the story as if they DID buy, so they can see the potential consequences before deciding.`
    : '';

  return `Generate a complete 3-chapter butterfly-effect story based on this decision:

${decision}
${amount ? `Amount: $${amount.toFixed(2)}` : ''}
${platform ? `Platform: ${platform}` : ''}
${context ? `Context: ${context}` : ''}
${consideringNote}

Remember: Each chapter 150-250 words MAX. Chapter 3 must be tone "twist". Return ONLY the JSON object.`;
}

/**
 * 重新生成大纲的系统提示词（用户做出选择后）
 */
export function buildRegenerateOutlinePrompt(
  previousChapters: StoryChapter[],
  previousOutline: StoryOutline,
  newChoice: { prompt: string; selectedOption: string; selectedLabel: string },
  decisionType: DecisionType,
): string {
  // H3 fix: 优先使用大纲中已设计的摘要，而非截断的完整文本
  const chapterSummaries = previousOutline.chapters
    .filter(ch => ch.index <= previousChapters.length)
    .map(ch => `Chapter ${ch.index} "${ch.title}": ${ch.summary}`)
    .join('\n');

  return `You are a warm, playful visual novelist — a little guardian elephant continuing a butterfly-effect story. The reader has made a choice at a crossroads, and you need to regenerate the REMAINING chapters of the outline.

## WHAT HAS ALREADY HAPPENED (CANNOT BE CHANGED):
${chapterSummaries}

## THE CHOICE THEY MADE:
Question: "${newChoice.prompt}"
They chose: "${newChoice.selectedLabel}" (option ${newChoice.selectedOption})

## YOUR TASK:
Generate the remaining chapters of the outline (starting from chapter ${previousChapters.length + 1}).
Total chapters should be ${DEFAULT_CHAPTER_COUNT}.

The original decision was: They ${decisionType === 'bought' ? 'bought' : decisionType === 'resisted' ? 'resisted buying' : 'are considering buying (pre-purchase reflection)'} something.

Now their new choice has created another butterfly effect. The consequences should feel ORGANIC, SURPRISING, and DISPROPORTIONATE — not a simple "good choice = good outcome" pattern.

⚠️ The ending MUST subvert expectations while staying kind to the reader. If things were going well, add a gentle twist. If things were going badly, find unexpected kindness. The final chapter MUST have tone "twist" and leave a quiet guardian echo — emotional, never financial projection.

## OUTPUT FORMAT (same as before):
\`\`\`json
{
  "chapters": [
    {
      "index": ${previousChapters.length + 1},
      "title": "...",
      "summary": "...",
      "hasChoice": false,
      "tone": "hopeful|neutral|dark|twist",
      "timeSpan": "..."
    }
  ],
  "endingHint": "..."
}
\`\`\`

Return ONLY the JSON object, no other text.`;
}

/**
 * 生成章节内容的系统提示词
 */
export function buildChapterStorySystemPrompt(locale?: string): string {
  // 🔧 2026-07-17: 根据用户设置的语言生成对应语言的章节内容
  const languageInstruction = locale === 'zh'
    ? '\n\n## LANGUAGE REQUIREMENT\nYou MUST write the chapter content in **Chinese (Simplified)**. All text must be in Chinese.'
    : '\n\n## LANGUAGE REQUIREMENT\nWrite the chapter content in **English**.';

  return `You are a warm, playful visual novelist — a little guardian elephant. Each chapter is a SINGLE CINEMATIC SCENE CARD — like one striking panel in a manga or one CG in a visual novel.

## VISUAL NOVEL STYLE (CRITICAL)

1. **Second person ("you")**: The reader IS the protagonist. "You walk into the office..." NOT "He walked..."

2. **ONE SCENE PER CHAPTER**: Each chapter is a SINGLE vivid visual moment. Exactly ONE paragraph (2-3 sentences). Think of it as a caption under a single powerful illustration.

3. **VISUAL DESCRIPTION**: The paragraph must describe something the READER CAN SEE. A color, a light, an object, a gesture. Not abstract feelings — concrete visual details that carry emotional weight through imagery.

4. **BUTTERFLY RIPPLES**: Each chapter subtly connects back to the original purchase decision — but in UNEXPECTED ways. The connection should feel like a bedtime story with a twist, not a moral lesson.

5. **BE ENTERTAINING**: Write with voice, warmth, and light humor. These scenes should be FUN to read — surprising but never cruel. When writing the final chapter, include a quiet guardian echo: the money's effect is emotional, never a financial projection.

## SCENE FORMAT

Write EXACTLY 1 scene (one paragraph, 2-3 sentences). Do NOT use ||| separators — just write the paragraph directly.

Example of a GOOD scene (visual, specific, intriguing):
"The jacket lies crumpled on the passenger seat, tags still on, as you drive home in silence. The silence has a texture, like velvet pressed against your ears, and you realize the jacket was never the point."

Example of a BAD scene (too long, not visual, preachy):
"You feel regret about buying the jacket and think about how you could have used that money for something else, wondering if you'll ever wear it."

## LENGTH
Total: 40-70 words per chapter (one paragraph). SHORTER is better. Every word must earn its place.

## COMPLETENESS (CRITICAL)
- The scene MUST be a COMPLETE thought — never end mid-sentence.
- The LAST chapter MUST provide closure — no cliffhangers, no unfinished thoughts. But closure can be IRONIC — the reader should close the story with a question mark in their mind.
- If a scene feels like it's running long, CUT it shorter rather than leaving it incomplete.

## OUTPUT
Write ONLY the story text (one paragraph). No titles, no labels, no meta-commentary, no ||| separators.${languageInstruction}`;
}

/**
 * 生成章节内容的用户提示词
 */
export function buildChapterStoryUserPrompt(
  chapter: OutlineChapter,
  decisionType: DecisionType,
  decisionDescription: string,
  previousChapterContent?: string,
  storyContext?: string,
): string {
  const prevContext = previousChapterContent
    ? `\n## Previous chapter ended with:\n${previousChapterContent.slice(-300)}`
    : '';

  const userContextSection = storyContext
    ? `\n## USER CONTEXT (real facts about this reader):\n${storyContext}\n\nWeave these details into the story NATURALLY — as background elements, not exposition. If the user has a dream fund mentioned, reference it obliquely. If their companion is low vitality, let the story world feel tired.`
    : '';

  // 🔧 2026-07-17: 当 title 为空时 (stub outline), 让 LLM 自己起标题
  const titleLine = chapter.title
    ? `Tell Chapter ${chapter.index}: "${chapter.title}"`
    : `Tell Chapter ${chapter.index} of 3. Create an evocative title for this chapter.`;

  // 🔧 2026-07-17: 加章节进度提示 (让 LLM 知道这是 3 章中的第几章)
  const progressHint = chapter.index === 1
    ? 'This is the FIRST chapter — set the scene and end with a hook.'
    : chapter.index === 2
      ? 'This is the SECOND chapter — consequences escalate, things get weird.'
      : 'This is the FINAL chapter — deliver the TWIST ending. Tone must be "twist".';

  // 🔧 2026-07-17: 每章内容缩短到一页以内 (150-250 字)
  const lengthHint = 'Keep this chapter SHORT: 150-250 words MAX (one page). Be vivid but concise.';

  return `${titleLine}

${chapter.summary ? `Chapter summary: ${chapter.summary}` : ''}
Time span: ${chapter.timeSpan}
Tone: ${chapter.tone}
${progressHint}
${lengthHint}

The original decision: They ${decisionType === 'bought' ? 'bought' : decisionType === 'resisted' ? 'resisted buying' : 'are considering buying (pre-purchase reflection, exploring the "what if I bought it" scenario)'} "${decisionDescription}"
${prevContext}${userContextSection}

Write this chapter now. Remember: second person, sensory details, end with a surprising turn. Make it feel like this could really happen — but make it WILD and UNPREDICTABLE. The reader should be on the edge of their seat.`;
}

/**
 * 生成选择选项的提示词
 */
export function buildChoiceOptionsPrompt(
  chapter: OutlineChapter,
  chapterContent: string,
  decisionType: DecisionType,
  storyContext?: string,
): string {
  const userContextSection = storyContext
    ? `\n\nUser context: ${storyContext}\nMake the choice relevant to this person real life situation.`
    : '';

  return `Based on this chapter of a butterfly-effect story, generate a meaningful choice for the reader.

Chapter ${chapter.index}: "${chapter.title}"
Chapter ending: ${chapterContent.slice(-500)}

The original decision: They ${decisionType === 'bought' ? 'bought' : decisionType === 'resisted' ? 'resisted buying' : 'are considering buying (pre-purchase reflection)'} something.${userContextSection}

Generate EXACTLY 2 choice options (A and B). Each should:
- Feel like a REAL decision someone would face at this point — not a generic "good vs bad" choice
- Both options should be EQUALLY TEMPTING and EQUALLY RISKY — the reader should genuinely struggle
- NOT obviously lead to good or bad outcomes (maintain suspense)
- Be specific and personal, not generic
- Hint at different life directions without revealing the destination
- One option should feel "safe" and the other "bold" — but which one actually leads somewhere good is UNPREDICTABLE

Return ONLY a JSON object:
\`\`\`json
{
  "prompt": "A question or situation that frames the choice (2-3 sentences). Make it feel like a real dilemma.",
  "options": [
    {
      "id": "A",
      "label": "Short label for this choice (5-8 words)",
      "hint": "A cryptic hint about where this leads (1 sentence, ambiguous — could be read as good or bad)"
    },
    {
      "id": "B",
      "label": "Short label for this choice (5-8 words)",
      "hint": "A cryptic hint about where this leads (1 sentence, ambiguous — could be read as good or bad)"
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no other text.`;
}

// ============================================================
// Letta Agent 消息构建
// ============================================================

/**
 * 构建发送给 Letta Agent 的故事生成消息
 *
 * 因为 Letta Agent 有自己的 system prompt（Symy 财务伙伴），
 * 我们需要在用户消息中嵌入完整的故事生成指令，
 * 让 Agent 知道当前处于"蝴蝶效应故事模式"。
 */
export function buildButterflyAgentMessage(
  mode: 'outline' | 'chapter' | 'choice' | 'regenerate' | 'summary',
  systemPrompt: string,
  userPrompt: string,
): string {
  return `[BUTTERFLY EFFECT - ${mode.toUpperCase()} MODE]

⚠️ CRITICAL INSTRUCTION: You are in STORY GENERATION MODE. You must NOT call any tools or functions (no add_tokens, no record_impulse, no complete_challenge, no MCP tools — NONE). Do NOT execute any tool calls. Just generate the story content as requested below.

${systemPrompt}

---

${userPrompt}

REMINDER: Do NOT call any tools. Just respond with the requested content (JSON or narrative text). No conversational wrappers, no greetings, no tool calls.`;
}
