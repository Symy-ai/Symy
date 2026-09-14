/**
 * shopping-context-intent 测试 — 弱信号检测层 (batch61-b)
 *
 * 覆盖: SSOT 词表形状 (三类信号 × 直说/含蓄档齐全, 展示词零数字, id 唯一);
 * 检测 mechanics (置信档位/阈值/展示词降序/同档 tie-break); 让路红线 (高风险
 * 语义/数据问句/问人/拒绝/否定/明确购物意图/BNPL/绿色品类); 会话纠正
 * (dismissedEntryIds 排除, 一次纠正不再命中); 双语 mood 标签 (60-c 同枚举)。
 * 正负例语料与三路路由在 parts/__tests__/context-signal-turn.test.ts 锁。
 */

import { describe, expect, it } from 'vitest';
import {
  CONTEXT_SIGNAL_TRIGGER_THRESHOLD,
  CONTEXT_SIGNAL_MAX_WORDS,
  detectShoppingContextIntent,
} from '../shopping-context-intent';
import { SHOPPING_CONTEXT_SIGNALS } from '../shopping-context-signals';
import type { ShoppingContextSignalType } from '@/types/context-signal';
import { EMOTION_MOODS } from '@/types/emotion-guard';

const ALL_SIGNALS: ShoppingContextSignalType[] = ['emotion_reward', 'scarcity_promo', 'wear_replace'];

describe('SSOT 词表形状 (shopping-context-signals)', () => {
  it('三类信号都有词条, 且各覆盖直说 (direct) 与含蓄 (implicit) 表达', () => {
    for (const signal of ALL_SIGNALS) {
      const entries = SHOPPING_CONTEXT_SIGNALS.filter((e) => e.signal === signal);
      expect(entries.length, signal).toBeGreaterThanOrEqual(5);
      expect(entries.some((e) => e.tier === 'direct'), `${signal} direct`).toBe(true);
      expect(entries.some((e) => e.tier === 'implicit'), `${signal} implicit`).toBe(true);
    }
  });

  it('weak 档词条存在 — "疑似"表达可被识别但置信度低于触发线', () => {
    const weak = SHOPPING_CONTEXT_SIGNALS.filter((e) => e.tier === 'weak');
    expect(weak.length).toBeGreaterThanOrEqual(3);
    expect(new Set(weak.map((e) => e.signal)).size).toBeGreaterThanOrEqual(2);
  });

  it('展示词零阿拉伯数字 (卡面红线: 数字只在既有 private 数据卡)', () => {
    for (const entry of SHOPPING_CONTEXT_SIGNALS) {
      expect(entry.wordZh).not.toMatch(/\d/);
      expect(entry.wordEn).not.toMatch(/\d/);
    }
  });

  it('词条 id 唯一且带信号前缀 (会话纠正上行以 id 为键)', () => {
    const ids = SHOPPING_CONTEXT_SIGNALS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(['emotion_reward.', 'scarcity_promo.', 'wear_replace.'].some((p) => id.startsWith(p))).toBe(true);
    }
  });

  it('mood 只出现在 emotion_reward 词条, 且都是 60-c 稳定 mood 枚举', () => {
    for (const entry of SHOPPING_CONTEXT_SIGNALS) {
      if (entry.mood) {
        expect(entry.signal).toBe('emotion_reward');
        expect(EMOTION_MOODS).toContain(entry.mood);
      }
    }
  });
});

describe('detectShoppingContextIntent — 识别 mechanics', () => {
  it('直说命中: direct 档 0.9, 过触发线', () => {
    const hit = detectShoppingContextIntent('想奖励自己一下');
    expect(hit).not.toBeNull();
    expect(hit!.signal).toBe('emotion_reward');
    expect(hit!.confidence).toBe(0.9);
    expect(hit!.confidence).toBeGreaterThanOrEqual(CONTEXT_SIGNAL_TRIGGER_THRESHOLD);
    expect(hit!.mood).toBe('celebratory');
    expect(hit!.entries[0].id).toBe('emotion_reward.treat_self');
  });

  it('含蓄命中: implicit 档 0.68, 过触发线', () => {
    const hit = detectShoppingContextIntent('最近想对自己好一点');
    expect(hit!.signal).toBe('emotion_reward');
    expect(hit!.confidence).toBe(0.68);
    expect(hit!.confidence).toBeGreaterThanOrEqual(CONTEXT_SIGNAL_TRIGGER_THRESHOLD);
  });

  it('weak 档: 可识别但置信度低于触发线 (调用方放行回既有 chat 流程)', () => {
    const hit = detectShoppingContextIntent('出去走走换换心情');
    expect(hit).not.toBeNull();
    expect(hit!.signal).toBe('emotion_reward');
    expect(hit!.confidence).toBeLessThan(CONTEXT_SIGNAL_TRIGGER_THRESHOLD);
  });

  it('多词条命中: 展示词按置信降序、封顶 MAX_WORDS, 同档按词表顺序', () => {
    const hit = detectShoppingContextIntent('直播间说最后三单了');
    expect(hit!.signal).toBe('scarcity_promo');
    expect(hit!.entries.length).toBe(2);
    expect(hit!.entries[0].id).toBe('scarcity_promo.last_units');
    expect(hit!.entries[1].id).toBe('scarcity_promo.livestream_push');
    expect(hit!.entries.length).toBeLessThanOrEqual(CONTEXT_SIGNAL_MAX_WORDS);
  });

  it('en 直说命中 (词边界不误伤心事表达)', () => {
    expect(detectShoppingContextIntent('I want to treat myself today')!.signal).toBe('emotion_reward');
    // heartbroken 不带 \b 前界, 不得命中 wear 的 broken
    expect(detectShoppingContextIntent('I feel heartbroken today, just tired')).toBeNull();
  });

  it('非字符串/空输入恒 null (纯函数契约)', () => {
    expect(detectShoppingContextIntent(undefined as unknown as string)).toBeNull();
    expect(detectShoppingContextIntent('   ')).toBeNull();
  });
});

describe('detectShoppingContextIntent — 让路红线 (不吞既有链路的消息)', () => {
  it('高风险语义最先排除 (不做心理评估, 降级通用聊天)', () => {
    expect(detectShoppingContextIntent('最近有点抑郁，想花钱')).toBeNull();
    expect(detectShoppingContextIntent('so depressed, I want to treat myself')).toBeNull();
  });

  it('完整数据问句让路 (57-c/58-c/59-c 的地盘)', () => {
    expect(detectShoppingContextIntent('这个月奖励自己花了多少?')).toBeNull();
    expect(detectShoppingContextIntent('how much did I spend treating myself?')).toBeNull();
  });

  it('问别人求建议不触发 (决策主体不在小象)', () => {
    expect(detectShoppingContextIntent('大家觉得我该不该买')).toBeNull();
    expect(detectShoppingContextIntent('should I ask my friends about this deal?')).toBeNull();
  });

  it('明确拒绝守护的会话不触发', () => {
    expect(detectShoppingContextIntent('别管我了，最后三单我也认了')).toBeNull();
    expect(detectShoppingContextIntent('stop reminding me, it is a flash sale')).toBeNull();
  });

  it('否定形态不触发 (用户已经在说不买不花)', () => {
    expect(detectShoppingContextIntent('这件先不买了，虽然有点心动')).toBeNull();
    expect(detectShoppingContextIntent('这个月不想花钱')).toBeNull();
    expect(detectShoppingContextIntent("I'm not buying anything today")).toBeNull();
  });

  it('明确购物意图让路 (归 loadLettaTurnContext 的 BNPL/green/reuse/micro 预检)', () => {
    expect(detectShoppingContextIntent('想买台新相机奖励自己')).toBeNull();
    expect(detectShoppingContextIntent('最后三单，赶紧下单')).toBeNull();
    expect(detectShoppingContextIntent('I want to buy it as a treat')).toBeNull();
  });

  it('BNPL 支付风险让路 (zh 词表 + en 复用 detectBNPL)', () => {
    expect(detectShoppingContextIntent('花呗分期犒劳一下自己')).toBeNull();
    expect(detectShoppingContextIntent('treat myself, pay in 4')).toBeNull();
  });

  it('绿色品类让路 (点名具体品类时既有绿色替代流继续负责)', () => {
    // 耳机/earbuds 在 green-alternatives 词表内 — 快坏了也交绿色流, 弱信号层不吞
    expect(detectShoppingContextIntent('耳机快坏了', { locale: 'zh' })).toBeNull();
    expect(detectShoppingContextIntent('my earbuds stopped working', { locale: 'en' })).toBeNull();
    // greenPref off: detector 不做绿色让路 (route 层另有整体静默闸, 双保险)
    expect(
      detectShoppingContextIntent('耳机快坏了', { locale: 'zh', greenPref: 'off' }),
    ).not.toBeNull();
  });
});

describe('detectShoppingContextIntent — 会话纠正 (一次纠正, 本会话不再重复同信号)', () => {
  it('dismissedEntryIds 里的词条不再参与匹配', () => {
    const content = '想奖励自己一下';
    expect(detectShoppingContextIntent(content)).not.toBeNull();
    expect(
      detectShoppingContextIntent(content, { dismissedEntryIds: ['emotion_reward.treat_self'] }),
    ).toBeNull();
  });

  it('只排除被纠正的词条, 同信号其他表达仍然可识别', () => {
    const dismissed = detectShoppingContextIntent('想奖励自己一下', {
      dismissedEntryIds: ['emotion_reward.treat_self'],
    });
    expect(dismissed).toBeNull();

    const other = detectShoppingContextIntent('想好好哄哄自己', {
      dismissedEntryIds: ['emotion_reward.treat_self'],
    });
    expect(other).not.toBeNull();
    expect(other!.signal).toBe('emotion_reward');
  });

  it('全部词条被纠正后同义消息不再触发 (交还既有流程)', () => {
    const allIds = SHOPPING_CONTEXT_SIGNALS.map((e) => e.id);
    expect(detectShoppingContextIntent('想奖励自己哄哄自己', { dismissedEntryIds: allIds })).toBeNull();
  });
});
