import { describe, expect, it } from 'vitest';

import type { GreenAlternativeEntry, GreenLocale, GreenAlternativeSuggestion } from '../green-alt-types';

/**
 * green-alt-types.ts (45行) — 绿色替代话术类型 (纯类型, 第九用)。
 *
 * 锁定:
 * - GreenLocale 双语
 * - Entry 七 Record<locale> 字段 (triggers/why/options/reuseChannel/alternative/reuse/savingsHint)
 * - Suggestion 平面投影 (id+六字段, message=alternative+reuse 拼接语义)
 */
describe('green-alt-types 纯类型件第九用', () => {
  it('GreenLocale 双语', () => {
    const locales: GreenLocale[] = ['zh', 'en'];
    expect(locales).toHaveLength(2);
  });

  it('Entry 七字段 satisfies 形状锚 (双语 Record 全覆盖)', () => {
    const entry: GreenAlternativeEntry = {
      id: 'silk_flowers',
      triggers: { zh: ['绢花', '假花'], en: ['artificial flowers', 'silk flowers'] },
      why: { zh: '绢花难以降解。', en: 'Silk flowers are hard to degrade.' },
      options: { zh: ['鲜花', '干花'], en: ['Fresh flowers', 'Dried flowers'] },
      reuseChannel: { zh: '闲鱼', en: 'Local swaps' },
      alternative: { zh: '试试鲜花或干花。', en: 'Try fresh or dried flowers.' },
      reuse: { zh: '你手头可能已有花瓶。', en: 'You may already own a vase.' },
      savingsHint: { zh: '省下 {hours} 小时', en: 'Saves {hours} hours' },
    } satisfies GreenAlternativeEntry;
    expect(entry.triggers.zh).toHaveLength(2);
    expect(entry.savingsHint.zh).toContain('{hours}'); // 占位符约定锚
    for (const key of ['why', 'options', 'reuseChannel', 'alternative', 'reuse', 'savingsHint'] as const) {
      expect(entry[key].zh).toBeTruthy();
      expect(entry[key].en).toBeTruthy(); // 双语全配
    }
  });

  it('Suggestion 平面投影 satisfies', () => {
    const s: GreenAlternativeSuggestion = {
      id: 'silk_flowers',
      alternative: '试试鲜花或干花。',
      reuse: '你手头可能已有花瓶。',
      message: '试试鲜花或干花。你手头可能已有花瓶。',
      why: '绢花难以降解。',
      options: ['鲜花', '干花'],
      reuseChannel: '闲鱼',
    } satisfies GreenAlternativeSuggestion;
    expect(s.message).toBe(`${s.alternative}${s.reuse}`); // 拼接语义锚
  });
});
