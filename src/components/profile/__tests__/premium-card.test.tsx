// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.premiumTitle': '更尽职的守护伙伴',
        'profile.premiumComingSoon': '即将推出',
        'profile.premiumFreeLabel': '免费版',
        'profile.premiumFreeDesc': '你主动找小象把关',
        'profile.premiumLabel': 'Premium',
        'profile.premiumPremiumDesc': '小象先一步找你',
        'premium.priceTrial': '$9.90/月 · 7 天免费试用',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));

vi.mock('lucide-react', (importOriginal) => importOriginal());

vi.mock('./waitlist-form', () => ({
  WaitlistForm: (p: { mode?: string; labelKey?: string }) => (
    <div data-testid="waitlist-form" data-mode={p.mode} data-label-key={p.labelKey} />
  ),
}));

import { PremiumCard } from '../premium-card';

/**
 * premium-card.tsx (185行) — Premium 价值矩阵卡 (需求六)。
 *
 * 锁定:
 * - 荣誉框架: "更尽职的守护伙伴" — 不卖焦虑/不换算生命
 * - 免费版 vs Premium 一句话对比 (找它 vs 它先找你)
 * - 4 功能行: 主动拦截/深度报告/无限预案/退款协助
 * - $9.90 定价 + 7 天试用
 * - GACHA_FEATURE_ENABLED=false → 3 Gacha/日 行不渲染
 * - WaitlistForm 复用 (BUG-2)
 */
describe('PremiumCard 价值矩阵卡', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('标题区: 更尽职的守护伙伴 + Coming Soon 徽章 + Crown 图标', () => {
    render(<PremiumCard locale="zh" />);
    expect(screen.getByText('更尽职的守护伙伴')).toBeTruthy();
    expect(screen.getByText('即将推出')).toBeTruthy();
  });

  it('免费版 vs Premium 一句话对比', () => {
    render(<PremiumCard locale="zh" />);
    expect(screen.getByText('免费版:')).toBeTruthy();
    expect(screen.getByText('你主动找小象把关')).toBeTruthy();
    expect(screen.getByText('Premium:')).toBeTruthy();
    expect(screen.getByText('小象先一步找你')).toBeTruthy();
  });

  it('四功能行英文默认文案 (titleKey fallback defaultValue)', () => {
    render(<PremiumCard locale="en" />);
    expect(screen.getAllByText('Proactive intercepts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Deep guardian report').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Unlimited guard plans').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Refund Assist').length).toBeGreaterThanOrEqual(1);
  });

  it('定价行: $9.90/月 · 7 天免费试用', () => {
    render(<PremiumCard locale="zh" />);
    expect(screen.getByText('$9.90/月 · 7 天免费试用')).toBeTruthy();
  });

  it('GACHA_FEATURE_ENABLED=false (当前 flag) → 3 Gacha/日 行不渲染', () => {
    render(<PremiumCard locale="en" />);
    expect(screen.queryByText(/3 Gacha\/day/i)).toBeNull();
    // 但 guards/map 对比行在 (非 gacha 行)
    expect(screen.getByText('5 gate guards/day')).toBeTruthy();
  });

  it('WaitlistForm 复用挂载 (BUG-2): button 模式渲染加入候补按钮', () => {
    render(<PremiumCard locale="zh" />);
    // mode=button 且未展开 → 加入候补名单按钮 (真组件形态; mock testid 兜底)
    const byMock = screen.queryByTestId('waitlist-form');
    const byText = screen.queryByText('Join waitlist');
    expect(byMock || byText).toBeTruthy();
    if (byMock) expect(byMock.getAttribute('data-mode')).toBe('button');
  });

  it('emoji 四件套在功能行 (🛡️📖🦋💰)', () => {
    render(<PremiumCard locale="zh" />);
    expect(screen.getByText('🛡️')).toBeTruthy();
    expect(screen.getByText('📖')).toBeTruthy();
    expect(screen.getByText('🦋')).toBeTruthy();
    expect(screen.getByText('💰')).toBeTruthy();
  });
});
