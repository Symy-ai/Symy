/**
 * BP p19 防漂绿三原则守卫 ③未认证≠不绿 — 无证据不打负向标契约
 *
 * 承诺：没有绿色认证/词表证据的商品 ≠「不绿」，只是「尚未验证」——
 * 话术如实，不装懂、不抹黑。
 *
 * 现状的实现方式（本守卫按现状固化）：
 *   - 未认证卡在评分引擎里 non_green_flag 恒为 false、green_flags 为空、
 *     档位 unknown：无角标、无文案、保持原序（green-level.ts「不打负向标，
 *     荣誉框架非羞耻框架」）——未认证分支是「静默」，不存在显式话术
 *     （缺陷记录见 /tmp/b88c-defects.md P3：BP 的「尚未验证」标签未落地）。
 *   - 唯一的负向文案（greenerHint/greenerOptions/nonGreenOrderHint）只许
 *     挂在 non_green_flag（象牙/皮草/一次性/塑料等高环境影响品类的
 *     事实命中）上，源码门控在此钉死。
 *   - i18n 话术 tone-guard（zh/en）：徽章与引导文案不得含贬义定性词；
 *     「非绿/not green」措辞只许出现在购物车级聚合提示 nonGreenOrderHint
 *     （事实品类命中的 gate 之后），单卡话术一律不得给商品定性「非绿」。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';
import { classifyGreenLevel } from '@/lib/green-level';
import { rankCardsByGreenLevel } from '@/lib/green-first-rank';
import { evaluateGreenSignal, type GreenSignalCardInput } from '@/lib/green-rules';

/** 未认证中性卡语料：无绿色词、无高环境影响品类词，含整词边界陷阱 */
const UNCERTIFIED_CARDS: GreenSignalCardInput[] = [
  { title: '无线蓝牙耳机 主动降噪' },
  { title: 'GT-2000 跑鞋 42 码' },
  { title: 'Wireless earbuds charging case' },
  { title: 'Oak furniture dining table' },
  { title: 'A different kind of lamp' },
  { title: '不锈钢保温杯 500ml' },
  { title: 'Stainless steel water bottle' },
  { title: 'Ceramic coffee mug' },
];

describe('BP p19 原则③ 结构闸：未认证 ≠ 非绿', () => {
  it('未认证卡不打非绿标、无绿色标签、0 分、档位 unknown', () => {
    const signals = evaluateGreenSignal('', UNCERTIFIED_CARDS);
    signals.forEach((signal, index) => {
      expect(signal.non_green_flag, `未认证卡被打了非绿标: "${UNCERTIFIED_CARDS[index].title}"`).toBe(false);
      expect(signal.green_flags, `"${UNCERTIFIED_CARDS[index].title}" 凭空获得绿色标签`).toEqual([]);
      expect(signal.green_score).toBe(0);
      expect(classifyGreenLevel(signal)).toBe('unknown');
    });
  });

  it('未认证卡不重排、无徽章档；绿色 query 意图加成也不给未认证卡定档', () => {
    for (const query of ['', '环保 sustainable bag']) {
      const result = rankCardsByGreenLevel(UNCERTIFIED_CARDS, true, query);
      expect(result.ranked.map((entry) => entry.card)).toEqual(UNCERTIFIED_CARDS);
      expect(result.hasHigh).toBe(false);
      for (const entry of result.ranked) {
        expect(entry.level).toBe('unknown');
      }
    }
  });

  it('负向文案源码门控：替代建议/非绿提示只认 non_green_flag 事实命中', () => {
    const cartPanel = readFileSync(join(process.cwd(), 'src/components/chat/parts/cart-panel.tsx'), 'utf8');
    const productCards = readFileSync(join(process.cwd(), 'src/components/chat/parts/product-cards.tsx'), 'utf8');
    expect(
      cartPanel.match(/const\s+greenPick\s*=\s*greenPrefEnabled\s*&&\s*signal\.green_score\s*>=\s*GREEN_SCORE_BADGE_THRESHOLD/),
      'greenPick 徽章脱离了规则分门控（>= GREEN_SCORE_BADGE_THRESHOLD）',
    ).not.toBeNull();
    expect(
      cartPanel.match(/const\s+greenerHint\s*=\s*greenPrefEnabled\s*&&\s*signal\.non_green_flag\s*&&\s*!greenPick/),
      'greenerHint 门控漂移：替代建议话术必须只在 non_green_flag（事实品类命中）时出现',
    ).not.toBeNull();
    expect(
      productCards.match(/const\s+greenerTip\s*=\s*!!signal\?\.non_green_flag\s*&&\s*!greenPick/),
      'greenerTip 门控漂移：「可替代」标签必须只在 non_green_flag（事实品类命中）时出现',
    ).not.toBeNull();
  });
});

describe('BP p19 原则③ 话术闸：绿色域 i18n tone-guard（zh/en）', () => {
  /** 单卡徽章/引导话术 + 顶部引导语 — 全部不得贬义定性 */
  const GREEN_COPY: Array<{ path: string; zh: string; en: string }> = [
    { path: 'chat.products.greenPick', zh: zh.chat.products.greenPick, en: en.chat.products.greenPick },
    { path: 'chat.products.greenerOptions', zh: zh.chat.products.greenerOptions, en: en.chat.products.greenerOptions },
    { path: 'chat.products.greenFirstNote', zh: zh.chat.products.greenFirstNote, en: en.chat.products.greenFirstNote },
    { path: 'chat.products.greenIntentNote', zh: zh.chat.products.greenIntentNote, en: en.chat.products.greenIntentNote },
    { path: 'chat.cart.greenPick', zh: zh.chat.cart.greenPick, en: en.chat.cart.greenPick },
    { path: 'chat.cart.greenerHint', zh: zh.chat.cart.greenerHint, en: en.chat.cart.greenerHint },
    { path: 'chat.cart.nonGreenOrderHint', zh: zh.chat.cart.nonGreenOrderHint, en: en.chat.cart.nonGreenOrderHint },
    { path: 'notification.greenPick.badge', zh: zh.notification.greenPick.badge, en: en.notification.greenPick.badge },
  ];

  /** 单卡话术不得给商品定性「非绿/not green」（未认证≠不绿；非绿提示只许聚合面） */
  const NON_GREEN_PHRASING = /非绿|不绿|not\s+green|non[-\s]?green/i;
  /** 任何绿色域话术不得出现的贬义定性词（荣誉框架非羞耻框架，温和引导不打红X） */
  const DEROGATORY = /有害|harmful|toxic|毒|污染|pollut|可耻|羞耻|shame|差劲|terrible|awful|垃圾|恶劣|destroy|破坏/;

  it('绿色域话术 zh/en 双语齐全且非空', () => {
    for (const copy of GREEN_COPY) {
      expect(copy.zh.trim().length, `${copy.path} zh 缺失/空`).toBeGreaterThan(0);
      expect(copy.en.trim().length, `${copy.path} en 缺失/空`).toBeGreaterThan(0);
    }
  });

  it('绿色域话术零贬义定性词（zh/en）', () => {
    for (const copy of GREEN_COPY) {
      expect(copy.zh, `${copy.path} zh 含贬义定性词: "${copy.zh}"`).not.toMatch(DEROGATORY);
      expect(copy.en, `${copy.path} en 含贬义定性词: "${copy.en}"`).not.toMatch(DEROGATORY);
    }
  });

  it('「非绿/not green」措辞只许出现在 nonGreenOrderHint（事实品类命中后的购物车聚合提示）', () => {
    for (const copy of GREEN_COPY) {
      if (copy.path === 'chat.cart.nonGreenOrderHint') continue;
      expect(copy.zh, `${copy.path} zh 给商品定性「非绿」: "${copy.zh}"`).not.toMatch(NON_GREEN_PHRASING);
      expect(copy.en, `${copy.path} en 给商品定性「非绿」: "${copy.en}"`).not.toMatch(NON_GREEN_PHRASING);
    }
    expect(zh.chat.cart.nonGreenOrderHint).toMatch(NON_GREEN_PHRASING);
    expect(en.chat.cart.nonGreenOrderHint).toMatch(NON_GREEN_PHRASING);
  });
});
