/**
 * 🐘 elephant-tone.ts 测试 — 绿色环保小象话术库 (人设转型 2026-09-05)
 *
 * 覆盖:
 * 1. 表完整性 — 每个场景 en/zh 至少 2 个变体, 无空串, 场景内不重复
 * 2. 双语纯净 — zh 变体无英文单词 (货币/占位符除外), en 变体无中文
 * 3. 插值 — {item}/{amount}/{hours} 正确替换; 未知占位符原样保留 (暴露传参遗漏)
 * 4. locale 归一化 — 'zh-CN'/'ZH'/undefined → 正确分支
 * 5. 随机轮换 — rng 注入确定性
 * 6. 无变量调用安全 — demo 与 followup 系列场景 (调用方不传 vars) 不得残留 {xxx} 字面量
 */

import { describe, it, expect } from 'vitest';
import {
  ELEPHANT_PHRASES,
  ELEPHANT_SCENES,
  elephantGenericVars,
  elephantHours,
  elephantMoney,
  getElephantPhrase,
  interpolateElephantTemplate,
  normalizeElephantLocale,
  pickElephantPhrase,
} from '../elephant-tone';

/** 需要调用方传变量的场景 (saw_it / first_reflection / bought_anyway / intercept) */
const VAR_SCENES = new Set(['saw_it', 'bought_anyway', 'first_reflection', 'intercept_celebration']);

/** zh 变体允许的英文残留: 无 (货币/数字/emoji/占位符不算) */
function stripAllowed(text: string): string {
  return text
    .replace(/\{\w+\}/g, '')     // 占位符 ({item} 等, 插值时才会变成内容)
    .replace(/\$[\d,.]+/g, '')   // 货币
    .replace(/[\d,.]+/g, '')     // 数字
    .replace(/[\p{Emoji_Presentation}\uFE0F]/gu, ''); // emoji
}

describe('elephant-tone 表完整性', () => {
  it('每个场景都有 en 与 zh 变体, 每种语言至少 2 条, 无空串', () => {
    for (const scene of ELEPHANT_SCENES) {
      const { en, zh } = ELEPHANT_PHRASES[scene];
      expect(en.length, `${scene}.en`).toBeGreaterThanOrEqual(2);
      expect(zh.length, `${scene}.zh`).toBeGreaterThanOrEqual(2);
      for (const p of [...en, ...zh]) {
        expect(p.trim().length, `${scene}: "${p}"`).toBeGreaterThan(0);
      }
    }
  });

  it('场景内变体互不重复 (避免轮换撞车)', () => {
    for (const scene of ELEPHANT_SCENES) {
      const { en, zh } = ELEPHANT_PHRASES[scene];
      expect(new Set(en).size, `${scene}.en duplicates`).toBe(en.length);
      expect(new Set(zh).size, `${scene}.zh duplicates`).toBe(zh.length);
    }
  });

  it('占位符只允许 {item}/{amount}/{hours}', () => {
    for (const scene of ELEPHANT_SCENES) {
      const { en, zh } = ELEPHANT_PHRASES[scene];
      for (const p of [...en, ...zh]) {
        const placeholders = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const key of placeholders) {
          expect(['item', 'amount', 'hours'], `${scene}: {${key}}`).toContain(key);
        }
      }
    }
  });
});

describe('elephant-tone 双语纯净', () => {
  it('zh 变体不含英文单词 (除货币/数字/emoji)', () => {
    for (const scene of ELEPHANT_SCENES) {
      for (const p of ELEPHANT_PHRASES[scene].zh) {
        expect(/[A-Za-z]/.test(stripAllowed(p)), `${scene}.zh 混入英文: "${p}"`).toBe(false);
      }
    }
  });

  it('en 变体不含中文', () => {
    for (const scene of ELEPHANT_SCENES) {
      for (const p of ELEPHANT_PHRASES[scene].en) {
        expect(/[\u4e00-\u9fff]/.test(p), `${scene}.en 混入中文: "${p}"`).toBe(false);
      }
    }
  });
});

describe('elephant-tone 无变量调用安全 (demo/followup 场景)', () => {
  it('demo_* 与 followup_* 场景不使用占位符 (getDemoReply 不传 vars)', () => {
    for (const scene of ELEPHANT_SCENES) {
      if (VAR_SCENES.has(scene)) continue;
      const { en, zh } = ELEPHANT_PHRASES[scene];
      for (const p of [...en, ...zh]) {
        expect(p, `${scene} 不应含占位符`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('elephant-tone 插值与取词', () => {
  it('interpolateElephantTemplate 替换已知变量, 保留未知变量 (便于发现遗漏)', () => {
    expect(interpolateElephantTemplate('{item} {amount} — {hours}', { item: 'A', amount: '$1', hours: '2 hours' }))
      .toBe('A $1 — 2 hours');
    expect(interpolateElephantTemplate('hi {unknown}', {})).toBe('hi {unknown}');
    expect(interpolateElephantTemplate('no vars', undefined)).toBe('no vars');
  });

  it('getElephantPhrase 按 locale 插值, 结果无残留占位符', () => {
    const vars = { item: '跑步鞋', amount: '$1099.00', hours: '55.0 hours' };
    for (const locale of ['en', 'zh'] as const) {
      const reply = getElephantPhrase('first_reflection', locale, vars);
      expect(reply).not.toMatch(/\{\w+\}/);
      expect(reply).toContain('1099');
    }
  });

  it('normalizeElephantLocale: zh 前缀 → zh, 其他 → en', () => {
    expect(normalizeElephantLocale('zh')).toBe('zh');
    expect(normalizeElephantLocale('zh-CN')).toBe('zh');
    expect(normalizeElephantLocale('ZH')).toBe('zh');
    expect(normalizeElephantLocale('en')).toBe('en');
    expect(normalizeElephantLocale('fr')).toBe('en');
    expect(normalizeElephantLocale(undefined)).toBe('en');
    expect(normalizeElephantLocale(null)).toBe('en');
  });

  it('pickElephantPhrase 接受注入 rng (确定性测试)', () => {
    expect(pickElephantPhrase('daily_greeting', 'en', () => 0)).toBe(ELEPHANT_PHRASES.daily_greeting.en[0]);
    expect(pickElephantPhrase('daily_greeting', 'en', () => 0.99)).toBe(
      ELEPHANT_PHRASES.daily_greeting.en[ELEPHANT_PHRASES.daily_greeting.en.length - 1],
    );
  });

  it('elephantGenericVars 按语言给兜底词 (防御路径不混排)', () => {
    expect(elephantGenericVars('zh')).toEqual({ amount: '这笔钱', hours: '那些小时' });
    expect(elephantGenericVars('en')).toEqual({ amount: 'That money', hours: 'those hours' });
  });

  it('elephantHours/elephantMoney 产出符合占位符约定 (完整时长/含符号金额)', () => {
    expect(elephantHours('55.0', 'zh')).toBe('55.0 小时');
    expect(elephantHours('55.0', 'en')).toBe('55.0 hours');
    expect(elephantHours(2, 'zh')).toBe('2 小时');
    expect(elephantMoney(46.8)).toBe('$46.80');
  });

  it('插值后 en 不出现 "hours hours" 叠词, zh 不混入英文 hours', () => {
    const en = getElephantPhrase('saw_it', 'en', { amount: '$1099.00', hours: '55.0 hours' }, () => 0);
    expect(en).not.toContain('hours hours');
    const zh = getElephantPhrase('saw_it', 'zh', { amount: '$1099.00', hours: '55.0 小时' }, () => 0);
    expect(zh).not.toMatch(/[A-Za-z]/);
  });
});

describe('elephant-tone 核心场景话术质量 (镜子 → 小象转型验收)', () => {
  it('5 个核心产品场景存在且方向正确', () => {
    // 拦截成功恭喜 (荣誉框架 — 夸"做对的事", 不是说教)
    const congrats = getElephantPhrase('intercept_celebration', 'en', { amount: '$46.80', hours: '2.3 hours' }, () => 0);
    expect(congrats).toContain('$46.80');
    // 超预算温柔提醒 — 不指责 (有台阶: 要不要再看看)
    for (const p of ELEPHANT_PHRASES.over_budget_gentle.zh) {
      expect(p.length).toBeGreaterThan(0);
    }
    // 复用建议 — "你手头可能已经有啦"/借/租/修/复用 方向
    for (const p of ELEPHANT_PHRASES.reuse_suggestion.zh) {
      expect(/已经有|借|租|修|复用/.test(p)).toBe(true);
    }
    // 日常问候 — 有体温
    for (const p of [...ELEPHANT_PHRASES.daily_greeting.en, ...ELEPHANT_PHRASES.daily_greeting.zh]) {
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it('绿色好物推荐场景强调环保优先', () => {
    for (const p of [...ELEPHANT_PHRASES.green_find.en, ...ELEPHANT_PHRASES.green_find.zh]) {
      expect(/green|eco|环保|地球|绿色/.test(p)).toBe(true);
    }
  });

  it('不出现镜子时代禁语 (冷判决/羞耻框架)', () => {
    const forbidden = [/你穷/, /买不起/, /hours of your life\. You know if you need it/];
    for (const scene of ELEPHANT_SCENES) {
      const { en, zh } = ELEPHANT_PHRASES[scene];
      for (const p of [...en, ...zh]) {
        for (const re of forbidden) {
          expect(re.test(p), `${scene}: "${p}"`).toBe(false);
        }
      }
    }
  });
});
