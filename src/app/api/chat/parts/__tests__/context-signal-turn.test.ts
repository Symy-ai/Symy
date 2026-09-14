/**
 * context-signal-turn 测试 — 弱信号路由轮 + 正负例语料 + 链序锁 (batch61-b)
 *
 * 覆盖: 三类信号各自的语义路由 (情绪→60-c 情绪卡 / 促销→48-b 冷静卡 /
 * 耗损→50-a 三问卡 + 绿色替代卡); zh/en 各 ≥30 条正例、≥20 条负例 (词表
 * SSOT 的验收语料, 断言完整 turn 链路); 低置信不触发; SSE 事件序
 * (context_signal 最前 → 路由卡 → tokens → done); payload 零金额零碳数值;
 * 会话纠正透传; route.ts source-order — 弱信号块在 60-c 情绪守护之后、
 * loadLettaTurnContext (通用购买预检) 之前。
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildContextSignalSseStream,
  buildContextSignalTurn,
  contextSignalSseEvent,
} from '../context-signal-turn';
import { detectShoppingContextIntent } from '@/lib/shopping-context-intent';
import { ELEPHANT_SCENES } from '@/lib/elephant-tone';
import type { ShoppingContextSignalType } from '@/types/context-signal';

async function readStream(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

// ============================================================
// 验收正例语料 — zh/en 各 ≥30 条 (三类信号, 直说+含蓄), 全部必须触发
// ============================================================

const POSITIVE_ZH: Array<[string, ShoppingContextSignalType]> = [
  // 情绪奖励型 (直说)
  ['想奖励自己一下', 'emotion_reward'],
  ['发年终了，得犒劳一下自己', 'emotion_reward'],
  ['这个月太辛苦，要犒劳一下', 'emotion_reward'],
  ['想好好哄哄自己', 'emotion_reward'],
  ['就想哄自己开心一下', 'emotion_reward'],
  ['被工作虐了一周，想补偿一下自己', 'emotion_reward'],
  ['周末来做点购物疗愈吧', 'emotion_reward'],
  // 情绪奖励型 (含蓄)
  ['最近想对自己好一点', 'emotion_reward'],
  ['手痒，想花点钱', 'emotion_reward'],
  ['我值得拥有更好的', 'emotion_reward'],
  ['周末想小小奢侈一下', 'emotion_reward'],
  ['就是想放纵一下', 'emotion_reward'],
  // 稀缺促销型 (直说)
  ['直播间说最后三单了', 'scarcity_promo'],
  ['这个优惠最后一天', 'scarcity_promo'],
  ['秒杀价就这一晚', 'scarcity_promo'],
  ['库存告急，手慢无', 'scarcity_promo'],
  ['主播喊大家上链接', 'scarcity_promo'],
  ['再不买就没了', 'scarcity_promo'],
  ['错过等一年啊', 'scarcity_promo'],
  ['过时不候，先到先得', 'scarcity_promo'],
  ['差一点就买完了', 'scarcity_promo'],
  // 稀缺促销型 (含蓄)
  ['优惠券快过期了，得用掉', 'scarcity_promo'],
  ['双十一想囤点好东西', 'scarcity_promo'],
  ['免邮门槛还差一点，凑单', 'scarcity_promo'],
  // 耗损替换型 (直说)
  ['家里那台挂烫机快坏了', 'wear_replace'],
  ['吹风机摔坏了', 'wear_replace'],
  ['炖锅坏掉了，饭都做不了', 'wear_replace'],
  ['老式电风扇开不了机了', 'wear_replace'],
  ['拖鞋穿破了', 'wear_replace'],
  ['毛衣起球了', 'wear_replace'],
  ['洗面奶见底了', 'wear_replace'],
  ['防晒喷雾用完了', 'wear_replace'],
  ['剃须刀坏掉了，胡须都剃不了', 'wear_replace'],
  ['用了五年，该换了', 'wear_replace'],
  // 耗损替换型 (含蓄)
  ['风扇又坏了，这个夏天第二回了', 'wear_replace'],
  ['旧电脑越来越卡了', 'wear_replace'],
];

const POSITIVE_EN: Array<[string, ShoppingContextSignalType]> = [
  // emotion reward (direct)
  ['I want to treat myself today', 'emotion_reward'],
  ['time to reward myself a little', 'emotion_reward'],
  ['maybe some retail therapy would help', 'emotion_reward'],
  // emotion reward (implicit)
  ['I deserve a little something', 'emotion_reward'],
  ['need a little pick-me-up', 'emotion_reward'],
  ['I want to do something nice for myself', 'emotion_reward'],
  ['so itching to spend tonight', 'emotion_reward'],
  ['I feel like spending a bit', 'emotion_reward'],
  ['a little splurge won\'t hurt', 'emotion_reward'],
  ['I\'ll make it up to myself somehow', 'emotion_reward'],
  ['being good to myself is okay sometimes', 'emotion_reward'],
  ['tonight I indulge myself', 'emotion_reward'],
  // scarcity promo (direct)
  ['the host said last 3 orders', 'scarcity_promo'],
  ['it\'s a flash sale, ends tonight', 'scarcity_promo'],
  ['only 2 left in stock', 'scarcity_promo'],
  ['low stock warning for this one', 'scarcity_promo'],
  ['this is a limited time deal', 'scarcity_promo'],
  ['act now or miss out', 'scarcity_promo'],
  ['while supplies last, they said', 'scarcity_promo'],
  ['almost checked out, heart racing', 'scarcity_promo'],
  ['don\'t miss out on today only deal', 'scarcity_promo'],
  ['it\'s one click away from being mine', 'scarcity_promo'],
  // scarcity promo (implicit)
  ['everyone\'s grabbing it during black friday', 'scarcity_promo'],
  ['extra 20% off ends at midnight', 'scarcity_promo'],
  // wear & replace (direct)
  ['my hair dryer stopped working', 'wear_replace'],
  ['the old kettle broke down', 'wear_replace'],
  ['my watch strap is frayed', 'wear_replace'],
  ['the lamp is worn out', 'wear_replace'],
  ['my sunscreen ran out', 'wear_replace'],
  ['the bottle is almost empty', 'wear_replace'],
  ['my electric razor quit on me', 'wear_replace'],
  ['it keeps shutting down randomly', 'wear_replace'],
  ['had it for years, time to replace it', 'wear_replace'],
  // wear & replace (implicit)
  ['the zipper broke again', 'wear_replace'],
  ['my backpack is falling apart', 'wear_replace'],
  ['my old desktop is getting so slow', 'wear_replace'],
];

// ============================================================
// 验收负例语料 — zh/en 各 ≥20 条, 全部不得触发 (交还既有 chat 流程)
// ============================================================

const NEGATIVE_ZH: string[] = [
  // 纯闲聊
  '今天天气真不错',
  '我就喜欢听歌散步',
  '帮我整理一下文档',
  // 数据问句 (57-c/58-c/59-c 的地盘)
  '帮我看看这个月省了多少',
  '上个月奶茶花了几次',
  '那上个月呢',
  // 明确购物意图 (通用购买预检的地盘)
  '想买台新相机奖励自己',
  '最后三单，赶紧下单',
  '今天好累，想买点东西哄自己',
  '新手机什么时候发布',
  // 否定 / 拒绝 / 问人
  '这件先不买了，虽然有点心动',
  '不想花钱，想存钱',
  '别管我了，最后几单我也认了',
  '大家觉得我该不该买',
  // 高风险语义 (不做心理评估)
  '最近有点抑郁，想花钱',
  // BNPL 支付风险
  '花呗分期犒劳一下自己',
  // 绿色品类让路
  '耳机快坏了',
  // 非物件耗损同形表达
  '这个月预算用完了',
  '耐心用完了',
  '会员过期了，要不要续费',
  // 歧义生活短语
  '直播间在讲什么段子',
  '假期最后一天，好开心',
  // weak 档: 可识别但低置信不触发
  '出去走走换换心情',
  '打折区都是些什么东西啊',
];

const NEGATIVE_EN: string[] = [
  // pure chit-chat
  'the weather is lovely today',
  'nice movie last night',
  'help me clean up my files',
  'the bus is always late',
  // data queries
  'how much did I save this month',
  'what about last month',
  'what\'s the price of this course',
  // explicit shopping intent
  'I want to buy a new camera to reward myself',
  'last chance, checking out now',
  'only 2 left, I already ordered one',
  // refusal / advice seeking / negation
  'leave me alone about this',
  'what do you guys think, should I get it',
  'I\'m not buying anything today',
  'time is running out at work',
  'I don\'t wanna spend much this month',
  // high risk
  'I\'ve been feeling depressed lately',
  // BNPL
  'treat myself, pay in 4',
  // green category yield
  'my earbuds stopped working',
  // non-wear same-shape phrases
  'my gym membership expired',
  'I ran out of patience with this game',
  // ambiguous daily phrases
  'everyone says it\'s worth it',
  'I feel so tired lately',
  'did the sale end already',
  // weak tier: recognized but below threshold
  'need a change of pace this weekend',
];

// ============================================================
// 正例语料 → 三类路由
// ============================================================

describe('验收正例语料 (zh ≥30 / en ≥30) — 三类信号语义路由', () => {
  it('zh 正例全部触发且信号归类正确', () => {
    expect(POSITIVE_ZH.length).toBeGreaterThanOrEqual(30);
    for (const [content, signal] of POSITIVE_ZH) {
      const turn = buildContextSignalTurn({ userContent: content, locale: 'zh' });
      expect(turn, content).not.toBeNull();
      expect(turn!.contextSignal.signal, content).toBe(signal);
      expect(turn!.contextSignal.words.length, content).toBeGreaterThan(0);
      expect(turn!.reply.length, content).toBeGreaterThan(0);
    }
  });

  it('en 正例全部触发且信号归类正确 (双语)', () => {
    expect(POSITIVE_EN.length).toBeGreaterThanOrEqual(30);
    for (const [content, signal] of POSITIVE_EN) {
      const turn = buildContextSignalTurn({ userContent: content, locale: 'en' });
      expect(turn, content).not.toBeNull();
      expect(turn!.contextSignal.signal, content).toBe(signal);
    }
  });

  it('每类信号 zh+en 至少各有 direct 与 implicit 正例 (直说+含蓄双覆盖)', () => {
    for (const locale of ['zh', 'en'] as const) {
      const corpus = locale === 'zh' ? POSITIVE_ZH : POSITIVE_EN;
      for (const signal of ['emotion_reward', 'scarcity_promo', 'wear_replace'] as const) {
        for (const tier of ['direct', 'implicit'] as const) {
          const hit = corpus.some(([content, sig]) => {
            if (sig !== signal) return false;
            const detection = detectShoppingContextIntent(content, { locale });
            return detection?.entries.some((e) => e.tier === tier) ?? false;
          });
          expect(hit, `${locale} ${signal} ${tier}`).toBe(true);
        }
      }
    }
  });
});

describe('三类信号各自的语义路由 (全部复用既有能力, 零新流程)', () => {
  it('情绪奖励 → 60-c 既有情绪卡 (同 payload 形状: mood + intensity)', () => {
    const turn = buildContextSignalTurn({
      userContent: '想奖励自己一下',
      locale: 'zh',
      guardIntensity: 'strict',
    });
    expect(turn!.emotionGuardCard).toEqual({ mood: 'celebratory', intensity: 'strict' });
    expect(turn!.cooldownCard).toBeUndefined();
    expect(turn!.prepurchaseCard).toBeUndefined();
  });

  it('情绪奖励: 词条自带 mood 提示 (60-c 同枚举), 不新建心理评估字段', () => {
    const turn = buildContextSignalTurn({ userContent: '想好好哄哄自己', locale: 'zh' });
    expect(turn!.emotionGuardCard!.mood).toBe('sad');
    expect(Object.keys(turn!.emotionGuardCard!).sort()).toEqual(['intensity', 'mood']);
  });

  it('稀缺促销 → 48-b 既有冷静卡 (愿望单 + 次日一问), 不产生新统计口径', () => {
    const turn = buildContextSignalTurn({ userContent: '直播间说最后三单了', locale: 'zh' });
    expect(turn!.cooldownCard).toBeDefined();
    expect(turn!.emotionGuardCard).toBeUndefined();
    expect(turn!.reply).not.toMatch(/别买|不能买|不许买|羞|可耻|浪费钱/);
  });

  it('促销回复取 promo_pressure_welcome 场景 (elephant-tone SSOT 已注册)', () => {
    expect(ELEPHANT_SCENES).toContain('promo_pressure_welcome');
    const turn = buildContextSignalTurn({ userContent: '限时秒杀就这一晚', locale: 'en', rng: () => 0 });
    expect(turn!.reply).toMatch(/wishlist|tactic|Sales shout/i);
  });

  it('耗损替换 (非绿色品类) → 50-a 既有三问卡, 不改 green-alternatives 数据结构', () => {
    const turn = buildContextSignalTurn({ userContent: '家里那台挂烫机快坏了', locale: 'zh' });
    expect(turn!.prepurchaseCard).toEqual({ subject: null });
    expect(turn!.emotionGuardCard).toBeUndefined();
    expect(turn!.cooldownCard).toBeUndefined();
  });

  it('耗损替换且品类在绿色词表内 → 整体让路给既有绿色替代流 (本层绝不吞)', () => {
    // 充电线/数据线在 green-alternatives 词表内 — 让路后由 loadLettaTurnContext
    // 的绿色预检带出既有 green_alt 卡, 即"绿色替代"复用路径
    expect(buildContextSignalTurn({ userContent: '充电线又磨损了', locale: 'zh' })).toBeNull();
  });

  it('greenPref off: detector 不做绿色让路 (route 层整体静默是唯一闸)', () => {
    const turn = buildContextSignalTurn({
      userContent: '充电线又磨损了',
      locale: 'zh',
      greenPref: 'off',
    });
    expect(turn!.prepurchaseCard).toEqual({ subject: null });
  });
});

// ============================================================
// 负例语料 + 低置信 — 不触发, 交还既有 chat 流程
// ============================================================

describe('验收负例语料 (zh ≥20 / en ≥20) — 纯闲聊/问人/拒绝/让路一律不触发', () => {
  it('zh 负例全部不触发 (turn 为 null)', () => {
    expect(NEGATIVE_ZH.length).toBeGreaterThanOrEqual(20);
    for (const content of NEGATIVE_ZH) {
      expect(buildContextSignalTurn({ userContent: content, locale: 'zh' }), content).toBeNull();
    }
  });

  it('en 负例全部不触发 (turn 为 null)', () => {
    expect(NEGATIVE_EN.length).toBeGreaterThanOrEqual(20);
    for (const content of NEGATIVE_EN) {
      expect(buildContextSignalTurn({ userContent: content, locale: 'en' }), content).toBeNull();
    }
  });

  it('低置信 (weak 档) 不触发 — detector 识别得到, 路由层放行', () => {
    const detection = detectShoppingContextIntent('出去走走换换心情');
    expect(detection).not.toBeNull();
    expect(detection!.confidence).toBeLessThan(0.6);
    expect(buildContextSignalTurn({ userContent: '出去走走换换心情', locale: 'zh' })).toBeNull();
  });
});

// ============================================================
// 会话纠正 — dismissedEntryIds 透传, 一次纠正本轮会话不再重复
// ============================================================

describe('会话纠正透传', () => {
  it('dismissedEntryIds 命中词条被排除 → turn 为 null', () => {
    expect(buildContextSignalTurn({
      userContent: '想奖励自己一下',
      locale: 'zh',
      dismissedEntryIds: ['emotion_reward.treat_self'],
    })).toBeNull();
  });

  it('纠正只作用于被纠正词条, 其他表达仍然触发', () => {
    const turn = buildContextSignalTurn({
      userContent: '想奖励自己一下',
      locale: 'zh',
      dismissedEntryIds: ['scarcity_promo.last_units'],
    });
    expect(turn).not.toBeNull();
  });
});

// ============================================================
// SSE / payload 红线 — context_signal 事件最前, 三路同形状
// ============================================================

describe('contextSignalSseEvent / buildContextSignalSseStream', () => {
  it('SSE 事件序: context_signal → context_trust → 路由卡 → token 分块 → done', async () => {
    const turn = buildContextSignalTurn({
      userContent: '想奖励自己一下',
      locale: 'zh',
      rng: () => 0,
    })!;
    const events = await readStream(buildContextSignalSseStream(turn));

    expect(events[0]).toEqual({ type: 'context_signal', contextSignal: turn.contextSignal });
    expect(events[1]).toEqual({ type: 'context_trust', contextTrust: turn.contextTrust });
    expect(events[2]).toEqual({ type: 'emotion_guard_card', emotionGuardCard: turn.emotionGuardCard });
    const tokens = events.slice(3, -1) as Array<{ type: string; content?: string }>;
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((e) => e.type === 'token')).toBe(true);
    expect(events[events.length - 1]).toEqual({ type: 'done' });
    expect(tokens.map((e) => e.content ?? '').join('')).toBe(turn.reply);
  });

  it('促销/耗损路由: trust 事件后跟既有路由卡', async () => {
    const promo = buildContextSignalTurn({ userContent: '直播间说最后三单了', locale: 'zh', rng: () => 0 })!;
    const promoEvents = await readStream(buildContextSignalSseStream(promo));
    expect(promoEvents[0]).toMatchObject({ type: 'context_signal' });
    expect(promoEvents[1]).toMatchObject({ type: 'context_trust' });
    expect(promoEvents[2]).toEqual({ type: 'cooldown_card', cooldownCard: promo.cooldownCard });

    const wear = buildContextSignalTurn({ userContent: '家里那台挂烫机快坏了', locale: 'zh', rng: () => 0 })!;
    const wearEvents = await readStream(buildContextSignalSseStream(wear));
    expect(wearEvents[0]).toMatchObject({ type: 'context_signal' });
    expect(wearEvents[1]).toMatchObject({ type: 'context_trust' });
    expect(wearEvents[2]).toEqual({ type: 'prepurchase_card', prepurchaseCard: wear.prepurchaseCard });
  });

  it('信号词 payload 红线: 只有 signal + words (id/zh/en), 零金额零碳数值零物品抓取字段', () => {
    const turn = buildContextSignalTurn({ userContent: '直播间说最后三单了', locale: 'zh' })!;
    expect(Object.keys(turn.contextSignal).sort()).toEqual(['signal', 'words']);
    for (const word of turn.contextSignal.words) {
      expect(Object.keys(word).sort()).toEqual(['en', 'id', 'zh']);
      expect(word.zh).not.toMatch(/\d/);
      expect(word.en).not.toMatch(/\d/);
    }
    expect(JSON.stringify(turn.contextSignal)).not.toMatch(/amount|price|carbon|saved|footprint/i);
  });

  it('三路同形状: SSE 事件 payload 与 JSON 字段共享同一 ContextSignalData 对象', () => {
    const turn = buildContextSignalTurn({ userContent: '想奖励自己一下', locale: 'zh' })!;
    const event = contextSignalSseEvent(turn.contextSignal);
    expect(event.contextSignal).toBe(turn.contextSignal);
    expect(event.type).toBe('context_signal');
  });
});

// ============================================================
// route.ts source-order 链序锁 — 强 detector 之后、自由回复 (Letta) 之前
// ============================================================

describe('路由链序锁 — 弱信号块在 60-c 情绪守护之后、通用购买预检之前 (source-order)', () => {
  const source = readFileSync(new URL('../../route.ts', import.meta.url), 'utf-8');

  it('弱信号块晚于 60-c 情绪守护与全部数据问答检测 (更强意图先答)', () => {
    const idx = source.indexOf('buildContextSignalTurn');
    expect(idx).toBeGreaterThan(-1);
    expect(source.indexOf('buildEmotionGuardTurn')).toBeLessThan(idx);
    expect(source.indexOf('detectSavingsQuery')).toBeLessThan(idx);
    expect(source.indexOf('detectCategoryQuery')).toBeLessThan(idx);
    expect(source.indexOf('detectImpulseTimeQuery')).toBeLessThan(idx);
    expect(source.indexOf('detectFollowUpQuery')).toBeLessThan(idx);
  });

  it('弱信号块早于 loadLettaTurnContext 调用点 (不吞通用购买预检)', () => {
    const idx = source.indexOf('buildContextSignalTurn');
    const callIdx = source.indexOf('await loadLettaTurnContext({');
    expect(callIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(idx);
  });

  it('greenPref off 整体静默 (拒绝守护的会话不触发)', () => {
    const blockStart = source.indexOf('batch61-b 购物场景弱信号');
    const block = source.slice(blockStart, source.indexOf('await loadLettaTurnContext({'));
    expect(block).toMatch(/greenPref !== 'off'/);
  });
});
