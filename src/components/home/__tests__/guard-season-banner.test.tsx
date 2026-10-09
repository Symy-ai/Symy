// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'home.guardSeason.demoDesc': 'Symy 一直在这里, 安静地陪着。',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { GuardSeasonBanner } from '../guard-season-banner';
import type { GuardSeasonDef } from '@/lib/guard-season';

const season: GuardSeasonDef = { id: 'double11' } as unknown as GuardSeasonDef;

/**
 * guard-season-banner.tsx (57行) — 守护季横幅 (纯叙事)。
 *
 * 锁定:
 * - season 空 → null
 * - isDemo → demo 叙事文案 (quietly, 非 scarcity)
 * - 正式态: title/desc 走 home.guardSeason.{id}.* key; 未入词表 → id 兜底 (下划线转空格)
 * - 反 FOMO 铁律: 文案不含 倒计时/仅剩/最后/错过
 */
describe('GuardSeasonBanner 守护季横幅', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('season 空 → null', () => {
    const { container } = render(<GuardSeasonBanner season={null as unknown as GuardSeasonDef} />);
    expect(container.innerHTML).toBe('');
  });

  it('isDemo → demo 叙事', () => {
    render(<GuardSeasonBanner season={season} isDemo />);
    expect(screen.getByTestId('guard-season-banner')).toBeTruthy();
    expect(screen.getByText('Symy 一直在这里, 安静地陪着。')).toBeTruthy();
    // demo title: t map 无 key → defaultValue = id 下划线转空格
    expect(screen.getByText('double11')).toBeTruthy();
  });

  it('正式态: id 兜底 (词表未覆盖时不空框)', () => {
    render(<GuardSeasonBanner season={season} />);
    expect(screen.getByText('double11')).toBeTruthy(); // title 兜底
    // desc defaultValue='' → 渲染空 p (诚实空, 不露 key)
    expect(screen.queryByText(/guardSeason/)).toBeNull();
  });

  it('反 FOMO 铁律: 输出不含 scarcity 词', () => {
    render(<GuardSeasonBanner season={season} />);
    const text = screen.getByTestId('guard-season-banner').textContent ?? '';
    for (const bad of ['倒计时', '仅剩', '最后', '错过', 'countdown', 'last chance']) {
      expect(text).not.toContain(bad);
    }
  });
});
