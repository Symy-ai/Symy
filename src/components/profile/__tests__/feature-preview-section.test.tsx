// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => {
  const map: Record<string, string> = {
    'profile.whatYouGet': 'What you get',
    'profile.featurePreviews.impulseProtection.title': '冲动保护',
    'profile.featurePreviews.impulseProtection.description': '在冲动消费前拉住你',
    'profile.featurePreviews.companionHealth.title': '伙伴健康',
    'profile.featurePreviews.companionHealth.description': '小象与你共同成长',
    'profile.featurePreviews.smartRefunds.title': '智能退款',
    'profile.featurePreviews.smartRefunds.description': '符合条件的订单自动追踪',
  };
  return map[key] ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

const cardCalls: Array<{ title: string; description: string }> = [];
vi.mock('../profile-parts', () => ({
  FeaturePreviewCard: vi.fn((props: { title: string; description: string }) => {
    cardCalls.push({ title: props.title, description: props.description });
    return <div data-testid="fpc">{props.title}</div>;
  }),
}));

import { FeaturePreviewSection } from '../feature-preview-section';

/**
 * feature-preview-section.tsx (46行) — "What you get" 三卡 (ARCH 拆件, PM-#23 Sentence case)。
 *
 * 锁定:
 * - 标题 Sentence case (无 uppercase — PM-#23)
 * - 三卡按序: 冲动保护/伙伴健康/智能退款
 */
describe('FeaturePreviewSection 三卡', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cardCalls.length = 0;
  });
  afterEach(() => cleanup());

  it('标题 Sentence case (无 uppercase 类)', () => {
    render(<FeaturePreviewSection />);
    const h3 = screen.getByText('What you get');
    expect(h3.className).not.toContain('uppercase'); // PM-#23 锚
  });

  it('三卡按序 + 描述透传', () => {
    render(<FeaturePreviewSection />);
    expect(cardCalls.map((c) => c.title)).toEqual(['冲动保护', '伙伴健康', '智能退款']);
    expect(cardCalls[0].description).toBe('在冲动消费前拉住你');
    expect(cardCalls[2].description).toBe('符合条件的订单自动追踪');
  });
});
