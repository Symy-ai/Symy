// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'buddy.personality.sage': '智者',
    'buddy.personality.playmate': '玩伴',
    'buddy.personality.guardian': '守护者',
    'buddy.personality.ascetic': '苦行者',
    'buddy.personalityDesc.sage': '它喜欢慢慢想清楚',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { PersonalityBadge } from '../personality-badge';

/**
 * personality-badge.tsx (51行) — 个性徽标 (P1-5)。
 *
 * 锁定:
 * - unknown → null (未觉醒不显示)
 * - 四个性 emoji+名+梯度
 * - title=说明 tooltip; pointer-events-none
 */
describe('PersonalityBadge 个性徽标', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('unknown → null', () => {
    const { container } = render(<PersonalityBadge personality="unknown" />);
    expect(container.innerHTML).toBe('');
  });

  it('四个性 emoji+名渲染 (梯度各异)', () => {
    const cases: Array<[string, string]> = [
      ['sage', '🧙'],
      ['playmate', '🎭'],
      ['guardian', '🛡️'],
      ['ascetic', '🧘'],
    ];
    for (const [p, emoji] of cases) {
      render(<PersonalityBadge personality={p as never} />);
      expect(screen.getByText(emoji)).toBeTruthy();
      expect(screen.getByText(emoji).closest('.inline-flex')).toBeTruthy();
      cleanup();
    }
  });

  it('title=说明 tooltip + pointer-events-none', () => {
    render(<PersonalityBadge personality="sage" />);
    const el = document.querySelector('.inline-flex') as HTMLElement;
    expect(el.getAttribute('title')).toBe('它喜欢慢慢想清楚');
    expect(el.className).toContain('pointer-events-none');
    expect(el.className).toContain('from-teal-600/90'); // sage 梯度
  });
});
