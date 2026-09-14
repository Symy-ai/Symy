/**
 * Intent Detection — Challenge-Aware Compensation Module
 *
 * DESIGN PHILOSOPHY:
 * ─────────────────
 * The OLD approach was regex-based pattern matching on both user messages
 * and AI responses, which had critical flaws:
 *   1. English-only patterns → Chinese messages completely missed
 *   2. False positives → "I changed my mind" matched RESISTED but user might mean they decided TO buy
 *   3. Default assumption → if AI doesn't say "FAILED", assume PASSED → gives free rewards
 *   4. No challenge awareness → compensation didn't know if a challenge was active
 *
 * The NEW approach is **Challenge-Context-Aware**:
 *   - When `challengeContext` is present, we check BOTH:
 *     a) AI response for explicit PASSED/FAILED signals (deterministic)
 *     b) User message for surrender/give-up signals (new: closes the challenge loop)
 *   - When no `challengeContext`, we use conservative user-message detection
 *     with both English and Chinese patterns
 *   - We NEVER assume PASSED by default — only compensate on explicit signals
 *   - False negative (miss a compensation) is acceptable; false positive (wrong reward) is NOT
 *
 * BUG-4/6 FIX: Added user-message challenge surrender detection.
 * Previously, if the AI didn't say "Challenge PASSED!", the entire challenge
 * loop was broken — user says "You're right, I'll save the money" but nothing
 * happens. Now we detect the user's surrender intent directly.
 */

import { logger } from '@/lib/logger';

// ============================================================
// Types
// ============================================================

export type DetectedIntent =
  | { type: 'impulse_purchase'; amount?: number; platform?: string; impulseScore?: number }
  | { type: 'resisted_purchase'; amount?: number }
  | { type: 'refund'; amount?: number }
  | { type: 'financial_insight' }
  | { type: 'challenge_passed'; amount?: number; challengeType?: string }
  | { type: 'challenge_failed'; amount?: number }
  | { type: 'none' };

export interface ChallengeContext {
  itemName: string;
  amount: number;
}

// ============================================================
// Challenge Outcome Detection — AI Response Only
// ============================================================

/**
 * Detect Challenge outcome from AI's response text.
 *
 * KEY RULE: We ONLY detect explicit signals. No assumption, no default.
 * - "Challenge PASSED" / "Challenge FAILED" are explicit signals we prompt for
 * - If AI says something ambiguous → return 'none' → no compensation
 * - This prevents false-positive reward/penalty errors
 *
 * Supports both English and Chinese patterns since the AI prompt
 * instructs it to declare "Challenge PASSED!" or "Challenge FAILED!"
 */
export function detectChallengeOutcomeFromAIResponse(
  aiReply: string,
  challengeContext?: ChallengeContext,
): DetectedIntent {
  if (!aiReply) return { type: 'none' };

  // ──── Challenge PASSED signals ────
  // Only match the EXPLICIT declaration patterns we instruct the AI to use.
  // Do NOT match vague positive phrases like "good job" or "you resisted"
  // because those could appear in non-challenge contexts.
  const passedPatterns: RegExp[] = [
    // English explicit declarations (from our prompt template)
    /\bchallenge\s+(?:passed|complete|succeeded|won)\b/i,
    /\byou\s+(?:passed|completed|won)\s+(?:the\s+)?challenge\b/i,
    // Chinese explicit declarations
    /挑战(?:通过|成功|过关|胜利)/,
    /你(?:通过|完成|赢了)(?:了)?(?:这个)?挑战/,
    // The exact phrase from our prompt template
    /Challenge PASSED/i,
  ];

  for (const pattern of passedPatterns) {
    if (pattern.test(aiReply)) {
      const amount = extractAmountFromText(aiReply) ?? challengeContext?.amount;
      const challengeType = determineChallengeType(amount ?? 0);
      logger.info(`[Intent] Challenge PASSED detected (amount: $${amount}, type: ${challengeType})`);
      return { type: 'challenge_passed', amount, challengeType };
    }
  }

  // ──── Challenge FAILED signals ────
  const failedPatterns: RegExp[] = [
    // English explicit declarations
    /\bchallenge\s+(?:failed|lost)\b/i,
    /\byou\s+(?:failed|lost)\s+(?:the\s+)?challenge\b/i,
    // Chinese explicit declarations
    /挑战(?:失败|未通过|没通过)/,
    /你(?:失败|输了)(?:了)?(?:这个)?挑战/,
    // The exact phrase from our prompt template
    /Challenge FAILED/i,
  ];

  for (const pattern of failedPatterns) {
    if (pattern.test(aiReply)) {
      const amount = extractAmountFromText(aiReply) ?? challengeContext?.amount;
      logger.info(`[Intent] Challenge FAILED detected (amount: $${amount})`);
      return { type: 'challenge_failed', amount };
    }
  }

  // No explicit signal found → return none (safe: no compensation)
  return { type: 'none' };
}

// ============================================================
// Challenge Surrender Detection — User Message (Challenge Mode)
// ============================================================

/**
 * BUG-4/6 FIX: Detect when the user gives up / surrenders during a challenge.
 *
 * This is the critical missing piece that broke the challenge loop.
 * When the user explicitly says they'll save the money, put it in the
 * dream fund, or otherwise concede, we should detect this as `challenge_passed`
 * even if the AI didn't output "Challenge PASSED!".
 *
 * These patterns are ONLY checked when challengeContext is active,
 * so they won't trigger false positives in general chat.
 */
const CHALLENGE_SURRENDER_PATTERNS: RegExp[] = [
  // English — user gives up on the purchase
  /\b(i'?ll\s+save\s+(?:the\s+)?money)\b/i,
  /\b(i'?ll\s+put\s+(?:the\s+)?\$?\d+\s+to\s+(?:my\s+)?(?:dream\s+)?fund)\b/i,
  /\b(i'?ll\s+pass\b)/i,
  // 🔧 Round 122 AUDIT-10 BUG #3 fix: 旧代码 (?:not\s+)? 让 "not" 可选
  //    → "I'm going to buy it" 也匹配 (false positive → 错误触发 challenge_passed)
  //    修复: "not" 必填, 只匹配 "I'm [not] [going to] buy it" (用户放弃购买)
  /\b(i'?m\s+not\s+(?:going\s+to\s+)?(?:buy|get|purchase)\s+it\b)/i,
  /\b(you'?re\s+right)\b/i,
  /\b(i\s+don'?t\s+(?:really\s+)?need\s+it)\b/i,
  /\b(i'?ll\s+(?:skip|pass|hold\s+off))\b/i,
  /\b(not\s+(?:going\s+to\s+)?buy(?:ing)?)\b/i,
  /\b(i'?ll\s+save\s+(?:it\s+)?(?:instead|for\s+later))\b/i,
  /\b(i\s+decided\s+(?:not\s+to|against))\b/i,
  /\b(give\s+up|giving\s+up)\b/i,
  /\b(not\s+worth\s+it)\b/i,
  /\b(i\s+can\s+live\s+without)\b/i,
  /\b(i'?d\s+rather\s+save)\b/i,
  // Chinese — user gives up on the purchase
  /你说得对/,
  /我不买了/,
  /还是不买了/,
  /算了吧/,
  /省下(?:这笔|这)?钱/,
  /把钱存(?:到|进)/,
  /不需要/,
  /忍住了?不买/,
  /不划算了/,
  /还是存起来吧/,
];

/**
 * Detect challenge surrender from the user's message.
 * Only called when challengeContext is active.
 *
 * Returns challenge_passed if user explicitly gives up / decides not to buy.
 * The amount comes from challengeContext (deterministic, not regex-extracted).
 */
export function detectChallengeSurrenderFromUserMessage(
  userMessage: string,
  challengeContext?: ChallengeContext,
): DetectedIntent {
  if (!userMessage || !challengeContext) return { type: 'none' };

  const msg = userMessage.trim();
  if (!msg) return { type: 'none' };

  for (const pattern of CHALLENGE_SURRENDER_PATTERNS) {
    if (pattern.test(msg)) {
      // Deterministic: always use challengeContext.amount, not regex-extracted
      const amount = challengeContext.amount;
      const challengeType = determineChallengeType(amount);
      logger.info(`[Intent] Challenge SURRENDER detected from user message (amount: $${amount}, type: ${challengeType}, pattern: ${pattern.source})`);
      return { type: 'challenge_passed', amount, challengeType };
    }
  }

  return { type: 'none' };
}

// ============================================================
// General Intent Detection — User Message (Non-Challenge)
// ============================================================

// ──── Induced Purchase Patterns (English + Chinese) ────
// v2 positioning (2026-06-24): "impulse" repositioned as "algorithmically induced by merchants"
// — the subject is the merchant algorithm, not the user. Old "impulse" wording kept in regex
// for backward compatibility with AI replies that may still use legacy phrasing.
const IMPULSE_PATTERNS: RegExp[] = [
  // English
  /\b(i\s+bought\s+it)\b/i,
  /\b(i\s+already\s+bought)\b/i,
  /\b(just\s+bought)\b/i,
  /\b(i\s+couldn'?t\s+resist)\b/i,
  /\b(i\s+gave\s+in)\b/i,
  /\b(i\s+ended\s+up\s+buying)\b/i,
  /\b(i\s+ordered)\b/i,
  /\b(i\s+purchased)\b/i,
  /\b(i\s+spent)\b/i,
  /\b(already\s+ordered)\b/i,
  /\b(i\s+couldn'?t\s+help\s+it)\b/i,
  // Chinese — induced purchase (商家诱导)
  /买了/,
  /下单了/,
  /没忍住/,
  /还是买了/,
  /忍不住买了/,
  /付了款/,
  /已经下单/,
];

// ──── Resisted Purchase Patterns (English + Chinese) ────
// ⚠️ REMOVED "I changed my mind" — too ambiguous (could mean decided TO buy)
const RESISTED_PATTERNS: RegExp[] = [
  // English
  /\b(i\s+didn'?t\s+buy)\b/i,
  /\b(i\s+decided\s+not\s+to\s+buy)\b/i,
  /\b(i\s+resisted)\b/i,
  /\b(i\s+put\s+it\s+back)\b/i,
  /\b(i\s+walked\s+away)\b/i,
  /\b(i\s+stopped\s+myself)\b/i,
  /\b(i\s+held\s+off)\b/i,
  /\b(i'?m\s+not\s+going\s+to\s+buy)\b/i,
  /\b(i\s+saved\s+the\s+money)\b/i,
  /\b(i\s+didn'?t\s+give\s+in)\b/i,
  // Chinese — resisted purchase
  /没买/,
  /忍住了/,
  /放回去了/,
  /决定不买了/,
  /没下单/,
  /忍住没买/,
  /忍住了没买/,
];

// ──── Refund Patterns (English + Chinese) ────
const REFUND_PATTERNS: RegExp[] = [
  // English
  /\b(i\s+returned\s+it)\b/i,
  /\b(i\s+got\s+a\s+refund)\b/i,
  /\b(i\s+cancelled\s+the\s+order)\b/i,
  /\b(i\s+sent\s+it\s+back)\b/i,
  /\b(got\s+my\s+money\s+back)\b/i,
  // Chinese
  /退货了/,
  /退款了/,
  /取消了订单/,
  /退了/,
];

// ──── Financial Insight Patterns (English + Chinese) ────
const INSIGHT_PATTERNS: RegExp[] = [
  // English
  /\b(i\s+realized)\b/i,
  /\b(i\s+never\s+thought\s+about)\b/i,
  /\b(now\s+i\s+understand)\b/i,
  /\b(i\s+see\s+the\s+pattern)\b/i,
  /\b(i\s+should\s+really\s+stop)\b/i,
  // Chinese
  /我意识到/,
  /我发现我不需要/,
  /我明白了/,
  /我看到了规律/,
];

/**
 * Detect the user's intent from their message.
 * Only used when NO challengeContext is available (general chat).
 *
 * For Challenge mode, use detectChallengeOutcomeFromAIResponse() instead.
 */
export function detectIntent(userMessage: string): DetectedIntent {
  const msg = userMessage.trim();
  if (!msg) return { type: 'none' };

  // Check in priority order: refund > resisted > impulse > insight
  // Refund first because "I returned it" should not be confused with buying

  for (const pattern of REFUND_PATTERNS) {
    if (pattern.test(msg)) {
      const amount = extractAmountFromText(msg);
      return { type: 'refund', amount };
    }
  }

  for (const pattern of RESISTED_PATTERNS) {
    if (pattern.test(msg)) {
      const amount = extractAmountFromText(msg);
      return { type: 'resisted_purchase', amount };
    }
  }

  for (const pattern of IMPULSE_PATTERNS) {
    if (pattern.test(msg)) {
      const amount = extractAmountFromText(msg);
      return { type: 'impulse_purchase', amount, impulseScore: 70 };
    }
  }

  for (const pattern of INSIGHT_PATTERNS) {
    if (pattern.test(msg)) {
      return { type: 'financial_insight' };
    }
  }

  return { type: 'none' };
}

// ============================================================
// Unified Detection Entry Point
// ============================================================

/**
 * The main entry point for compensation detection.
 *
 * Strategy:
 * - If challengeContext is present → ONLY use AI response detection
 *   (user message detection is unreliable for challenge flow)
 * - If no challengeContext → use user message detection + AI response
 *   as a second pass (general financial events)
 *
 * Returns a conservative result. When in doubt, returns 'none'.
 */
export function detectCompensationIntent(
  userMessage: string,
  aiReply: string,
  challengeContext?: ChallengeContext,
): DetectedIntent {
  // ──── Challenge Mode: AI response first, then user message surrender ────
  // BUG-4/6 FIX: Previously only checked AI response for "Challenge PASSED/FAILED".
  // Now also checks user message for surrender patterns ("You're right", "I'll save the money").
  if (challengeContext) {
    // Priority 1: AI explicitly declared PASSED or FAILED
    const challengeResult = detectChallengeOutcomeFromAIResponse(aiReply, challengeContext);
    if (challengeResult.type !== 'none') {
      return challengeResult;
    }

    // Priority 2: User message indicates surrender (giving up on the purchase)
    const surrenderResult = detectChallengeSurrenderFromUserMessage(userMessage, challengeContext);
    if (surrenderResult.type !== 'none') {
      return surrenderResult;
    }

    // No explicit signal found → no compensation (safe choice)
    return { type: 'none' };
  }

  // ──── General Mode: user message first, then AI response ────
  const userIntent = detectIntent(userMessage);
  if (userIntent.type !== 'none') {
    return userIntent;
  }

  // Second pass: check AI response for financial event signals
  // (e.g., AI mentions recording something but didn't actually call the tool)
  if (aiReply) {
    const aiIntent = detectGeneralFinancialEventFromAIResponse(aiReply);
    if (aiIntent.type !== 'none') {
      return aiIntent;
    }
  }

  return { type: 'none' };
}

/**
 * Detect general financial events from AI's response.
 * Used as a second pass when user message didn't match any pattern.
 *
 * Only detects explicit mentions of tool-worthy events,
 * not vague positive phrases.
 */
function detectGeneralFinancialEventFromAIResponse(aiReply: string): DetectedIntent {
  if (!aiReply) return { type: 'none' };

  // AI mentions recording an inducement / impulse (but didn't actually call the tool)
  // — accepts both v2 "inducement/induced/被诱导" and legacy "impulse/冲动" wording
  const impulseMention = /\b(?:recorded|logging|noted?)\s+(?:an?\s+)?(?:impulse|inducement|induced\s+purchase)\b/i.test(aiReply)
    || /记录了(?:一次)?(?:冲动消费|被诱导消费|诱导消费)/.test(aiReply)
    || /\b(?:spotted|detected)\s+(?:an?\s+)?(?:inducement|induced\s+purchase)\b/i.test(aiReply);
  if (impulseMention) {
    const amount = extractAmountFromText(aiReply);
    return { type: 'impulse_purchase', amount, impulseScore: 65 };
  }

  // AI mentions a refund
  const refundMention = /\b(?:processed|recorded|logged)\s+(?:a\s+)?refund\b/i.test(aiReply)
    || /处理了退款/.test(aiReply);
  if (refundMention) {
    const amount = extractAmountFromText(aiReply);
    return { type: 'refund', amount };
  }

  return { type: 'none' };
}

// ============================================================
// Monitoring: Log Missed Tool Calls
// ============================================================

/**
 * Log a missed tool call event for analytics.
 * Helps identify patterns where the AI prompt needs improvement.
 */
export function logMissedToolCall(
  intent: DetectedIntent,
  userMessage: string,
  aiReply?: string,
): void {
  if (intent.type === 'none') return;

  const expectedTools = getExpectedTools(intent);
  const timestamp = new Date().toISOString();

  logger.warn(
    `[Compensation] MISSED TOOL CALL at ${timestamp}\n` +
    `  Intent: ${intent.type}\n` +
    `  Expected tools: ${expectedTools.join(', ')}\n` +
    `  User message: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"\n` +
    `  AI reply: "${(aiReply || '').substring(0, 100)}${(aiReply || '').length > 100 ? '...' : ''}"\n` +
    `  Action: Compensation executed as safety net`
  );
}

function getExpectedTools(intent: DetectedIntent): string[] {
  switch (intent.type) {
    case 'impulse_purchase':
      return ['record_impulse'];
    case 'resisted_purchase':
      return ['complete_challenge', 'add_dream_fund_progress'];
    case 'refund':
      return ['add_tokens', 'add_dream_fund_progress'];
    case 'financial_insight':
      return ['add_tokens'];
    case 'challenge_passed':
      return ['complete_challenge', 'add_dream_fund_progress'];
    case 'challenge_failed':
      return ['add_dream_fund_progress'];
    default:
      return [];
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Extract dollar amount from text.
 * Returns the first amount found, or undefined.
 */
function extractAmountFromText(text: string): number | undefined {
  const match = text.match(/\$(\d+(?:\.\d{1,2})?)/);
  return match ? parseFloat(match[1]) : undefined;
}

/**
 * Determine challenge type from amount.
 * Must match the logic in chat-tab.tsx prompt construction.
 */
export function determineChallengeType(amount: number): string {
  if (amount > 200) return 'boss';
  if (amount > 30) return 'standard';
  return 'quick_pass';
}
