// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string) => (key === 'chat.products.greenIntentNote' ? '这次搜索本身就挺绿色的 🌱' : key);
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { GreenIntentNote } from '../green-intent-note';

/**
 * green-intent-note.tsx (22行) — 绿色意图轻引导 (反造假立场件)。
 *
 * 锁定:
 * - Sprout 图标 + emerald 绿文案
 * - 纯展示零 props (条件渲染由父级 queryHasGreenIntent 控制)
 * - 文案走 i18n key
 */
describe('GreenIntentNote 轻引导', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('Sprout+绿文案渲染', () => {
    render(<GreenIntentNote />);
    const p = screen.getByText('这次搜索本身就挺绿色的 🌱');
    expect(p.className).toContain('text-emerald-600');
    expect(p.querySelector('svg')).toBeTruthy(); // Sprout
  });

  it('纯展示零 props (父级控制出场)', () => {
    // 无 props 即可渲染 — 出场权在父 (queryHasGreenIntent), 组件只管展示
    const { container } = render(<GreenIntentNote />);
    expect(container.querySelector('p')).toBeTruthy();
    expect(container.querySelectorAll('button')).toHaveLength(0); // 无交互
  });
});
