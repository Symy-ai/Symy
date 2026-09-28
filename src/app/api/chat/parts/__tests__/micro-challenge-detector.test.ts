import { describe, expect, it } from 'vitest';

import {
  detectMicroChallenge,
  hasPurchaseIntent,
  microChallengeSseEvent,
  MICRO_CHALLENGE_COOLDOWN_MS,
  resolveCategory,
} from '../micro-challenge-detector';

const NOW = 1_700_000_000_000;

describe('hasPurchaseIntent (购买意图词门)', () => {
  it('命中: zh 购买意图', () => {
    expect(hasPurchaseIntent('好想买件新外套')).toBe(true);
    expect(hasPurchaseIntent('准备下单那个蓝牙耳机')).toBe(true);
  });

  it('命中: en 购买意图 (词边界)', () => {
    expect(hasPurchaseIntent('I want to buy a new jacket')).toBe(true);
    expect(hasPurchaseIntent('thinking of purchasing a laptop')).toBe(true);
  });

  it('不命中: 闲聊 / 无意图 / 空', () => {
    expect(hasPurchaseIntent('今天天气不错，出去走走')).toBe(false);
    expect(hasPurchaseIntent('my friend is a buyer')).toBe(false);
    expect(hasPurchaseIntent('')).toBe(false);
  });
});

describe('detectMicroChallenge (纯函数预检)', () => {
  it('触发: 购买意图 + 品类命中 → 24h 提案', () => {
    const proposal = detectMicroChallenge({ userContent: '想买件新外套', now: NOW });
    expect(proposal).toEqual({
      category: 'clothing',
      titleKey: 'chat.microChallenge.body.clothing',
      durationHours: 24,
    });
  });

  it('触发: en 消息同样命中', () => {
    const proposal = detectMicroChallenge({ userContent: 'should I buy a new laptop?', now: NOW });
    expect(proposal?.category).toBe('electronics');
  });

  it('频控: 同品类 7 天内已发起 → 不再发起', () => {
    const history = [{ category: 'clothing' as const, initiatedAt: NOW - MICRO_CHALLENGE_COOLDOWN_MS + 60_000 }];
    expect(detectMicroChallenge({ userContent: '想买条新裙子', now: NOW, recentMicroChallenges: history })).toBeNull();
  });

  it('频控: 满 7 天后可再发起; 其它品类不受影响', () => {
    const expired = [{ category: 'clothing' as const, initiatedAt: NOW - MICRO_CHALLENGE_COOLDOWN_MS }];
    expect(detectMicroChallenge({ userContent: '想买件新卫衣', now: NOW, recentMicroChallenges: expired })?.category).toBe('clothing');
    const otherCategory = [{ category: 'clothing' as const, initiatedAt: NOW }];
    expect(detectMicroChallenge({ userContent: '想买个新耳机', now: NOW, recentMicroChallenges: otherCategory })?.category).toBe('electronics');
  });

  it('无意图: 闲聊零触发 (即使含品类词)', () => {
    expect(detectMicroChallenge({ userContent: '我的外套真好看', now: NOW })).toBeNull();
  });

  it('无品类: 有购买意图但品类不可识别 → 不发起', () => {
    expect(detectMicroChallenge({ userContent: '我想买那个东西', now: NOW })).toBeNull();
  });
});

describe('microChallengeSseEvent (SSE 事件组装)', () => {
  it('type 为 micro_challenge 且携带提案', () => {
    const proposal = detectMicroChallenge({ userContent: '想买支新口红', now: NOW });
    expect(proposal).not.toBeNull();
    const event = microChallengeSseEvent(proposal!);
    expect(event.type).toBe('micro_challenge');
    expect(event.microChallenge).toBe(proposal);
  });
});

// 🎯 Wave 1 首条点亮回归 (doc/jev-wave1-first-light-plan §4): resolveCategory 四断言
describe('resolveCategory (Wave 1 首条点亮 gate 供给)', () => {
  it('gate 合法档覆盖原生归一 (gate 优先)', () => {
    // 词表原生会把"耳机"归 electronics; gate 给 clothing → 用 clothing
    expect(resolveCategory('我想买耳机', 'clothing')).toBe('clothing');
  });

  it('gate 非法档回退词表原生归一', () => {
    // 'banana' 不在五档, 字面直通与归一都落不到 → 回退原生 (electronics)
    expect(resolveCategory('我想买耳机', 'banana' as never)).toBe('electronics');
  });

  it('gate undefined 走原生归一 (行为与点亮前逐字节一致)', () => {
    expect(resolveCategory('我想买耳机')).toBe('electronics');
    expect(resolveCategory('随便聊聊')).toBeNull();
  });

  it('gate 档 + 无原生命中时 gate 仍可发起 (语义供给价值)', () => {
    // "帮我挑个礼物" 词表不命中(default); gate 判 beauty → 发 beauty 卡
    expect(resolveCategory('帮我挑个礼物', 'beauty')).toBe('beauty');
    expect(resolveCategory('帮我挑个礼物')).toBeNull();
  });
});
