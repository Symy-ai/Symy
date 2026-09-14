/**
 * Unit tests for demo-reply.ts — 🐘 人设转型版 (2026-09-05)
 *
 * 镜子风格 demo 回复已废弃 → 绿色环保小象 (话术 SSOT: src/lib/elephant-tone.ts)。
 * 签名变更: t: (key) => string → locale: string。
 *
 * 测试覆盖:
 * 1. isChallengeFirstTriggerMessage — 系统模板检测 (不变)
 * 2. getDemoChallengeReply 第一次挑战触发 — 小象呈现 item + price + hours
 * 3. getDemoChallengeReply 后续消息 — 不复读 + 承认情绪 + 引导注册
 * 4. 关键词路径 (saw_it / bought / BNPL) — 双语可用, 无中英混排
 * 5. isDemoSawItReply — 庆祝动画触发检测 (双语)
 * 6. getDemoReply 关键词路由 (regression)
 */

import { describe, it, expect } from 'vitest';
import {
  getDemoReply,
  getDemoChallengeReply,
  isChallengeFirstTriggerMessage,
  isDemoSawItReply,
} from '../demo-reply';

const EN = 'en';
const ZH = 'zh';

/** zh 回复不应混入英文单词 (金额/物品名等插值除外) */
function assertNoMixedLanguageInZh(reply: string, allowedLatin: string[] = []) {
  const stripped = reply
    .replace(new RegExp(allowedLatin.map(escapeRe).join('|'), 'g'), allowedLatin.length ? ' ' : '')
    .replace(/\$[\d,.]+/g, '')
    .replace(/[\d,.]/g, '')
    .replace(/[\p{Emoji_Presentation}\uFE0F]/gu, '');
  expect(/[A-Za-z]/.test(stripped), `zh 回复混入英文: "${reply}"`).toBe(false);
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('demo-reply — isChallengeFirstTriggerMessage (不变)', () => {
  it('识别英文系统模板 "I\'m moved by X · $Y · Let me see it"', () => {
    expect(isChallengeFirstTriggerMessage("I'm moved by iPhone 17 Pro · $1099.00 · Let me see it")).toBe(true);
  });

  it('识别英文 fallback 模板 "I want to buy X for $Y. Challenge me!"', () => {
    expect(isChallengeFirstTriggerMessage('I want to buy iPhone 17 Pro for $1099.00. Challenge me!')).toBe(true);
  });

  it('识别中文系统模板与 fallback 模板', () => {
    expect(isChallengeFirstTriggerMessage('我被 iPhone 17 Pro · $1099.00 · 让我看见')).toBe(true);
    expect(isChallengeFirstTriggerMessage('我想买 iPhone 17 Pro，要 $1099.00。让我看见！')).toBe(true);
  });

  it('识别 resume 路径', () => {
    expect(isChallengeFirstTriggerMessage("I'm back — let's continue the iPhone challenge.")).toBe(true);
    expect(isChallengeFirstTriggerMessage('我回来了，继续挑战')).toBe(true);
  });

  it('不识别用户后续消息', () => {
    expect(isChallengeFirstTriggerMessage('But I really want it, my friends all have it')).toBe(false);
    expect(isChallengeFirstTriggerMessage('Why is it so expensive?')).toBe(false);
    expect(isChallengeFirstTriggerMessage('我朋友都有这个')).toBe(false);
    expect(isChallengeFirstTriggerMessage('')).toBe(false);
    expect(isChallengeFirstTriggerMessage('   ')).toBe(false);
  });

  it('"I want to buy" 但无 "Challenge me!" 不识别为第一次触发', () => {
    expect(isChallengeFirstTriggerMessage('I want to buy it')).toBe(false);
  });

  it('大小写不敏感 + 前后空格不影响', () => {
    expect(isChallengeFirstTriggerMessage("I'M MOVED BY iPhone")).toBe(true);
    expect(isChallengeFirstTriggerMessage("  I'm moved by iPhone  ")).toBe(true);
  });
});

describe('demo-reply — 🐘 第一次挑战触发 (小象呈现 item + price + hours)', () => {
  const challengeContext = { itemName: 'iPhone 17 Pro', amount: 1099 };

  it('英文: 包含 item + 金额 + hours, 有小象温度 (不冷判决)', () => {
    const reply = getDemoChallengeReply(
      "I'm moved by iPhone 17 Pro · $1099.00 · Let me see it",
      challengeContext,
      EN,
      false,
    );
    expect(reply).toContain('iPhone 17 Pro');
    expect(reply).toContain('$1099.00');
    expect(reply).toMatch(/55\.0 hours|hours/);
    // 不再是镜子冷判决
    expect(reply).not.toContain('You already know if you need it');
  });

  it('中文: 双语可用, 插值后无残留占位符, 无英文混排 (物品名除外)', () => {
    const reply = getDemoChallengeReply(
      '我被 iPhone 17 Pro · $1099.00 · 让我看见',
      challengeContext,
      ZH,
      false,
    );
    expect(reply).toContain('iPhone 17 Pro');
    expect(reply).toContain('$1099.00');
    expect(reply).not.toMatch(/\{\w+\}/);
    assertNoMixedLanguageInZh(reply, ['iPhone 17 Pro']);
  });

  it('不传 isFollowUp (默认 false) 走第一次触发路径', () => {
    const reply = getDemoChallengeReply(
      "I'm moved by iPhone 17 Pro · $1099.00 · Let me see it",
      challengeContext,
      EN,
    );
    expect(reply).toContain('iPhone 17 Pro');
    expect(reply).toContain('$1099.00');
  });
});

describe('demo-reply — 🐘 后续消息不复读 (承认情绪 + 引导注册)', () => {
  const challengeContext = { itemName: 'iPhone 17 Pro', amount: 1099 };

  it('后续消息不复读 "item + price + hours"', () => {
    const reply = getDemoChallengeReply('But I really want it, my friends all have it', challengeContext, EN, true);
    expect(reply).not.toContain('iPhone 17 Pro. $1099.00');
    expect(reply).not.toContain('You already know if you need it');
    expect(reply.trim().length).toBeGreaterThan(0);
  });

  it('同侪压力 → followup_friends 场景 (提到朋友/广告/比较)', () => {
    const reply = getDemoChallengeReply('But my friends all have it', challengeContext, EN, true);
    expect(/friend|ad|algorithm|comparison|they/i.test(reply)).toBe(true);
  });

  it('中文同侪压力 → 中文回复', () => {
    const reply = getDemoChallengeReply('我朋友都有这个', challengeContext, ZH, true);
    assertNoMixedLanguageInZh(reply);
  });

  it('"want" 关键词 → followup_want 场景 (中文)', () => {
    const reply = getDemoChallengeReply('我真的想要', challengeContext, ZH, true);
    assertNoMixedLanguageInZh(reply);
    expect(/想要/.test(reply)).toBe(true);
  });

  it('"need" 关键词 → followup_need 场景 (提到聪明/环保地满足需要)', () => {
    const reply = getDemoChallengeReply('But I need it for work', challengeContext, EN, true);
    expect(/need|smart|green|well|honest/i.test(reply)).toBe(true);
  });

  it('无匹配关键词 → 默认 followup', () => {
    const reply = getDemoChallengeReply('Hmm, let me think about it', challengeContext, EN, true);
    expect(reply.trim().length).toBeGreaterThan(0);
  });
});

describe('demo-reply — 🐘 关键词路径不受 isFollowUp 影响', () => {
  const challengeContext = { itemName: 'iPhone 17 Pro', amount: 1099 };

  it('saw_it 关键词: 庆祝留住 (双语)', () => {
    const en = getDemoChallengeReply('✓ Saw it', challengeContext, EN, true);
    expect(en).toContain('$1099.00');
    expect(en).toMatch(/stays/);

    const zh = getDemoChallengeReply('✓ 看见了', challengeContext, ZH, true);
    expect(zh).toContain('$1099.00');
    expect(zh).toMatch(/留住/);
    assertNoMixedLanguageInZh(zh, ['iPhone']);
  });

  it('chose_to_buy 关键词: 不评判 (零内疚) — 不再出现 "You\'re free" 冷判决', () => {
    const en = getDemoChallengeReply('✗ Chose to buy', challengeContext, EN, true);
    expect(en).not.toContain("You're free");
    expect(/your call|with you|next time|no judgment|knowing/i.test(en)).toBe(true);

    const zh = getDemoChallengeReply('选择买', challengeContext, ZH, true);
    assertNoMixedLanguageInZh(zh, ['iPhone']);
  });

  it('resist / save / 不买 关键词 → 庆祝路径', () => {
    expect(getDemoChallengeReply('I will resist', challengeContext, EN, true)).toMatch(/stays/);
    expect(getDemoChallengeReply('I will save the money', challengeContext, EN, true)).toMatch(/stays/);
    expect(getDemoChallengeReply('我决定不买了', challengeContext, ZH, true)).toMatch(/留住/);
  });

  it('bought 关键词 → bought_anyway 路径', () => {
    expect(getDemoChallengeReply('I bought it anyway', challengeContext, EN, true)).toBeTruthy();
    expect(getDemoChallengeReply('我买了', challengeContext, ZH, true)).toBeTruthy();
  });

  it('已知行为: "I want to buy it" 匹配 buy 路径 (非 P0-5 范围)', () => {
    const reply = getDemoChallengeReply('I want to buy it', challengeContext, EN, true);
    expect(reply.trim().length).toBeGreaterThan(0);
  });
});

describe('demo-reply — 🐘 BNPL 检测优先于 isFollowUp', () => {
  const challengeContext = { itemName: 'Dyson vacuum', amount: 499 };

  it('BNPL 关键词: item + price + hours + BNPL 提醒 (双语)', () => {
    const en = getDemoChallengeReply('4 interest-free payments with Klarna', challengeContext, EN, true);
    expect(en).toContain('Dyson vacuum');
    expect(en).toContain('$499.00');
    expect(en).toMatch(/hours/);
    expect(en).toMatch(/Buy Now Pay Later|payments|Split/i);

    const zh = getDemoChallengeReply('用 Klarna 分 4 期', challengeContext, ZH, true);
    expect(zh).toMatch(/分\s*4\s*期|分期|先享后付/);
  });
});

describe('demo-reply — getDemoReply (非挑战模式) 回归测试', () => {
  it('default 回复 (无关键词匹配)', () => {
    const reply = getDemoReply('hello world', EN);
    expect(reply.trim().length).toBeGreaterThan(0);
  });

  it('impulse 回复 (buy 关键词) — 不评判', () => {
    const reply = getDemoReply('I bought something', EN);
    expect(reply.trim().length).toBeGreaterThan(0);
    expect(reply).not.toMatch(/\{\w+\}/);
  });

  it('resist 回复 (优先于 buy)', () => {
    const reply = getDemoReply("I didn't buy it", EN);
    expect(reply).toMatch(/stays|Resisted|winning streak|planet/i);
  });

  it('refund / pattern / BNPL 路由', () => {
    expect(getDemoReply('I got a refund', EN)).toMatch(/Return|return|Back|Refund/i);
    expect(getDemoReply('my spending habit is bad', EN)).toMatch(/trigger|pattern|algorithm|nudge/i);
    expect(getDemoReply('pay in 4 with Klarna', EN)).toMatch(/Buy Now Pay Later|payments|Split/i);
  });

  it('中文回复无英文混排', () => {
    assertNoMixedLanguageInZh(getDemoReply('你好呀', ZH));
    assertNoMixedLanguageInZh(getDemoReply('我没忍住买了', ZH));
    assertNoMixedLanguageInZh(getDemoReply('我忍住了没买', ZH));
    assertNoMixedLanguageInZh(getDemoReply('我退货了', ZH));
    assertNoMixedLanguageInZh(getDemoReply('我的消费习惯不好', ZH));
    assertNoMixedLanguageInZh(getDemoReply('用先享后付买的', ZH));
  });
});

describe('demo-reply — isDemoSawItReply (庆祝动画检测, 双语)', () => {
  const challengeContext = { itemName: 'iPhone 17 Pro', amount: 1099 };

  it('saw_it 回复 → true (中英都命中)', () => {
    const en = getDemoChallengeReply('✓ Saw it', challengeContext, EN, true);
    const zh = getDemoChallengeReply('✓ 看见了', challengeContext, ZH, true);
    expect(isDemoSawItReply(en, 1099)).toBe(true);
    expect(isDemoSawItReply(zh, 1099)).toBe(true);
  });

  it('第一次挑战回复 / 买入回复 / 无关文本 → false (不误触发庆祝)', () => {
    const first = getDemoChallengeReply(
      "I'm moved by iPhone 17 Pro · $1099.00 · Let me see it",
      challengeContext,
      EN,
      false,
    );
    expect(isDemoSawItReply(first, 1099)).toBe(false);

    const bought = getDemoChallengeReply('✗ Chose to buy', challengeContext, EN, true);
    expect(isDemoSawItReply(bought, 1099)).toBe(false);

    expect(isDemoSawItReply('random text', 1099)).toBe(false);
  });
});
