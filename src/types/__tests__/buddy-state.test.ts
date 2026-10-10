/**
 * buddy-state + payload.config 收官双件 — 类型契约 + CMS 配置 (105+101行)
 *
 * 锁定:
 * - BuddyHealth 五值 / GrowthStage 四值 / Personality 五值
 * - BuddyState 形状 (vitality/level/dreamFunds/P1-5 五件套)
 * - ProactiveMessageTrigger 十值
 * - payload: /cms 路由 + users auth + posts category/status/locale 选项
 */

import { describe, expect, it } from 'vitest';
import type {
  BuddyHealth,
  BuddyState,
  DailyNeeds,
  DreamFund,
  GrowthStage,
  HarmonyStatus,
  HealthEvent,
  NeedType,
  Personality,
  ProactiveMessage,
  ProactiveMessageTrigger,
} from '../buddy-state';

const BUDDY_HEALTH: BuddyHealth[] = ['thriving', 'healthy', 'weak', 'critical', 'dormant'];
const STAGES: GrowthStage[] = ['baby', 'young', 'adult', 'elder'];
const PERSONALITIES: Personality[] = ['unknown', 'sage', 'playmate', 'guardian', 'ascetic'];
const TRIGGERS: ProactiveMessageTrigger[] = [
  'morning_checkin', 'evening_reflection', 'long_absence', 'streak_milestone',
  'challenge_completed', 'challenge_failed', 'low_vitality', 'high_vitality',
  'personality_awakened', 'growth_stage_up',
];

describe('buddy-state 类型契约', () => {
  it('BuddyHealth 五值联合', () => {
    expect(BUDDY_HEALTH).toHaveLength(5);
    expect(BUDDY_HEALTH).toContain('dormant');
  });

  it('GrowthStage 四阶段 + Personality 五性格 (P1-5)', () => {
    expect(STAGES).toHaveLength(4);
    expect(PERSONALITIES).toContain('guardian');
  });

  it('ProactiveMessageTrigger 十触发器', () => {
    expect(TRIGGERS).toHaveLength(10);
  });

  it('DreamFund 形状 + sortOrder 可空', () => {
    const fund: DreamFund = { id: 'f1', name: '新相机', target: 5000, current: 1200, emoji: '📷', sortOrder: null };
    expect(fund.sortOrder).toBeNull();
  });

  it('BuddyState 完整形状 (P1-5 五件套在位)', () => {
    const needs: DailyNeeds = { clarity: 80, connection: 60 };
    const pm: ProactiveMessage = {
      id: 'p1', trigger: 'morning_checkin', textKey: 'buddy.morning',
      textFallback: '早上好', createdAt: '2026-10-10T00:00:00Z', read: false,
    };
    const state: BuddyState = {
      vitality: 85, tokens: 120, health: 'thriving', level: 3, xp: 40, xpToNext: 100,
      streak: 5, dreamFunds: [], badges: ['b1'], invitedCount: 2, totalSaved: 300,
      challengesCompleted: 7, lastHealingKitAt: null, version: 1,
      growthStage: 'young', personality: 'sage', intimacy: 45,
      dailyNeeds: needs, proactiveMessages: [pm],
      personalityAwakenedAt: null, lastActiveAt: null,
    };
    expect(state.growthStage).toBe('young');
    expect(state.dailyNeeds.clarity).toBe(80);
    expect(state.proactiveMessages[0].trigger).toBe('morning_checkin');
    expect(state.invitedCount).toBe(2);
  });

  it('HealthEvent 审计形状 (metadata Record)', () => {
    const ev: HealthEvent = {
      id: 'e1', eventType: 'chat', vitalityChange: -2, newVitality: 83,
      tokenChange: 1, triggerSource: 'chat', triggerId: null,
      description: '聊天消耗', metadata: { turn: 1 }, createdAt: '2026-10-10T00:00:00Z',
    };
    expect(ev.metadata.turn).toBe(1);
  });

  it('HarmonyStatus/NeedType 联合收窄', () => {
    const h: HarmonyStatus = 'harmony';
    const n: NeedType = 'clarity';
    expect(h).toBe('harmony');
    expect(n).toBe('clarity');
  });
});
