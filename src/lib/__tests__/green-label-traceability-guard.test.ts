/**
 * BP p19 防漂绿三原则守卫 ②断言可溯源 — 绿色标签证据链契约
 *
 * 承诺：每个绿色标签引用认证或公开数据来源，用户可查。
 *
 * 现状的溯源实现（本守卫按现状固化）：
 *   标签并非凭空生成，而是「证据词命中 → 标签」的可复算链：
 *   - GREEN_FLAG_RULES 是公开的标签注册表：每个 flag 挂一张 en+zh 证据词表；
 *   - evaluateGreenSignal 输出的每个 green_flag 都能回溯到注册表里某条
 *     规则的证据词在卡面文本中的命中（词表公开、命中可复算 = 可审计）；
 *   - certified 标签的证据词表本身引用真实公开认证方案（FSC/GOTS/Ecocert/
     Energy Star/Fair Trade）。
 *
 * TODO(溯源字段)：现状 GreenSignal / GreenFlagRule 没有 source/citation 字段 —
 * 用户侧「点开可查认证出处」只实现了一半（可复算可审计 ✓、来源引用可查 ✗），
 * 已记 /tmp/b88c-defects.md (P2) 交 owner 定夺。若功能批补 source 字段，
 * 本文件的「现状结构固化」断言应同步更新为钉住新字段非空。
 */

import { describe, expect, it } from 'vitest';

import {
  evaluateGreenSignal,
  GREEN_FLAG_RULES,
  type GreenSignalCardInput,
} from '@/lib/green-rules';

const REGISTRY_FLAGS = GREEN_FLAG_RULES.map((rule) => rule.flag);

/** 混合语料：命中多规则 / 单规则 / 否定短语 / 未认证 */
const CORPUS: GreenSignalCardInput[] = [
  { title: 'Organic Cotton Bath Towel', category: 'home' },
  { title: '竹制牙刷（软毛）' },
  { title: '九成新二手背包', category: '箱包' },
  { title: '一次性塑料杯 50 只装' },
  { title: 'Plastic-free lunch box, biodegradable' },
  { title: 'FSC certified recycled bamboo shelf, durable' },
  { title: 'GT-2000 跑鞋 42 码' },
];

describe('BP p19 原则② 证据注册表完整性', () => {
  it('每个标签都有非空证据词表，词表内无空白词', () => {
    for (const rule of GREEN_FLAG_RULES) {
      expect(rule.flag.trim().length, `rule.flag 空白`).toBeGreaterThan(0);
      expect(rule.keywords.length, `${rule.flag} 证据词表为空`).toBeGreaterThan(0);
      for (const keyword of rule.keywords) {
        expect(keyword.trim().length, `${rule.flag} 空白证据词`).toBeGreaterThan(0);
      }
    }
  });

  it('标签全局唯一 — 一个标签只回溯到一条规则（溯源无歧义）', () => {
    expect(new Set(REGISTRY_FLAGS).size).toBe(REGISTRY_FLAGS.length);
  });

  it('现状结构固化：规则 = flag/weight/keywords；信号 = green_score/green_flags/non_green_flag', () => {
    // TODO(溯源字段)：补 source 字段时更新此断言（见文件头 TODO）
    for (const rule of GREEN_FLAG_RULES) {
      expect(Object.keys(rule).sort()).toEqual(['flag', 'keywords', 'weight']);
    }
    const [signal] = evaluateGreenSignal('', CORPUS);
    expect(Object.keys(signal).sort()).toEqual(['green_flags', 'green_score', 'non_green_flag']);
  });
});

describe('BP p19 原则② 证据→标签可复算链', () => {
  it('注册表里每一条证据词命中都真实产出其标签（无死证据）', () => {
    // 每个证据词单独成卡：命中必须回溯出该词所属规则的标签
    const evidenceCards: Array<{ title: string; flag: string }> = [];
    for (const rule of GREEN_FLAG_RULES) {
      for (const keyword of rule.keywords) {
        evidenceCards.push({ title: keyword, flag: rule.flag });
      }
    }
    const signals = evaluateGreenSignal('', evidenceCards);
    evidenceCards.forEach((card, index) => {
      expect(
        signals[index].green_flags,
        `证据词 "${card.title}" 未能回溯出标签 ${card.flag}`,
      ).toContain(card.flag);
    });
  });

  it('输出标签闭合于注册表 — 不存在凭空 invented 的标签', () => {
    for (const signal of evaluateGreenSignal('环保 sustainable', CORPUS)) {
      for (const flag of signal.green_flags) {
        expect(REGISTRY_FLAGS, `标签 "${flag}" 不在公开注册表`).toContain(flag);
      }
    }
  });
});

describe('BP p19 原则② 认证标签引用公开认证方案', () => {
  const certifiedRule = GREEN_FLAG_RULES.find((rule) => rule.flag === 'certified');

  it('certified 标签证据词表钉住真实公开认证方案（防认证词表被掏空）', () => {
    expect(certifiedRule, 'certified 标签从注册表消失').toBeDefined();
    const keywords = certifiedRule!.keywords.map((keyword) => keyword.toLowerCase());
    for (const scheme of ['fsc', 'gots', 'ecocert', 'energy star', 'fair trade']) {
      expect(
        keywords.some((keyword) => keyword.includes(scheme)),
        `certified 证据词表丢了公开认证方案: ${scheme}`,
      ).toBe(true);
    }
    for (const scheme of ['认证', '能源之星', '公平贸易', '一级能效']) {
      expect(certifiedRule!.keywords, `certified 证据词表丢了中文方案: ${scheme}`).toContain(scheme);
    }
  });
});
