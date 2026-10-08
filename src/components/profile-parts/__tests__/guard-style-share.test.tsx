// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.guardStyle.share.pill': '守护风格画像',
        'profile.guardStyle.share.styleLabel': '你的守护风格是',
        'profile.guardStyle.trackName.guard': '次守护',
        'profile.guardStyle.trackName.alt': '次绿色替代',
        'profile.guardStyle.trackName.reuse': '次复用',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { GuardStyleShareFace } from '../guard-style-share';

const baseData = {
  styleId: 'alt' as never,
  styleName: '替代派',
  verdict: '你总能找到更聪明的选法。',
  trackCounts: { guard: 12, alt: 34, reuse: 8 },
};

/**
 * guard-style-share.tsx (110行) — 守护风格画像分享卡面 (batch56-c)。
 *
 * 红线: 类型级零金额 (GuardStyleShareData 无 amount)。
 *
 * 锁定:
 * - 风格名主角 + 判词 (面子)
 * - 三轨次数 (guard/alt/reuse)
 * - 卡面 testid 导出锚
 */
describe('GuardStyleShareFace 风格画像分享卡', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('风格名 + 判词 + 三轨数字', () => {
    render(<GuardStyleShareFace data={baseData} />);
    expect(screen.getByText('替代派')).toBeTruthy();
    expect(screen.getByTestId('guard-style-share-verdict').textContent).toContain('更聪明');
    const stats = screen.getByTestId('guard-style-share-stats');
    expect(stats.textContent).toContain('12');
    expect(stats.textContent).toContain('34');
    expect(stats.textContent).toContain('8');
  });

  it('三轨标签齐全 (守护/绿色替代/复用)', () => {
    render(<GuardStyleShareFace data={baseData} />);
    const stats = screen.getByTestId('guard-style-share-stats');
    expect(stats.textContent).toContain('次守护');
    expect(stats.textContent).toContain('次绿色替代');
    expect(stats.textContent).toContain('次复用');
  });

  it('卡面 testid 导出锚', () => {
    render(<GuardStyleShareFace data={baseData} />);
    expect(screen.getByTestId('guard-style-share-face')).toBeTruthy();
  });
});
