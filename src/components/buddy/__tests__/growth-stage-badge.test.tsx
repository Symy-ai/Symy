// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'buddy.growthStage.baby': '幼芽',
    'buddy.growthStage.young': '少年',
    'buddy.growthStage.adult': '壮年',
    'buddy.growthStage.elder': '智者',
    'buddy.growthStageDesc.baby': '刚来到你身边',
    'buddy.growthStageDesc.elder': '陪你走过了很长的路',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { GrowthStageBadge } from '../growth-stage-badge';

/**
 * growth-stage-badge.tsx (46行) — 成长阶段徽标 (P1-5)。
 *
 * 锁定:
 * - 四阶段 emoji (🌱⭐✨🪷) + 阶段名
 * - 梯度绿系加深 (batch3-b: elder 终点 #143527)
 * - title=阶段说明 (hover tooltip)
 */
describe('GrowthStageBadge 成长阶段', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('四阶段 emoji+名', () => {
    const cases: Array<[string, string, string]> = [
      ['baby', '🌱', '幼芽'],
      ['young', '⭐', '少年'],
      ['adult', '✨', '壮年'],
      ['elder', '🪷', '智者'],
    ];
    for (const [stage, emoji, name] of cases) {
      render(<GrowthStageBadge growthStage={stage as never} />);
      expect(screen.getByText(emoji)).toBeTruthy();
      expect(screen.getByText(name)).toBeTruthy();
      cleanup();
    }
  });

  it('梯度绿系加深 (batch3-b): baby 浅绿 → elder 深绿', () => {
    const { unmount } = render(<GrowthStageBadge growthStage="baby" />);
    const baby = document.querySelector('.inline-flex') as HTMLElement;
    expect(baby.className).toContain('from-green-400/90');
    unmount();
    render(<GrowthStageBadge growthStage="elder" />);
    const elder = document.querySelector('.inline-flex') as HTMLElement;
    expect(elder.className).toContain('to-[#143527]/90'); // 松绿终点锚
  });

  it('title=阶段说明 (tooltip)', () => {
    render(<GrowthStageBadge growthStage="elder" />);
    expect((document.querySelector('.inline-flex') as HTMLElement).getAttribute('title')).toBe('陪你走过了很长的路');
  });

  it('pointer-events-none (非交互装饰)', () => {
    render(<GrowthStageBadge growthStage="baby" />);
    expect((document.querySelector('.inline-flex') as HTMLElement).className).toContain('pointer-events-none');
  });
});
