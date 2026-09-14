/**
 * complete-story-prompt — 一次生成完整 3 章故事的 prompt (散文格式)
 *
 * 🔧 2026-07-17 (streaming fix): 用散文 + 分隔符代替 JSON, 支持流式输出
 *   LLM 输出格式:
 *     ===CHAPTER 1: Title===
 *     [150-250 words prose]
 *     ===CHAPTER 2: Title===
 *     [150-250 words prose]
 *     ===CHAPTER 3: Title===
 *     [150-250 words prose]
 *     ===BUTTERFLY EFFECT===
 *     [1-2 sentence summary]
 */

import type { DecisionType } from '@/features/butterfly/types';
import { buildButterflyAgentMessage } from '@/features/butterfly/lib/engine';

export function buildCompleteStoryProsePrompt(
  decisionType: DecisionType,
  decisionDescription: string,
  amount?: number,
  platform?: string,
  context?: string,
  locale?: string,
): string {
  const languageInstruction = locale === 'zh'
    ? '\n\n## LANGUAGE\nWrite the ENTIRE story in **Chinese (Simplified)**. Chapter titles, prose, and butterfly effect must all be in Chinese.'
    : '\n\n## LANGUAGE\nWrite the ENTIRE story in **English**.';

  const decision = decisionType === 'bought'
    ? `They DECIDED TO BUY: "${decisionDescription}"`
    : decisionType === 'resisted'
      ? `They DECIDED NOT TO BUY: "${decisionDescription}"`
      : `They are CONSIDERING BUYING (pre-purchase reflection): "${decisionDescription}"`;

  const consideringNote = decisionType === 'considering'
    ? '\n\n⚠️ NOTE: This is a PRE-PURCHASE reflection. Generate the story as if they DID buy.'
    : '';

  const systemPrompt = `You are a mischievous visual novelist who specializes in butterfly-effect stories about money decisions. You love irony, dark humor, and unexpected reversals.

## CORE PRINCIPLES
1. BE ENTERTAINING: Think Black Mirror meets TikTok — short, punchy, unpredictable.
2. CHAOS REIGNS: Small causes cascade into disproportionate, often ironic consequences.
3. RANDOM OUTCOMES: Buying is NOT always bad. Resisting is NOT always good. Subvert expectations.
4. COMPACT TIME: The story happens within a few DAYS.
5. Each chapter is 150-250 words MAX (one page). Short, vivid, cinematic.${languageInstruction}

## OUTPUT FORMAT (CRITICAL — follow exactly)

Write the story as PLAIN TEXT with these exact delimiters:

===CHAPTER 1: [Short Title]===
[150-250 words of second-person narrative. Sensory details. End with a hook.]

===CHAPTER 2: [Short Title]===
[150-250 words. Consequences emerge. Things get weird.]

===CHAPTER 3: [Short Title]===
[150-250 words. The TWIST ending — a reversal that recontextualizes everything.]

===BUTTERFLY EFFECT===
[1-2 sentence summary of the ironic twist]

## RULES
- Start EVERY chapter with ===CHAPTER N: Title=== (exactly 3 = signs)
- End with ===BUTTERFLY EFFECT=== then the summary
- Write in SECOND PERSON ("You walk into the store...")
- Chapter 3 MUST be tone "twist" — a reversal
- Do NOT generate choices. This is a linear 3-chapter story.
- Total: ~750 words. Keep it SHORT and PUNCHY.`;

  const userPrompt = `Generate a complete 3-chapter butterfly-effect story:

${decision}
${amount ? `Amount: $${amount.toFixed(2)}` : ''}
${platform ? `Platform: ${platform}` : ''}
${context ? `Context: ${context}` : ''}${consideringNote}

Remember: Use ===CHAPTER N: Title=== delimiters. Each chapter 150-250 words. Chapter 3 is the twist. End with ===BUTTERFLY EFFECT===. Start NOW.`;

  return buildButterflyAgentMessage('chapter', systemPrompt, userPrompt);
}
