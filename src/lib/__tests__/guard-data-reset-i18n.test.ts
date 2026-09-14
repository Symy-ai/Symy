/**
 * guard-data i18n 红线测试 (batch59-b)
 *
 * 锁 zh/en 双语: guardData* key 两侧齐全 / 确认弹层与庆祝卡文案非羞辱
 * (无 失败/浪费/黑历史 类词) / 金额 ($/¥) 只出现在知情提醒
 * (guardDataImpact*) 两个 key 里 / 无碳足迹数值 / 组件新 key 禁 defaultValue
 * (源码 grep)。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const zh = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages/zh.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages/en.json'), 'utf8'));

const zhKeys = zh.profile as Record<string, string>;
const enKeys = en.profile as Record<string, string>;
const guardDataKeys = Object.keys(zhKeys).filter((k) => k.startsWith('guardData'));

/** 确认弹层 + 庆祝卡 + 降级提示面 (金额知情提醒单独锁) */
const NON_SHAMING_KEYS = guardDataKeys.filter(
  (k) => k !== 'guardDataImpactPrefix' && k !== 'guardDataImpactSuffix',
);

const SHAMING_WORDS = [
  '失败', '浪费', '黑历史', '污点', '糟糕', '羞',
  'failure', 'fail', 'waste', 'wasted', 'shame', 'guilt', 'embarrass', 'bad history', 'dirty',
];
const CARBON_WORDS = ['碳', 'carbon', 'kgCO', 'CO₂'];

describe('guardData i18n 红线', () => {
  it('zh 的每个 guardData key 在 en 侧同样存在 (双语齐全)', () => {
    expect(guardDataKeys.length).toBeGreaterThan(10);
    for (const k of guardDataKeys) {
      expect(enKeys[k], `en missing profile.${k}`).toBeTruthy();
    }
  });

  it('确认/庆祝/降级文案非羞辱 (zh+en 均无 失败/浪费/黑历史 类词)', () => {
    for (const k of NON_SHAMING_KEYS) {
      for (const text of [zhKeys[k], enKeys[k]]) {
        for (const word of SHAMING_WORDS) {
          expect(text, `"${word}" 不应出现在 ${k}: ${text}`).not.toContain(word);
        }
      }
    }
  });

  it('金额只出现在知情提醒 (guardDataImpact*) 两个 key, 其余 guardData 面无货币符号', () => {
    const moneyRe = /[$¥£€]|\d+\s*(元|美元|dollars?)/i;
    for (const k of NON_SHAMING_KEYS) {
      expect(zhKeys[k], `zh ${k} 不应含金额`).not.toMatch(moneyRe);
      expect(enKeys[k], `en ${k} 不应含金额`).not.toMatch(moneyRe);
    }
    expect(zhKeys.guardDataImpactPrefix).toContain('$');
    expect(enKeys.guardDataImpactPrefix).toContain('$');
  });

  it('无碳足迹数值', () => {
    for (const k of guardDataKeys) {
      expect(zhKeys[k]).not.toMatch(new RegExp(CARBON_WORDS.join('|'), 'i'));
      expect(enKeys[k]).not.toMatch(new RegExp(CARBON_WORDS.join('|'), 'i'));
    }
  });

  it('组件源码新 key 无 defaultValue 兜底', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/profile/sections/guard-data-management-setting.tsx'),
      'utf8',
    );
    expect(source).not.toContain('defaultValue');
  });
});
