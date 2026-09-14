/**
 * intent-detection Tests — Round 122 audit fix
 *
 * 🔧 之前 intent-detection.ts 0% test coverage (475 lines, critical chat flow)
 * 此测试覆盖:
 * - detectChallengeOutcomeFromAIResponse (PASSED/FAILED patterns, EN + ZH)
 * - detectChallengeSurrenderFromUserMessage (surrender patterns, EN + ZH)
 * - detectIntent (general intent detection)
 * - detectCompensationIntet (challenge-aware compensation)
 * - determineChallengeType (amount → type mapping)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  detectChallengeOutcomeFromAIResponse,
  detectChallengeSurrenderFromUserMessage,
  detectIntent,
  detectCompensationIntent,
  determineChallengeType,
} from '@/lib/intent-detection';

describe('detectChallengeOutcomeFromAIResponse', () => {
  it('returns none for empty AI reply', () => {
    expect(detectChallengeOutcomeFromAIResponse('')).toEqual({ type: 'none' });
  });

  it('detects English "Challenge PASSED" explicit declaration', () => {
    const result = detectChallengeOutcomeFromAIResponse('Challenge PASSED! You saw it. $50 stays.');
    expect(result.type).toBe('challenge_passed');
  });

  it('detects English "challenge passed" lowercase', () => {
    const result = detectChallengeOutcomeFromAIResponse('The challenge passed successfully.');
    expect(result.type).toBe('challenge_passed');
  });

  it('detects English "you completed the challenge"', () => {
    const result = detectChallengeOutcomeFromAIResponse('You completed the challenge. Well done.');
    expect(result.type).toBe('challenge_passed');
  });

  it('detects Chinese 挑战通过', () => {
    const result = detectChallengeOutcomeFromAIResponse('挑战通过！你看到了。$50 留下了。');
    expect(result.type).toBe('challenge_passed');
  });

  it('detects Chinese 你通过了这个挑战', () => {
    const result = detectChallengeOutcomeFromAIResponse('你通过了这个挑战。');
    expect(result.type).toBe('challenge_passed');
  });

  it('detects English "Challenge FAILED"', () => {
    const result = detectChallengeOutcomeFromAIResponse('Challenge FAILED. You bought it.');
    expect(result.type).toBe('challenge_failed');
  });

  it('detects English "challenge failed" lowercase', () => {
    const result = detectChallengeOutcomeFromAIResponse('The challenge failed.');
    expect(result.type).toBe('challenge_failed');
  });

  it('detects Chinese 挑战失败', () => {
    const result = detectChallengeOutcomeFromAIResponse('挑战失败。你买了。');
    expect(result.type).toBe('challenge_failed');
  });

  it('returns none for vague positive phrases (no false positives)', () => {
    const result = detectChallengeOutcomeFromAIResponse('Good job! You did great.');
    expect(result.type).toBe('none');
  });

  it('returns none for non-challenge messages', () => {
    const result = detectChallengeOutcomeFromAIResponse('How are you today?');
    expect(result.type).toBe('none');
  });

  it('extracts amount from AI reply when available', () => {
    const result = detectChallengeOutcomeFromAIResponse('Challenge PASSED! $50 saved.') as { type: string; amount?: number };
    expect(result.type).toBe('challenge_passed');
    expect(result.amount).toBe(50);
  });

  it('uses challengeContext.amount when no amount in reply', () => {
    const result = detectChallengeOutcomeFromAIResponse(
      'Challenge PASSED!',
      { itemName: 'shoes', amount: 100 }
    ) as { type: string; amount?: number };
    expect(result.type).toBe('challenge_passed');
    expect(result.amount).toBe(100);
  });
});

describe('detectChallengeSurrenderFromUserMessage', () => {
  it('returns none when no challengeContext', () => {
    const result = detectChallengeSurrenderFromUserMessage('I will save the money');
    expect(result.type).toBe('none');
  });

  it('returns none for empty message', () => {
    const result = detectChallengeSurrenderFromUserMessage('', { itemName: 'shoes', amount: 50 });
    expect(result.type).toBe('none');
  });

  it('detects English "I\'ll save the money"', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "I'll save the money instead",
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects English "you\'re right"', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "You're right, I don't need it",
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects English "I\'ll pass"', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "I'll pass on this one",
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects English "not going to buy it"', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "I'm not going to buy it",
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects Chinese 我不买了', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      '我不买了',
      { itemName: '鞋子', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects Chinese 你说得对', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      '你说得对，我不需要',
      { itemName: '鞋子', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects Chinese 算了吧', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      '算了吧，不买了',
      { itemName: '鞋子', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('detects Chinese 忍住了不买', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      '忍住了不买',
      { itemName: '鞋子', amount: 50 }
    );
    expect(result.type).toBe('challenge_passed');
  });

  it('returns none for non-surrender message with challengeContext', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      'Tell me more about this product',
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('none');
  });

  // 🔧 Round 122 AUDIT-10 BUG #3 fix: negative path test
  it('does NOT match "I\'m going to buy it" as surrender (BUG #3 regression test)', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "I'm going to buy it",
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('none');
  });

  it('does NOT match "I\'ll buy it" as surrender', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "I'll buy it right now",
      { itemName: 'shoes', amount: 50 }
    );
    expect(result.type).toBe('none');
  });

  it('uses challengeContext.amount for surrender', () => {
    const result = detectChallengeSurrenderFromUserMessage(
      "I'll save the money",
      { itemName: 'shoes', amount: 75 }
    ) as { type: string; amount?: number };
    expect(result.type).toBe('challenge_passed');
    expect(result.amount).toBe(75);
  });
});

describe('detectIntent', () => {
  it('returns none for empty message', () => {
    expect(detectIntent('')).toEqual({ type: 'none' });
  });

  it('returns none for non-financial message', () => {
    expect(detectIntent('Hello, how are you?').type).toBe('none');
  });
});

describe('determineChallengeType', () => {
  it('returns "quick_pass" for amount ≤ 30', () => {
    expect(determineChallengeType(0)).toBe('quick_pass');
    expect(determineChallengeType(30)).toBe('quick_pass');
  });

  it('returns "standard" for amount 31-200', () => {
    expect(determineChallengeType(31)).toBe('standard');
    expect(determineChallengeType(100)).toBe('standard');
    expect(determineChallengeType(200)).toBe('standard');
  });

  it('returns "boss" for amount > 200', () => {
    expect(determineChallengeType(201)).toBe('boss');
    expect(determineChallengeType(1000)).toBe('boss');
  });

  it('returns "quick_pass" for negative/NaN (defensive)', () => {
    expect(determineChallengeType(-10)).toBe('quick_pass');
    expect(determineChallengeType(NaN)).toBe('quick_pass');
  });
});

describe('detectCompensationIntent', () => {
  it('returns none for empty inputs', () => {
    const result = detectCompensationIntent('', '');
    expect(result.type).toBe('none');
  });
});
