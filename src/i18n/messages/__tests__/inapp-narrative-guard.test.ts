import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

const IN_APP_SECTIONS = ['tabs', 'home', 'buddy', 'chat', 'profile', 'defense', 'family', 'butterfly'] as const;

const MIRROR_ERA_VOCAB = /mirror|🪞|reclaim/i;
const NARRATIVE_VOCABULARY_BLOCKLIST = /mirror|🪞|reclaim|seeing|Inward Circle|向内求|照见|魔镜/i;

const ANCHORS = {
  'tabs.chat': ['Chat', '💬 聊一聊'],
  'home.moneySaved': ['Hours won back', '赢回的时间'],
  'home.dailyGreenReclaimed': ['{hours} hours won back', '累计赢回 {hours} 小时'],
  'buddy.healthEventTypes.refund_boost': ['Refund won back', '退款找回'],
  'buddy.dreamFundsSubtitle': ['The money you guarded rests here', '你守护下来的钱，都在这里'],
  'chat.challengeCreatedAction': ['🐘 Guardian engaged', '🐘 守护开启'],
  'chat.silentMomentSawLine4': ['These are hours won back.', '这是赢回的时间。'],
  'profile.footerTagline': ['Buy less. Live more. Guard your choices with Symy.', '少买。多活。让 Symy 和你一起守护选择。'],
  'defense.hoursTogether': ['Won back together: {hours}', '共同赢回 {hours}'],
  'family.saved': ['Hours won back', '赢回的时间'],
  'butterfly.yourFutureUnlocked': ['Your What If story', '你的「如果呢」故事'],
} as const;

const RETIRED_PHRASES = [
  '🪞 Mirror',
  'Life reclaimed',
  'The mirror just shows what\'s there',
  'First Reclaim',
  'This is time reclaimed.',
  '🪞 小象已启动',
  '找回的生命',
  '首次找回',
  '这是找回来的时间。',
];

function leaves(value: unknown, prefix = ''): Array<{ key: string; value: string }> {
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ key: prefix, value: String(value) }];
}

function pick(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, segment) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined),
    root,
  );
}

describe('in-app guardian narrative i18n', () => {
  it('keeps every dictionary value free of retired narrative vocabulary', () => {
    for (const [locale, dict] of [['en', en], ['zh', zh]] as const) {
      for (const { key, value } of leaves(dict)) {
        expect(value, `${locale}.${key}`).not.toMatch(NARRATIVE_VOCABULARY_BLOCKLIST);
      }
    }
  });

  it.each([...IN_APP_SECTIONS])('keeps %s free of mirror-era vocabulary in both locales', (section) => {
    for (const dict of [en, zh]) {
      for (const { key, value } of leaves(dict[section])) {
        expect(value, `${section}.${key}`).not.toMatch(MIRROR_ERA_VOCAB);
      }
    }
  });

  it('locks the guardian and freedom-time anchor copy', () => {
    for (const [path, [english, chinese]] of Object.entries(ANCHORS)) {
      expect(pick(en, path), `en ${path}`).toBe(english);
      expect(pick(zh, path), `zh ${path}`).toBe(chinese);
    }
  });

  it('keeps retired mirror-era phrases out of every in-app section', () => {
    for (const dict of [en, zh]) {
      const values = JSON.stringify(Object.fromEntries(IN_APP_SECTIONS.map((section) => [section, dict[section]])));
      for (const phrase of RETIRED_PHRASES) {
        expect(values, `retired phrase revived: ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it('keeps Dream Funds on the money exemption while removing mirror philosophy', () => {
    expect(String(en.buddy.dreamFundsSubtitle)).not.toContain('hours');
    expect(String(zh.buddy.dreamFundsSubtitle)).not.toContain('小时');
    expect(String(en.buddy.moneySavedFliesHere)).not.toContain('hours');
    expect(String(zh.buddy.moneySavedFliesHere)).not.toContain('小时');
  });

  it('preserves the virtual-bookkeeping honesty disclosure', () => {
    expect(String(en.home.moneySavedDetail)).toContain('virtual bookkeeping, not real savings');
    expect(String(zh.home.moneySavedDetail)).toContain('虚拟记账，不是真实存款');
  });
});
