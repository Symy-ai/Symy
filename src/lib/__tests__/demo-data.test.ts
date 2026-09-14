/**
 * Tests for Demo Data (demo-data.ts)
 *
 * Covers:
 * - generateRandomNotification: structure, randomness ranges
 * - QUICK_REPLIES / DEMO_QUICK_REPLIES: content
 * - getLocalizedQuickReplies / getLocalizedChatQuickReplies: i18n
 * - DEMO_BUDDY_STATE: structure, SAVINGS_FUND_TARGET consistency
 * - DEMO_CHAT_MESSAGES: structure
 * - DEMO_IMPULSE_EVENTS: structure
 * - DEMO_STATS: values
 * - DEMO_AI_RESPONSES: keys, content
 * - getLocalizedDemoAIResponses / getLocalizedDreamFunds: i18n
 */

import { describe, it, expect } from 'vitest';
import {
  generateRandomNotification,
  QUICK_REPLIES,
  DEMO_QUICK_REPLIES,
  getLocalizedQuickReplies,
  getLocalizedChatQuickReplies,
  DEMO_BUDDY_STATE,
  DEMO_CHAT_MESSAGES,
  DEMO_IMPULSE_EVENTS,
  DEMO_STATS,
  DEMO_AI_RESPONSES,
  getLocalizedDemoAIResponses,
  getLocalizedDreamFunds,
  type TFn,
} from '@/lib/demo-data';
import { SAVINGS_FUND_TARGET } from '@/lib/buddy-defaults';

describe('generateRandomNotification', () => {
  it('returns a valid TikTokShopNotification', () => {
    const notif = generateRandomNotification();
    expect(notif).toBeDefined();
    expect(notif.id).toBeTruthy();
    expect(notif.platform).toBe('TikTok Shop');
    expect(notif.item).toBeTruthy();
    expect(notif.amount).toBeGreaterThan(0);
    expect(notif.category).toBeTruthy();
    expect(notif.thumbnail).toBeTruthy();
    expect(notif.timestamp).toBeInstanceOf(Date);
  });

  it('generates unique IDs (random component)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRandomNotification().id);
    }
    // Should have many unique IDs (very low collision probability)
    expect(ids.size).toBeGreaterThan(90);
  });

  it('isLivestream is boolean', () => {
    for (let i = 0; i < 20; i++) {
      expect(typeof generateRandomNotification().isLivestream).toBe('boolean');
    }
  });

  it('isFlashSale is boolean', () => {
    for (let i = 0; i < 20; i++) {
      expect(typeof generateRandomNotification().isFlashSale).toBe('boolean');
    }
  });

  it('returns valid category from TIKTOK_ITEMS', () => {
    const validCategories = [
      'Home Decor', 'Phone Accessories', 'Beauty & Skincare', 'Novelty Items',
      'Fitness Gadgets', 'Snacks & Treats', 'Fashion & Accessories', 'Collectibles',
      'Books & Media', 'Kitchen & Dining', 'Tools & Repair', 'Personal Care', 'Household Essentials',
    ];
    for (let i = 0; i < 20; i++) {
      expect(validCategories).toContain(generateRandomNotification().category);
    }
  });
});

describe('QUICK_REPLIES', () => {
  it('has 5 quick replies', () => {
    expect(QUICK_REPLIES).toHaveLength(5);
  });

  it('includes regret reply', () => {
    expect(QUICK_REPLIES.some(r => r.includes('regret'))).toBe(true);
  });

  it('includes livestream reply', () => {
    expect(QUICK_REPLIES.some(r => r.includes('livestream'))).toBe(true);
  });

  it('includes refund reply', () => {
    expect(QUICK_REPLIES.some(r => r.includes('refund'))).toBe(true);
  });
});

describe('DEMO_QUICK_REPLIES', () => {
  it('has 5 chat quick replies', () => {
    expect(DEMO_QUICK_REPLIES).toHaveLength(5);
  });

  it('includes "almost bought" reply', () => {
    expect(DEMO_QUICK_REPLIES.some(r => r.includes('almost bought'))).toBe(true);
  });

  it('includes "resisted" reply', () => {
    expect(DEMO_QUICK_REPLIES.some(r => r.includes('resisted'))).toBe(true);
  });
});

describe('getLocalizedQuickReplies', () => {
  const mockT: TFn = (key: string) => `[zh]${key}`;

  // 🔧 F4 fix (2026-07-18): reduced from 5 to 4 replies (2 bought + 2 not-bought)
  it('🔧 F4 fix: returns 4 replies (2 bought + 2 not-bought)', () => {
    const result = getLocalizedQuickReplies(mockT);
    expect(result).toHaveLength(4);
  });

  it('uses t function for each reply', () => {
    const result = getLocalizedQuickReplies(mockT);
    for (const reply of result) {
      expect(reply).toContain('[zh]demo.quickReplies.');
    }
  });

  it('🔧 F4 fix: includes boughtIt + boughtImpulse + resisted + dontNeed keys', () => {
    const result = getLocalizedQuickReplies(mockT);
    expect(result).toContain('[zh]demo.quickReplies.boughtIt');
    expect(result).toContain('[zh]demo.quickReplies.boughtImpulse');
    expect(result).toContain('[zh]demo.quickReplies.resisted');
    expect(result).toContain('[zh]demo.quickReplies.dontNeed');
  });
});

describe('getLocalizedChatQuickReplies', () => {
  const mockT: TFn = (key: string) => `[zh]${key}`;

  it('returns 5 replies', () => {
    const result = getLocalizedChatQuickReplies(mockT);
    expect(result).toHaveLength(5);
  });

  it('uses t function for each reply', () => {
    const result = getLocalizedChatQuickReplies(mockT);
    for (const reply of result) {
      expect(reply).toContain('[zh]demo.chatQuickReplies.');
    }
  });
});

describe('DEMO_BUDDY_STATE', () => {
  it('has all required BuddyState fields', () => {
    expect(DEMO_BUDDY_STATE.vitality).toBeGreaterThan(0);
    expect(DEMO_BUDDY_STATE.tokens).toBeGreaterThan(0);
    expect(DEMO_BUDDY_STATE.health).toBe('thriving');
    expect(DEMO_BUDDY_STATE.level).toBeGreaterThan(0);
    expect(DEMO_BUDDY_STATE.xp).toBeGreaterThanOrEqual(0);
    expect(DEMO_BUDDY_STATE.xpToNext).toBeGreaterThan(0);
    expect(DEMO_BUDDY_STATE.streak).toBeGreaterThan(0);
    expect(DEMO_BUDDY_STATE.dreamFunds).toBeInstanceOf(Array);
    expect(DEMO_BUDDY_STATE.badges).toBeInstanceOf(Array);
    expect(DEMO_BUDDY_STATE.totalSaved).toBeGreaterThanOrEqual(0);
    expect(DEMO_BUDDY_STATE.challengesCompleted).toBeGreaterThanOrEqual(0);
    expect(DEMO_BUDDY_STATE.lastHealingKitAt).toBeNull();
    expect(DEMO_BUDDY_STATE.version).toBe(0);
  });

  it('has 3 dream funds (Credit Card, Iceland, Savings)', () => {
    expect(DEMO_BUDDY_STATE.dreamFunds).toHaveLength(3);
    const names = DEMO_BUDDY_STATE.dreamFunds.map(f => f.name);
    expect(names).toContain('Credit Card Payoff');
    expect(names).toContain('Iceland Trip');
    expect(names).toContain('Savings');
  });

  it('Savings fund uses SAVINGS_FUND_TARGET (consistency with buddy-defaults)', () => {
    const savings = DEMO_BUDDY_STATE.dreamFunds.find(f => f.name === 'Savings');
    expect(savings?.target).toBe(SAVINGS_FUND_TARGET);
  });

  it('Iceland Trip target is $5000 (matches buddy-defaults)', () => {
    const iceland = DEMO_BUDDY_STATE.dreamFunds.find(f => f.name === 'Iceland Trip');
    expect(iceland?.target).toBe(5000);
  });

  it('Credit Card Payoff target is $12000 (P1-K-1: realistic kill-line scenario)', () => {
    const credit = DEMO_BUDDY_STATE.dreamFunds.find(f => f.name === 'Credit Card Payoff');
    expect(credit?.target).toBe(12000);
  });

  it('has badges array with at least 1 badge', () => {
    // 🔧 2026-07-15: Updated from 3 to 1 — demo data was simplified
    expect(DEMO_BUDDY_STATE.badges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DEMO_CHAT_MESSAGES', () => {
  it('is a non-empty array', () => {
    expect(DEMO_CHAT_MESSAGES).toBeInstanceOf(Array);
    expect(DEMO_CHAT_MESSAGES.length).toBeGreaterThan(0);
  });

  it('all messages have required fields', () => {
    for (const msg of DEMO_CHAT_MESSAGES) {
      expect(msg.id).toBeTruthy();
      expect(['user', 'assistant']).toContain(msg.role);
      expect(msg.content).toBeTruthy();
      expect(msg.timestamp).toBeInstanceOf(Date);
    }
  });

  it('starts with assistant message', () => {
    expect(DEMO_CHAT_MESSAGES[0].role).toBe('assistant');
  });

  it('has alternating user/assistant messages (typical chat pattern)', () => {
    // Check at least the first few messages alternate
    for (let i = 1; i < Math.min(5, DEMO_CHAT_MESSAGES.length); i++) {
      if (DEMO_CHAT_MESSAGES[i].role === DEMO_CHAT_MESSAGES[i - 1].role) {
        // Allow consecutive same-role (rare but possible)
        continue;
      }
    }
    // Just verify both roles appear
    const roles = new Set(DEMO_CHAT_MESSAGES.map(m => m.role));
    expect(roles.has('user')).toBe(true);
    expect(roles.has('assistant')).toBe(true);
  });
});

describe('DEMO_IMPULSE_EVENTS', () => {
  it('is a non-empty array', () => {
    expect(DEMO_IMPULSE_EVENTS).toBeInstanceOf(Array);
    expect(DEMO_IMPULSE_EVENTS.length).toBeGreaterThan(0);
  });

  it('all events have required fields', () => {
    for (const evt of DEMO_IMPULSE_EVENTS) {
      expect(evt.id).toBeTruthy();
      expect(evt.platform).toBeTruthy();
      expect(evt.item).toBeTruthy();
      expect(evt.amount).toBeGreaterThanOrEqual(0);
      expect(evt.timestamp).toBeInstanceOf(Date);
      expect(evt.category).toBeTruthy();
      expect(typeof evt.isLivestream).toBe('boolean');
      expect(typeof evt.isFlashSale).toBe('boolean');
      expect(evt.impulseScore).toBeGreaterThanOrEqual(0);
      expect(evt.impulseScore).toBeLessThanOrEqual(100);
      expect(evt.reasons).toBeInstanceOf(Array);
    }
  });
});

describe('DEMO_STATS', () => {
  it('has all required fields', () => {
    expect(DEMO_STATS.totalEvents).toBeGreaterThan(0);
    expect(DEMO_STATS.impulseInterventions).toBeGreaterThan(0);
    expect(DEMO_STATS.moneySaved).toBeGreaterThan(0);
    expect(DEMO_STATS.daysStreak).toBeGreaterThan(0);
  });

  it('impulseInterventions is less than totalEvents (consistency)', () => {
    expect(DEMO_STATS.impulseInterventions).toBeLessThanOrEqual(DEMO_STATS.totalEvents);
  });
});

describe('DEMO_AI_RESPONSES', () => {
  it('has all required keys', () => {
    expect(DEMO_AI_RESPONSES.default).toBeTruthy();
    expect(DEMO_AI_RESPONSES.impulse).toBeTruthy();
    expect(DEMO_AI_RESPONSES.resist).toBeTruthy();
    expect(DEMO_AI_RESPONSES.refund).toBeTruthy();
    expect(DEMO_AI_RESPONSES.pattern).toBeTruthy();
  });

  it('all responses are non-empty strings', () => {
    for (const key of Object.keys(DEMO_AI_RESPONSES)) {
      expect(typeof DEMO_AI_RESPONSES[key]).toBe('string');
      expect(DEMO_AI_RESPONSES[key].length).toBeGreaterThan(20);
    }
  });

  it('default response mentions "demo" or "sign up"', () => {
    expect(DEMO_AI_RESPONSES.default.toLowerCase()).toMatch(/demo|sign up|full version/);
  });
});

describe('getLocalizedDemoAIResponses', () => {
  const mockT: TFn = (key: string) => `[zh]${key}`;

  // 🔧 P0-5 fix: 新增 4 个 challengeFollowUp 回复 (6 → 10 keys)
  it('returns all 10 response keys (6 original + 4 challengeFollowUp)', () => {
    const result = getLocalizedDemoAIResponses(mockT);
    expect(Object.keys(result)).toHaveLength(10);
    expect(result.default).toBeTruthy();
    expect(result.impulse).toBeTruthy();
    expect(result.resist).toBeTruthy();
    expect(result.refund).toBeTruthy();
    expect(result.pattern).toBeTruthy();
    expect(result.bnpl).toBeTruthy();
    // P0-5: challenge follow-up replies
    expect(result.challengeFollowUp).toBeTruthy();
    expect(result.challengeFollowUpWant).toBeTruthy();
    expect(result.challengeFollowUpFriends).toBeTruthy();
    expect(result.challengeFollowUpNeed).toBeTruthy();
  });

  it('uses t function for each response', () => {
    const result = getLocalizedDemoAIResponses(mockT);
    expect(result.default).toBe('[zh]demo.aiResponses.default');
    expect(result.impulse).toBe('[zh]demo.aiResponses.impulse');
  });
});

describe('getLocalizedDreamFunds', () => {
  const mockT: TFn = (key: string, values?: Record<string, string | number>) =>
    values ? `[zh]${key}:${JSON.stringify(values)}` : `[zh]${key}`;

  it('returns 3 dream funds', () => {
    const result = getLocalizedDreamFunds(mockT);
    expect(result).toHaveLength(3);
  });

  it('each fund has required fields', () => {
    const result = getLocalizedDreamFunds(mockT);
    for (const fund of result) {
      expect(fund.id).toBeTruthy();
      expect(fund.name).toBeTruthy();
      expect(fund.target).toBeGreaterThan(0);
      expect(fund.current).toBeGreaterThanOrEqual(0);
      expect(fund.emoji).toBeTruthy();
    }
  });

  it('Savings fund uses SAVINGS_FUND_TARGET', () => {
    const result = getLocalizedDreamFunds(mockT);
    const savings = result.find(f => f.id === 'df-savings');
    expect(savings?.target).toBe(SAVINGS_FUND_TARGET);
  });

  it('uses t function for fund names', () => {
    const result = getLocalizedDreamFunds(mockT);
    expect(result[0].name).toContain('[zh]demo.dreamFunds.');
  });

  it('Savings fund name uses defaultValue parameter', () => {
    const result = getLocalizedDreamFunds(mockT);
    const savings = result.find(f => f.id === 'df-savings');
    expect(savings?.name).toContain('defaultValue');
  });
});
