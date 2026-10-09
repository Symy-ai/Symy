// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BuddyAmbientBackground } from '../buddy-ambient-background';

const top = () => (document.querySelectorAll('.animate-pulse')[0] as HTMLElement).className;
const bottom = () => (document.querySelectorAll('.animate-pulse')[1] as HTMLElement).className;

/**
 * buddy-ambient-background.tsx (28行) — 环境光双晕 (Wave 1 搬运件)。
 *
 * 锁定:
 * - 五健康态色映射 (thriving/healthy/weak/critical/未知灰)
 * - pointer-events-none (非交互)
 * - 双晕 (顶+底), 底部延迟 2s
 */
describe('BuddyAmbientBackground 五态环境光', () => {
  afterEach(() => cleanup());

  it('五态色映射 (顶部晕)', () => {
    const cases: Array<[string, string]> = [
      ['thriving', 'bg-green-500/10'],
      ['healthy', 'bg-emerald-500/8'],
      ['weak', 'bg-yellow-500/8'],
      ['critical', 'bg-red-500/8'],
      ['unknown_x', 'bg-gray-700/8'], // 未知兜底
    ];
    for (const [health, cls] of cases) {
      render(<BuddyAmbientBackground health={health as never} />);
      expect(top()).toContain(cls);
      cleanup();
    }
  });

  it('底部晕同步换色 + 延迟 2s', () => {
    render(<BuddyAmbientBackground health="thriving" />);
    expect(bottom()).toContain('bg-cyan-500/8');
    const el = document.querySelectorAll('.animate-pulse')[1] as HTMLElement;
    expect(el.style.animationDelay).toBe('2s');
  });

  it('pointer-events-none 非交互容器', () => {
    render(<BuddyAmbientBackground health="healthy" />);
    expect((document.querySelector('.absolute.inset-0') as HTMLElement).className).toContain('pointer-events-none');
  });
});
