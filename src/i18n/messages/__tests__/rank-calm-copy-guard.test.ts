/**
 * 段位差距文案平静陈述守卫 (batch106-c)
 *
 * 简报红线: 差距文案禁焦虑句式 (禁「还差/即将失去/快被超越」类), 用平静陈述
 * (「再守护 {count} 天成为 {title}」)。段位相关三个命名空间全量扫描:
 *   - defense.rank.*            守护林页段位行 (本批新增)
 *   - profile.guardRank.*       段位名 + nextHint 差距 (本批平静化改口)
 *   - profile.guardRankProgress.*  守护者之路进度卡
 * 词典为真源 (组件测试用 mock t), 本文件钉真实双语值。
 */
import { describe, expect, it } from 'vitest';
import en from '../en.json';
import zh from '../zh.json';

type Dict = Record<string, unknown>;

function flattenLeaves(node: Dict, prefix = ''): Record<string, string> {
  const leaves: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(leaves, flattenLeaves(value as Dict, path));
    } else {
      leaves[path] = String(value);
    }
  }
  return leaves;
}

function pick(root: Dict, path: string): Dict {
  const node = path.split('.').reduce<unknown>((acc, segment) => (acc && typeof acc === 'object' ? (acc as Dict)[segment] : undefined), root);
  if (!node || typeof node !== 'object') throw new Error(`missing i18n scope: ${path}`);
  return node as Dict;
}

const ZH_RANK = flattenLeaves(pick(zh, 'defense.rank'));
const EN_RANK = flattenLeaves(pick(en, 'defense.rank'));

const SCOPES: [string, Record<string, string>][] = [
  ['defense.rank', { ...ZH_RANK }],
  ['profile.guardRank', flattenLeaves(pick(zh, 'profile.guardRank'))],
  ['profile.guardRankProgress', flattenLeaves(pick(zh, 'profile.guardRankProgress'))],
];

// FOMO/损失框架禁词 — 平静陈述句式 (再…成为…) 是唯一允许的差距表达
const ZH_FORBIDDEN: RegExp[] = [/还差/, /即将/, /只剩/, /最后机会/, /错过/, /抓紧/, /限时/, /被超越/, /再不/];
const EN_FORBIDDEN: RegExp[] = [/\bonly\b/i, /about to (lose|be overtaken)/i, /last chance/i, /don'?t miss/i, /hurry/i, /running out/i];

describe('rank gap copy calm guard', () => {
  it('defines defense.rank.* with identical key sets in both locales', () => {
    expect(Object.keys(ZH_RANK).sort()).toEqual(Object.keys(EN_RANK).sort());
    expect(Object.keys(ZH_RANK).sort()).toEqual(['gapBadges', 'gapDays', 'gapIntercepts', 'topLine']);
  });

  it('keeps gap lines free of FOMO and loss-framing phrasing in zh', () => {
    for (const [scope, dict] of SCOPES) {
      for (const [key, text] of Object.entries(dict)) {
        for (const pattern of ZH_FORBIDDEN) {
          expect(text, `${scope}.${key} matches ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it('keeps gap lines free of FOMO and loss-framing phrasing in en', () => {
    const enScopes: [string, Record<string, string>][] = [
      ['defense.rank', EN_RANK],
      ['profile.guardRank', flattenLeaves(pick(en, 'profile.guardRank'))],
      ['profile.guardRankProgress', flattenLeaves(pick(en, 'profile.guardRankProgress'))],
    ];
    for (const [scope, dict] of enScopes) {
      for (const [key, text] of Object.entries(dict)) {
        for (const pattern of EN_FORBIDDEN) {
          expect(text, `${scope}.${key} matches ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it('keeps the {count}/{title} placeholder contract on gap keys in both locales', () => {
    for (const [key, text] of Object.entries({ ...ZH_RANK, ...EN_RANK })) {
      if (key.startsWith('gap')) {
        expect(text, `zh/en ${key} needs {count}`).toContain('{count}');
        expect(text, `zh/en ${key} needs {title}`).toContain('{title}');
      }
    }
    // 顶部段位行是平静致敬, 不带插值
    expect(ZH_RANK.topLine).not.toMatch(/\{/);
    expect(EN_RANK.topLine).not.toMatch(/\{/);
  });

  it('uses the calm 再…成为… statement shape for zh gap keys', () => {
    for (const key of ['gapIntercepts', 'gapDays', 'gapBadges']) {
      expect(ZH_RANK[key]).toMatch(/^再.+成为「\{title\}」$/);
    }
  });
});
