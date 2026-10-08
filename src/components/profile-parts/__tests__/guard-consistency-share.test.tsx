// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; category?: string }) => {
      const map: Record<string, string> = {
        'profile.guardMatrix.share.pill': '守护画像',
        'profile.guardMatrix.titleSteadiest': '最稳的域',
        'profile.guardMatrix.titleNeedsCare': '值得陪伴',
        'profile.guardMatrix.needsCareLine': '「{category}」还值得多陪陪',
        'profile.guardMatrix.share.actionsLabel': '次守护',
        'profile.guardMatrix.share.daysLabel': '天',
        'share.interceptMedal.brandTagline': 'Symy · 与你一起守住每个选择',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts?.category) v = v.replace('{category}', opts.category);
      return v;
    },
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { GuardConsistencyShareFace } from '../guard-consistency-share';

const baseData = {
  rows: [
    { label: '数码', actions: 12, activeDays: 5, title: 'steadiest' as const },
    { label: '服饰', actions: 8, activeDays: 3, title: null },
  ],
  steadiestLabel: '数码',
  needsCareLabel: '美妆',
  totalActions: 20,
  activeDays: 9,
};

/**
 * guard-consistency-share.tsx (145行) — 守护画像分享卡面 (batch63-b)。
 *
 * 红线: 分享面类型级零金额 (GuardConsistencyShareData 无金额字段)。
 *
 * 锁定:
 * - 最稳域主角 (steadiestLabel 缺省 —)
 * - needsCare 行条件渲染
 * - rows: 品类+次数+天数+称号 (title null 无称号)
 * - 双大数字 (totalActions/activeDays)
 */
describe('GuardConsistencyShareFace 分享卡面', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('最稳域主角 + needsCare 陪伴行', () => {
    render(<GuardConsistencyShareFace data={baseData} />);
    expect(screen.getByTestId('guard-consistency-share-steadiest').textContent).toBe('数码');
    expect(screen.getByTestId('guard-consistency-share-needs-care').textContent).toContain('美妆');
  });

  it('steadiestLabel null → 破折号; needsCare null → 不渲染', () => {
    render(<GuardConsistencyShareFace data={{ ...baseData, steadiestLabel: null, needsCareLabel: null }} />);
    expect(screen.getByTestId('guard-consistency-share-steadiest').textContent).toBe('—');
    expect(screen.queryByTestId('guard-consistency-share-needs-care')).toBeNull();
  });

  it('rows 渲染: 品类名+次数+天数; title null 行无称号', () => {
    render(<GuardConsistencyShareFace data={baseData} />);
    const rows = screen.getByTestId('guard-consistency-share-rows');
    expect(rows.textContent).toContain('数码');
    expect(rows.textContent).toContain('12 次守护');
    expect(rows.textContent).toContain('5 天');
    expect(rows.textContent).toContain('服饰');
    // steadiest 称号出现一次 (行内)
    expect(rows.textContent).toContain('最稳的域');
  });

  it('双大数字: totalActions=20 / activeDays=9', () => {
    render(<GuardConsistencyShareFace data={baseData} />);
    const stats = screen.getByTestId('guard-consistency-share-stats');
    expect(stats.textContent).toContain('20');
    expect(stats.textContent).toContain('9');
  });

  it('卡片面 testid 存在 (html-to-image 导出锚)', () => {
    render(<GuardConsistencyShareFace data={baseData} />);
    expect(screen.getByTestId('guard-consistency-share-face')).toBeTruthy();
  });
});
