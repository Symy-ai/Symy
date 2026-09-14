/**
 * batch24-c tests — 守护战绩一图流分享卡 (guardian-stats-card)
 *
 * 覆盖矩阵:
 *  - 正常态: 金色等阶徽章 (emoji + 等阶名 + 段位) + 三统计横排 (拦截/守护天/赢回小时)
 *  - 零数据态: 不出 0/0/0 空表, 出「第一次守护」正面引导 (荣誉非羞耻铁律)
 *  - 双语: zh/en 用真实 messages json 渲染, 等阶名走既有 profile.guardRank.* 键
 *  - 面子/里子铁律: 卡面永无金额字符 (¥/$), savedHours 是唯一时间面子通道
 *  - isGuardianStatsEmpty 纯函数边界 + 小时格式化口径 (≥10 取整, <10 留 1 位)
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuardianStatsCard, isGuardianStatsEmpty } from '../guardian-stats-card';
import en from '../../../i18n/messages/en.json';
import zh from '../../../i18n/messages/zh.json';

// ===== i18n mock — 按 locale 读真实 json, 缺 key 原样返回 (测试能发现漏 key) =====
const i18nState = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const tree = (i18nState.locale === 'zh' ? zh : en) as unknown as Record<string, unknown>;
    const t = (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
      let cur: unknown = tree;
      for (const part of key.split('.')) {
        if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[part];
        } else {
          return values?.defaultValue ?? key;
        }
      }
      let out = typeof cur === 'string' ? cur : (values?.defaultValue ?? key);
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          if (k !== 'defaultValue') out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return out;
    };
    return { t, locale: i18nState.locale };
  },
}));

const RANK = { name: 'Companion Guardian', level: 2, emoji: '🤝' };

function msg(root: Record<string, unknown>, key: string): string {
  let cur: unknown = root;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      throw new Error(`missing i18n key: ${key}`);
    }
  }
  if (typeof cur !== 'string') throw new Error(`non-string i18n value: ${key}`);
  return cur;
}

beforeEach(() => {
  i18nState.locale = 'en';
});

describe('guardian stats card — normal state (face-only honor)', () => {
  it('renders rank badge + three stat cells, never money', () => {
    const { container } = render(
      <GuardianStatsCard guardRank={RANK} interceptCount={23} streakDays={12} savedHours={7.2} />
    );

    expect(screen.getByTestId('guardian-stats-card')).toBeTruthy();
    expect(screen.getByTestId('guardian-stats-rank').textContent).toContain('🤝');
    expect(screen.getByTestId('guardian-stats-rank').textContent).toContain('Companion Guardian');
    expect(screen.getByTestId('guardian-stats-rank').textContent).toContain('L2');

    const cells = screen.getAllByTestId('guardian-stats-cell');
    expect(cells.length).toBe(3);
    expect(cells[0].textContent).toContain('23');
    expect(cells[0].textContent).toContain(msg(en as unknown as Record<string, unknown>, 'share.guardianStats.stats.intercepts'));
    expect(cells[1].textContent).toContain('12');
    expect(cells[2].textContent).toContain('7.2'); // <10 保留 1 位

    // 空态引导不出现
    expect(screen.queryByTestId('guardian-stats-empty')).toBeNull();

    // 面子/里子铁律: 全卡无金额字符
    expect(container.textContent).not.toMatch(/[$¥€]/);
  });

  it('formats big hours as integers (same exaggeration-proof rule as other cards)', () => {
    render(<GuardianStatsCard guardRank={RANK} interceptCount={50} streakDays={30} savedHours={36.7} />);
    const cells = screen.getAllByTestId('guardian-stats-cell');
    expect(cells[2].textContent).toContain('37');
  });
});

describe('guardian stats card — zero-data guide state (honor, not shame)', () => {
  it('shows the first-guard guide instead of a 0/0/0 empty table', () => {
    const { container } = render(<GuardianStatsCard guardRank={RANK} interceptCount={0} streakDays={0} savedHours={0} />);

    expect(screen.getByTestId('guardian-stats-empty')).toBeTruthy();
    expect(screen.getByTestId('guardian-stats-empty').textContent).toContain(
      msg(en as unknown as Record<string, unknown>, 'share.guardianStats.empty.title')
    );
    expect(screen.getByTestId('guardian-stats-empty').textContent).toContain('🌱');
    // 不出 0/0/0 空表
    expect(screen.queryByTestId('guardian-stats-cell')).toBeNull();
    expect(screen.queryByTestId('guardian-stats-rank')).toBeNull();
    // 品牌尾仍在 (发图即邀请入口)
    expect(container.textContent).toContain('Symy');
    expect(container.textContent).not.toMatch(/[$¥€]/);
  });
});

describe('guardian stats card — bilingual copy (zh/en, existing guardRank keys only)', () => {
  const cases: Array<{ locale: 'en' | 'zh'; rankName: string; keys: string[] }> = [
    { locale: 'en', rankName: 'Companion Guardian', keys: ['share.guardianStats.title', 'share.guardianStats.stats.intercepts', 'share.guardianStats.stats.days', 'share.guardianStats.stats.hours'] },
    { locale: 'zh', rankName: '同行守护者', keys: ['share.guardianStats.title', 'share.guardianStats.stats.intercepts', 'share.guardianStats.stats.days', 'share.guardianStats.stats.hours'] },
  ];

  it('renders every card label from real message trees in both locales', () => {
    for (const c of cases) {
      i18nState.locale = c.locale;
      const tree = (c.locale === 'zh' ? zh : en) as unknown as Record<string, unknown>;
      const { container, unmount } = render(
        <GuardianStatsCard guardRank={{ ...RANK, name: c.rankName }} interceptCount={9} streakDays={4} savedHours={2} />
      );
      expect(screen.getByTestId('guardian-stats-rank').textContent).toContain(c.rankName);
      for (const key of c.keys) {
        expect(container.textContent).toContain(msg(tree, key));
      }
      // 等阶名只用既有 profile.guardRank.* 键 — zh 值必须来自既有键而非新造
      expect(msg(tree, 'profile.guardRank.companion')).toBeTruthy();
      unmount();
    }
  });

  it('empty guide copy exists in both locales', () => {
    for (const locale of ['en', 'zh'] as const) {
      i18nState.locale = locale;
      const tree = (locale === 'zh' ? zh : en) as unknown as Record<string, unknown>;
      const { unmount } = render(<GuardianStatsCard interceptCount={0} streakDays={0} />);
      expect(screen.getByTestId('guardian-stats-empty').textContent).toContain(msg(tree, 'share.guardianStats.empty.title'));
      expect(screen.getByTestId('guardian-stats-empty').textContent).toContain(msg(tree, 'share.guardianStats.empty.subtitle'));
      unmount();
    }
  });
});

describe('isGuardianStatsEmpty (pure fn)', () => {
  it('zero only when both intercepts and streak days are zero', () => {
    expect(isGuardianStatsEmpty(0, 0)).toBe(true);
    expect(isGuardianStatsEmpty(1, 0)).toBe(false);
    expect(isGuardianStatsEmpty(0, 1)).toBe(false);
    expect(isGuardianStatsEmpty(23, 12)).toBe(false);
    // 负数/小数防御 — 与卡内渲染同口径
    expect(isGuardianStatsEmpty(-3, 0)).toBe(true);
    expect(isGuardianStatsEmpty(0.4, 0)).toBe(true);
  });
});
