// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'chat.commitment.share.pill': '绿色承诺达成',
        'chat.commitment.share.headlineLabel': '我说到做到',
        'chat.commitment.share.headline': '这 30 天, 我说到做到。',
        'chat.commitment.share.daysLabel': '天承诺',
        'chat.commitment.share.assistsLabel': '次守护助攻',
        'share.interceptMedal.brandTagline': 'Symy · 与你一起守住每个选择',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { CommitmentShareFace } from '../commitment-share';

const baseData = { days: 30, assistCount: 17 };

/**
 * commitment-share.tsx (102行) — 绿色承诺达成分享卡面 (batch53-a)。
 *
 * 红线: 类型级零金额 (CommitmentShareData 无 amount 字段)。
 *
 * 锁定:
 * - 承诺勋章标 + 达成宣言
 * - 双数字面板 (天数/助攻)
 * - 卡面 testid 导出锚 + 品牌标语
 */
describe('CommitmentShareFace 承诺分享卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('勋章标 + 达成宣言', () => {
    render(<CommitmentShareFace data={baseData} />);
    expect(screen.getByText('绿色承诺达成')).toBeTruthy();
    expect(screen.getByText('这 30 天, 我说到做到。')).toBeTruthy();
  });

  it('双数字面板: 30 天 + 17 助攻', () => {
    render(<CommitmentShareFace data={baseData} />);
    const stats = screen.getByTestId('commitment-share-stats');
    expect(stats.textContent).toContain('30');
    expect(stats.textContent).toContain('17');
    expect(stats.textContent).toContain('天承诺');
    expect(stats.textContent).toContain('次守护助攻');
  });

  it('卡面 testid 导出锚 + 品牌标语', () => {
    render(<CommitmentShareFace data={baseData} />);
    expect(screen.getByTestId('commitment-share-face')).toBeTruthy();
    expect(screen.getByText(/Symy · 与你一起守住每个选择/)).toBeTruthy();
  });
});
