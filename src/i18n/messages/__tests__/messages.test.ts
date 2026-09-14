import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

function keys(value: unknown, prefix = ''): string[] {
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child) ? keys(child, path) : [path];
  });
}

describe('chat product i18n', () => {
  it('keeps en and zh keys symmetric', () => {
    const english = new Set(keys(en));
    const chinese = new Set(keys(zh));
    expect([...english].filter((key) => !chinese.has(key))).toEqual([]);
    expect([...chinese].filter((key) => !english.has(key))).toEqual([]);
  });

  it('defines all product card copy', () => {
    for (const key of ['buy', 'addToCart', 'addedToCart', 'addFailed', 'favorite', 'unfavorite', 'soldOut', 'adultsOnly']) {
      expect((en.chat.products as Record<string, unknown>)[key]).toBeTruthy();
      expect((zh.chat.products as Record<string, unknown>)[key]).toBeTruthy();
    }
  });
});

describe('onboarding green guardian narrative i18n', () => {
  // 沿点路径取嵌套值: pick(en.onboarding, 'steps.welcome.title')
  function pick(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>(
      (node, segment) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined),
      root,
    );
  }

  const stepIds = ['welcome', 'buddy', 'seeIt', 'dreamFunds', 'complete'] as const;

  it('defines title + description for all 5 steps in both locales', () => {
    for (const step of stepIds) {
      for (const field of ['title', 'description']) {
        const path = `steps.${step}.${field}`;
        expect(pick(en.onboarding, path), `en ${path}`).toBeTruthy();
        expect(pick(zh.onboarding, path), `zh ${path}`).toBeTruthy();
      }
    }
  });

  it('defines the first-gate ritual keys and the rookie badge title copy', () => {
    for (const path of ['firstGateTitle', 'firstGateHint', 'firstGateItemGoal']) {
      expect(pick(en.onboarding, path), `en ${path}`).toBeTruthy();
      expect(pick(zh.onboarding, path), `zh ${path}`).toBeTruthy();
    }
    // onboarding-guide 渲染 t('onboarding.badge.name') 作为纯展示称号 (零 DB 写入,
    // 真实徽章走 badges 体系); architecture-guards 的 t() key 完整性检查要求
    // 该 key 必须双语存在, 故此处断言其值而非幽灵缺失
    expect(pick(en.onboarding, 'badge.name')).toBe('Green Guardian Rookie');
    expect(pick(zh.onboarding, 'badge.name')).toBe('绿色守护新手');
  });

  it('keeps retired money-first step keys deleted (no dead keys)', () => {
    const retired = [
      'steps.chat',
      'steps.suggestedGoals',
      'steps.insights',
      'steps.profile',
      'steps.defense',
      'title',
      'desc',
    ];
    for (const path of retired) {
      expect(pick(en.onboarding, path), `en ${path} should stay deleted`).toBeUndefined();
      expect(pick(zh.onboarding, path), `zh ${path} should stay deleted`).toBeUndefined();
    }
  });

  it('keeps retired first-screen mirror-era phrases out of both locales', () => {
    const retiredPhrases = [
      'Sign up to save your seeing',
      'Start your seeing',
      'The mirror heard it',
      'The mirror just shows what\'s there',
      "The mirror doesn't judge",
      'How much life?',
      'Let Symy show me',
    ];

    for (const [locale, dict] of [['en', en], ['zh', zh]] as const) {
      const values = JSON.stringify({
        ahaMoment: dict.ahaMoment,
        authPrompt: dict.authPrompt,
        demo: dict.demo,
      });
      for (const phrase of retiredPhrases) {
        expect(values, `${locale} revives retired phrase: ${phrase}`).not.toContain(phrase);
      }
    }
  });
});
