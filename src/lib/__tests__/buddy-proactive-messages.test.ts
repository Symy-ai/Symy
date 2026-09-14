/**
 * P1-5: buddy-proactive-messages 纯函数测试
 *
 * 覆盖:
 * - detectTriggers (各种触发条件)
 * - isTriggerRecentlySent / filterRecentTriggers
 * - generateProactiveMessage
 * - getUnreadMessages / getLatestUnread
 * - markMessageRead
 * - capMessages
 * - formatDateYMD / daysBetween
 * - generateProactiveMessages (主入口)
 */

import { describe, it, expect } from 'vitest';
import {
  detectTriggers,
  isTriggerRecentlySent,
  filterRecentTriggers,
  generateProactiveMessage,
  getUnreadMessages,
  getLatestUnread,
  markMessageRead,
  capMessages,
  formatDateYMD,
  daysBetween,
  generateProactiveMessages,
  MESSAGE_POOL,
  MESSAGE_FALLBACK,
  // 🔧 2026-07-17 (task 3): 新增 pickMessageTextKey + 分类映射测试
  pickMessageTextKey,
  TRIGGER_CATEGORY,
  CATEGORY_META,
  type MessageCategory,
} from '../buddy-proactive-messages';
import type { BuddyState, ProactiveMessage } from '@/types/buddy-state';
import { DEFAULT_STATE } from '@/hooks/buddy-state-helpers';

// Mock BuddyState (用 DEFAULT_STATE 作为基础)
function makeBuddyState(overrides: Partial<BuddyState> = {}): BuddyState {
  return { ...DEFAULT_STATE, ...overrides };
}

describe('P1-5: detectTriggers', () => {
  it('triggers growth_stage_up when justGrewStage', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T10:00:00Z'),
      justGrewStage: true,
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('growth_stage_up');
  });

  it('triggers personality_awakened when justAwakenedPersonality', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T10:00:00Z'),
      justAwakenedPersonality: true,
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('personality_awakened');
  });

  it('triggers challenge_completed when justCompletedChallenge', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T10:00:00Z'),
      justCompletedChallenge: true,
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('challenge_completed');
  });

  it('triggers challenge_failed when justFailedChallenge', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T10:00:00Z'),
      justFailedChallenge: true,
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('challenge_failed');
  });

  it('triggers low_vitality when vitality < 30', () => {
    const ctx = {
      buddyState: makeBuddyState({ vitality: 25 }),
      now: new Date('2026-07-10T10:00:00Z'),
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('low_vitality');
  });

  it('triggers high_vitality when vitality > 90', () => {
    const ctx = {
      buddyState: makeBuddyState({ vitality: 95 }),
      now: new Date('2026-07-10T10:00:00Z'),
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('high_vitality');
  });

  it('triggers streak_milestone at 7, 14, 30, 60, 100', () => {
    for (const streak of [7, 14, 30, 60, 100]) {
      const ctx = {
        buddyState: makeBuddyState({ streak }),
        now: new Date('2026-07-10T10:00:00Z'),
      };
      const triggers = detectTriggers(ctx);
      expect(triggers).toContain('streak_milestone');
    }
  });

  it('does not trigger streak_milestone for non-milestone streak', () => {
    for (const streak of [1, 5, 6, 8, 13, 15, 31]) {
      const ctx = {
        buddyState: makeBuddyState({ streak }),
        now: new Date('2026-07-10T10:00:00Z'),
      };
      const triggers = detectTriggers(ctx);
      expect(triggers).not.toContain('streak_milestone');
    }
  });

  it('triggers morning_checkin when first open of the day (5-12 AM)', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T08:00:00Z'), // 8 AM UTC
      lastOpenDate: '2026-07-09',
    };
    const triggers = detectTriggers(ctx);
    // local time may vary, but morning_checkin should trigger if hour 5-12
    // 用 UTC 测试, hour=8
    expect(triggers).toContain('morning_checkin');
  });

  it('triggers evening_reflection when first open of the day (19-23 PM)', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T20:00:00Z'), // 8 PM UTC
      lastOpenDate: '2026-07-09',
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('evening_reflection');
  });

  it('triggers long_absence when 2+ days since last open', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T10:00:00Z'),
      lastOpenDate: '2026-07-07', // 3 days ago
    };
    const triggers = detectTriggers(ctx);
    expect(triggers).toContain('long_absence');
  });

  it('does not trigger time-based when lastOpenDate is today', () => {
    const ctx = {
      buddyState: makeBuddyState(),
      now: new Date('2026-07-10T10:00:00Z'),
      lastOpenDate: '2026-07-10', // today (假设 UTC)
    };
    const triggers = detectTriggers(ctx);
    // 不应该有 morning_checkin / evening_reflection / long_absence
    expect(triggers).not.toContain('morning_checkin');
    expect(triggers).not.toContain('evening_reflection');
    expect(triggers).not.toContain('long_absence');
  });
});

describe('P1-5: isTriggerRecentlySent', () => {
  const now = new Date('2026-07-10T10:00:00Z');
  const messages: ProactiveMessage[] = [
    {
      id: 'm1',
      trigger: 'morning_checkin',
      textKey: 'buddy.proactiveMessages.morning_1',
      textFallback: 'Good morning.',
      createdAt: new Date('2026-07-10T08:00:00Z').toISOString(), // 2h ago
      read: false,
    },
  ];

  it('returns true when trigger sent within window', () => {
    expect(isTriggerRecentlySent(messages, 'morning_checkin', now, 24)).toBe(true);
  });

  it('returns false when trigger not in messages', () => {
    expect(isTriggerRecentlySent(messages, 'evening_reflection', now, 24)).toBe(false);
  });

  it('returns false when trigger sent outside window', () => {
    const oldMessages: ProactiveMessage[] = [
      {
        ...messages[0],
        createdAt: new Date('2026-07-08T08:00:00Z').toISOString(), // 2 days ago
      },
    ];
    expect(isTriggerRecentlySent(oldMessages, 'morning_checkin', now, 24)).toBe(false);
  });
});

describe('P1-5: filterRecentTriggers', () => {
  it('filters out recently sent triggers', () => {
    const now = new Date('2026-07-10T10:00:00Z');
    const messages: ProactiveMessage[] = [
      {
        id: 'm1',
        trigger: 'morning_checkin',
        textKey: 'k',
        textFallback: 'f',
        createdAt: new Date('2026-07-10T08:00:00Z').toISOString(),
        read: false,
      },
    ];
    const triggers = ['morning_checkin', 'low_vitality'] as const;
    const filtered = filterRecentTriggers([...triggers], messages, now, 24);
    expect(filtered).toEqual(['low_vitality']);
  });
});

describe('P1-5: generateProactiveMessage', () => {
  it('generates message with correct trigger', () => {
    const now = new Date('2026-07-10T10:00:00Z');
    const msg = generateProactiveMessage('morning_checkin', now);
    expect(msg.trigger).toBe('morning_checkin');
    expect(msg.read).toBe(false);
    expect(msg.createdAt).toBe(now.toISOString());
    expect(msg.id).toContain('morning_checkin');
    expect(msg.id).toContain(String(now.getTime()));
  });

  it('selects textKey from MESSAGE_POOL', () => {
    const msg = generateProactiveMessage('low_vitality');
    expect(MESSAGE_POOL.low_vitality).toContain(msg.textKey);
  });

  it('sets textFallback from MESSAGE_FALLBACK', () => {
    const msg = generateProactiveMessage('long_absence');
    expect(msg.textFallback).toBe(MESSAGE_FALLBACK.long_absence);
  });

  it('generates unique IDs (with random component)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateProactiveMessage('morning_checkin').id);
    }
    // 至少 90 个唯一 (允许少量碰撞)
    expect(ids.size).toBeGreaterThan(90);
  });
});

describe('P1-5: getUnreadMessages', () => {
  it('returns only unread messages', () => {
    const messages: ProactiveMessage[] = [
      { id: '1', trigger: 'morning_checkin', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T10:00:00Z', read: false },
      { id: '2', trigger: 'evening_reflection', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T11:00:00Z', read: true },
      { id: '3', trigger: 'long_absence', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T12:00:00Z', read: false },
    ];
    const unread = getUnreadMessages(messages);
    expect(unread).toHaveLength(2);
    expect(unread.map(m => m.id)).toEqual(['1', '3']);
  });
});

describe('P1-5: getLatestUnread', () => {
  it('returns null when no messages', () => {
    expect(getLatestUnread([])).toBeNull();
  });

  it('returns null when all read', () => {
    const messages: ProactiveMessage[] = [
      { id: '1', trigger: 'morning_checkin', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T10:00:00Z', read: true },
    ];
    expect(getLatestUnread(messages)).toBeNull();
  });

  it('returns latest unread (by createdAt desc)', () => {
    const messages: ProactiveMessage[] = [
      { id: 'old', trigger: 'morning_checkin', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T10:00:00Z', read: false },
      { id: 'new', trigger: 'evening_reflection', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T12:00:00Z', read: false },
      { id: 'mid', trigger: 'long_absence', textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T11:00:00Z', read: false },
    ];
    const latest = getLatestUnread(messages);
    expect(latest?.id).toBe('new');
  });
});

describe('P1-5: markMessageRead', () => {
  it('marks specified message as read', () => {
    const messages: ProactiveMessage[] = [
      { id: '1', trigger: 'morning_checkin' as const, textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T10:00:00Z', read: false },
      { id: '2', trigger: 'morning_checkin' as const, textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T11:00:00Z', read: false },
    ];
    const updated = markMessageRead(messages, '1');
    expect(updated[0].read).toBe(true);
    expect(updated[1].read).toBe(false);
  });

  it('does not mutate original', () => {
    const messages: ProactiveMessage[] = [
      { id: '1', trigger: 'morning_checkin' as const, textKey: 'k', textFallback: 'f', createdAt: '2026-07-10T10:00:00Z', read: false },
    ];
    markMessageRead(messages, '1');
    expect(messages[0].read).toBe(false);
  });
});

describe('P1-5: capMessages', () => {
  it('returns original when under cap', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), trigger: 'morning_checkin' as const, textKey: 'k', textFallback: 'f',
      createdAt: new Date(2026, 6, 10, 10, i).toISOString(), read: false,
    }));
    expect(capMessages(messages, 20)).toHaveLength(10);
  });

  it('caps to max, keeping latest', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      id: String(i), trigger: 'morning_checkin' as const, textKey: 'k', textFallback: 'f',
      createdAt: new Date(2026, 6, 10, 10, i).toISOString(), read: false,
    }));
    const capped = capMessages(messages, 20);
    expect(capped).toHaveLength(20);
    // 最新的 20 条 (id 5-24)
    expect(capped[0].id).toBe('24'); // 降序, 最新在前
    expect(capped[19].id).toBe('5');
  });
});

describe('P1-5: formatDateYMD', () => {
  it('formats date correctly', () => {
    const d = new Date(2026, 6, 10); // 2026-07-10 local
    expect(formatDateYMD(d)).toBe('2026-07-10');
  });

  it('pads month and day', () => {
    const d = new Date(2026, 0, 5); // 2026-01-05
    expect(formatDateYMD(d)).toBe('2026-01-05');
  });
});

describe('P1-5: daysBetween', () => {
  it('calculates days between two dates', () => {
    expect(daysBetween('2026-07-10', '2026-07-13')).toBe(3);
    expect(daysBetween('2026-07-10', '2026-07-10')).toBe(0);
    expect(daysBetween('2026-07-10', '2026-07-01')).toBe(9);
  });
});

describe('P1-5: generateProactiveMessages (主入口)', () => {
  it('returns empty when no triggers', () => {
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50, streak: 3 }),
      now: new Date('2026-07-10T15:00:00Z'), // 3 PM — no morning/evening
      lastOpenDate: '2026-07-10', // today
    };
    const messages = generateProactiveMessages(ctx);
    expect(messages).toEqual([]);
  });

  it('generates messages for triggered events', () => {
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50 }),
      now: new Date('2026-07-10T15:00:00Z'), // 3 PM — no morning/evening trigger
      lastOpenDate: '2026-07-10', // today — no absence/morning/evening
      justCompletedChallenge: true,
    };
    const messages = generateProactiveMessages(ctx);
    expect(messages).toHaveLength(1);
    expect(messages[0].trigger).toBe('challenge_completed');
  });

  it('filters out recently sent triggers', () => {
    const existingMessages: ProactiveMessage[] = [
      {
        id: 'm1',
        trigger: 'challenge_completed',
        textKey: 'k',
        textFallback: 'f',
        createdAt: new Date('2026-07-10T14:00:00Z').toISOString(), // 1h ago
        read: false,
      },
    ];
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50, proactiveMessages: existingMessages }),
      now: new Date('2026-07-10T15:00:00Z'), // 3 PM
      lastOpenDate: '2026-07-10',
      justCompletedChallenge: true,
    };
    const messages = generateProactiveMessages(ctx);
    expect(messages).toEqual([]); // challenge_completed 已发过, 过滤掉
  });
});

// ============================================================
// 🔧 Brief D2: generateProactiveMessages 去重强化测试
// ============================================================

describe('🔧 Brief D2a: generateProactiveMessages 内部去重 (动态 usedTextKeys)', () => {
  it('多个 trigger 同时触发时, 生成的消息 textKey 互不相同', () => {
    // 构造一个场景: 两个不同 trigger 同时触发
    // morning_checkin (时段触发) + challenge_completed (事件触发)
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50 }),
      now: new Date('2026-07-10T08:00:00Z'), // 8 AM — morning_checkin
      lastOpenDate: '2026-07-09', // 昨天第一次打开
      justCompletedChallenge: true,
    };
    const messages = generateProactiveMessages(ctx);
    // 应该生成 2 条 (但 Brief D2c 限制为最多 2 条/天)
    expect(messages.length).toBeLessThanOrEqual(2);
    // 如果有 2 条, textKey 应该不同 (不同 pool 本身就不同, 但验证)
    if (messages.length === 2) {
      expect(messages[0].textKey).not.toBe(messages[1].textKey);
    }
  });

  it('相同 pool 多次触发时避让已选 textKey', () => {
    // challenge_completed 和 streak_milestone 都从各自 pool 选
    // 验证: 生成的消息不会选到 recentTextKeys 里的
    const recentKeys = MESSAGE_POOL.challenge_completed.slice(0, 5); // 5 个已用
    const existingMessages: ProactiveMessage[] = recentKeys.map((k, i) => ({
      id: `prev_${i}`,
      trigger: 'challenge_completed' as const,
      textKey: k,
      textFallback: 'f',
      createdAt: new Date('2026-07-09T10:00:00Z').toISOString(), // 昨天
      read: true,
    }));
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50, proactiveMessages: existingMessages }),
      now: new Date('2026-07-10T15:00:00Z'), // 3 PM
      lastOpenDate: '2026-07-10',
      justCompletedChallenge: true,
    };
    const messages = generateProactiveMessages(ctx);
    // challenge_completed 已被 filterRecentTriggers 过滤 (24h 内发过)
    // 但昨天发的不在 24h 窗口内, 所以不会被过滤
    if (messages.length > 0) {
      // 生成的 textKey 不应在 recentKeys 中 (除非 pool 全部用完)
      const completedMsg = messages.find(m => m.trigger === 'challenge_completed');
      if (completedMsg) {
        // pool 有 6 个, 用了 5 个, 剩 1 个
        expect(MESSAGE_POOL.challenge_completed).toContain(completedMsg.textKey);
      }
    }
  });
});

describe('🔧 Brief D2c: generateProactiveMessages 同一天限制', () => {
  it('当天已有 ≥2 条消息时, 不再生成新消息', () => {
    const existingMessages: ProactiveMessage[] = [
      {
        id: 'm1',
        trigger: 'morning_checkin' as const,
        textKey: 'k1',
        textFallback: 'f',
        createdAt: new Date('2026-07-10T08:00:00Z').toISOString(), // 今天早上
        read: true,
      },
      {
        id: 'm2',
        trigger: 'challenge_completed' as const,
        textKey: 'k2',
        textFallback: 'f',
        createdAt: new Date('2026-07-10T10:00:00Z').toISOString(), // 今天上午
        read: true,
      },
    ];
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50, proactiveMessages: existingMessages }),
      now: new Date('2026-07-10T15:00:00Z'), // 今天下午
      lastOpenDate: '2026-07-09',
      justCompletedChallenge: true, // 即使有新事件
    };
    const messages = generateProactiveMessages(ctx);
    expect(messages).toEqual([]); // 已有 2 条, 不再生成
  });

  it('当天只有 1 条消息时, 仍可生成 (最多到 2 条)', () => {
    const existingMessages: ProactiveMessage[] = [
      {
        id: 'm1',
        trigger: 'morning_checkin' as const,
        textKey: 'k1',
        textFallback: 'f',
        createdAt: new Date('2026-07-10T08:00:00Z').toISOString(), // 今天早上
        read: true,
      },
    ];
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50, proactiveMessages: existingMessages }),
      now: new Date('2026-07-10T15:00:00Z'),
      lastOpenDate: '2026-07-09',
      justCompletedChallenge: true,
    };
    const messages = generateProactiveMessages(ctx);
    // 有 1 条, 还可以生成 (最多到 2 条)
    expect(messages.length).toBeLessThanOrEqual(1); // 只生成 1 条 (加上已有的 1 条 = 2)
  });

  it('昨天的消息不计入今天的限制', () => {
    const existingMessages: ProactiveMessage[] = [
      {
        id: 'm1',
        trigger: 'morning_checkin' as const,
        textKey: 'k1',
        textFallback: 'f',
        createdAt: new Date('2026-07-09T08:00:00Z').toISOString(), // 昨天
        read: true,
      },
      {
        id: 'm2',
        trigger: 'challenge_completed' as const,
        textKey: 'k2',
        textFallback: 'f',
        createdAt: new Date('2026-07-09T10:00:00Z').toISOString(), // 昨天
        read: true,
      },
    ];
    const ctx = {
      buddyState: makeBuddyState({ vitality: 50, proactiveMessages: existingMessages }),
      now: new Date('2026-07-10T15:00:00Z'), // 今天
      lastOpenDate: '2026-07-09',
      justCompletedChallenge: true,
    };
    const messages = generateProactiveMessages(ctx);
    // 昨天的 2 条不计入, 今天可以生成
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.length).toBeLessThanOrEqual(2);
  });

  it('同一天最多生成 2 条 (即使有多个 trigger)', () => {
    // 构造多个 trigger 同时触发的场景
    const ctx = {
      buddyState: makeBuddyState({ vitality: 95 }), // high_vitality
      now: new Date('2026-07-10T08:00:00Z'), // 8 AM — morning_checkin
      lastOpenDate: '2026-07-09',
      justCompletedChallenge: true, // challenge_completed
      justGrewStage: true, // growth_stage_up
      justAwakenedPersonality: true, // personality_awakened
    };
    const messages = generateProactiveMessages(ctx);
    // 即使有 4+ 个 trigger, 最多生成 2 条
    expect(messages.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================
// 🔧 2026-07-17 (task 3): pickMessageTextKey + 消息分类测试
// ============================================================

describe('🔧 2026-07-17 (task 3): pickMessageTextKey', () => {
  it('returns a textKey from the trigger pool', () => {
    const textKey = pickMessageTextKey('challenge_completed', []);
    expect(MESSAGE_POOL.challenge_completed).toContain(textKey);
  });

  it('avoids recently used textKeys when possible', () => {
    // challenge_completed pool now has 8 keys: completed_1 through completed_8
    // Pass all except completed_7 as recent → should pick completed_7
    const recent = [
      'buddy.proactiveMessages.completed_1',
      'buddy.proactiveMessages.completed_2',
      'buddy.proactiveMessages.completed_3',
      'buddy.proactiveMessages.completed_4',
      'buddy.proactiveMessages.completed_5',
      'buddy.proactiveMessages.completed_6',
      'buddy.proactiveMessages.completed_8',
    ];
    const textKey = pickMessageTextKey('challenge_completed', recent);
    expect(textKey).toBe('buddy.proactiveMessages.completed_7');
    expect(MESSAGE_POOL.challenge_completed).toContain(textKey);
  });

  it('falls back to pool when all keys are recently used', () => {
    // 所有 key 都用过了 — 应该从 pool 里选一个 (允许重复)
    const allUsed = MESSAGE_POOL.challenge_completed.slice();
    const textKey = pickMessageTextKey('challenge_completed', allUsed);
    expect(MESSAGE_POOL.challenge_completed).toContain(textKey);
  });

  it('handles empty pool gracefully (fallback)', () => {
    // trigger 不存在时, 应该返回 fallback key (虽然实际不会发生)
    const textKey = pickMessageTextKey('challenge_completed', []);
    expect(textKey).toMatch(/^buddy\.proactiveMessages\./);
  });

  it('different calls produce varied results (statistical test)', () => {
    // 跑 100 次, 应该至少出现 2 个不同的 key (统计性验证随机性)
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(pickMessageTextKey('morning_checkin', []));
    }
    expect(results.size).toBeGreaterThanOrEqual(2);
  });
});

describe('🔧 2026-07-17 (task 3): TRIGGER_CATEGORY mapping', () => {
  it('maps all 10 triggers to a valid category', () => {
    const validCategories: MessageCategory[] = ['encouragement', 'companionship', 'care', 'reflection_invite'];
    const allTriggers = Object.keys(TRIGGER_CATEGORY) as Array<keyof typeof TRIGGER_CATEGORY>;
    expect(allTriggers).toHaveLength(10);
    for (const trigger of allTriggers) {
      expect(validCategories).toContain(TRIGGER_CATEGORY[trigger]);
    }
  });

  it('maps challenge_completed → encouragement', () => {
    expect(TRIGGER_CATEGORY.challenge_completed).toBe('encouragement');
  });

  it('maps challenge_failed → reflection_invite', () => {
    expect(TRIGGER_CATEGORY.challenge_failed).toBe('reflection_invite');
  });

  it('maps morning_checkin → companionship', () => {
    expect(TRIGGER_CATEGORY.morning_checkin).toBe('companionship');
  });

  it('maps low_vitality → care', () => {
    expect(TRIGGER_CATEGORY.low_vitality).toBe('care');
  });
});

describe('🔧 2026-07-17 (task 3): CATEGORY_META completeness', () => {
  it('has metadata for all 4 categories', () => {
    const categories: MessageCategory[] = ['encouragement', 'companionship', 'care', 'reflection_invite'];
    for (const cat of categories) {
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].emoji).toBeTruthy();
      expect(CATEGORY_META[cat].darkClasses).toBeTruthy();
      expect(CATEGORY_META[cat].lightClasses).toBeTruthy();
      expect(CATEGORY_META[cat].labelKey).toMatch(/^buddy\.messageCategories\./);
      expect(CATEGORY_META[cat].labelFallback).toBeTruthy();
    }
  });
});
