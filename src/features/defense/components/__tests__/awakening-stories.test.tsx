// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'inward.storiesTitle': '守护者们的故事',
    'inward.storiesSubtitle': '真实守护, 真实自由',
    'awakeningStories.story1.title': '第一个故事',
    'awakeningStories.story2.title': '第二个故事',
    'awakeningStories.story3.title': '第三个故事',
    'inward.storiesTag1': '省下 ¥899',
    'inward.storiesMore': '读更多故事',
    'inward.storiesMoreComing': '更多故事即将上线 — 也许下一个就是你的!',
    'auth.signupCta': '注册加入',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'zh', t: stableT }),
}));

import { AwakeningStories } from '../awakening-stories';

/**
 * awakening-stories.tsx (87行) — 社群觉醒故事三卡。
 *
 * 锁定:
 * - 三故事卡渲染 (头像+标题+标签)
 * - 展开态切换: 按钮 → More coming + 注册 CTA (locale 链接)
 */
describe('AwakeningStories 觉醒故事', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('三故事卡渲染 (三 emoji + 标题 + 标签)', () => {
    render(<AwakeningStories />);
    expect(screen.getByText('🦊')).toBeTruthy();
    expect(screen.getByText('🌙')).toBeTruthy();
    expect(screen.getByText('🌊')).toBeTruthy();
    expect(screen.getByText('第一个故事')).toBeTruthy();
    expect(screen.getByText('第三个故事')).toBeTruthy();
    expect(screen.getByText('省下 ¥899')).toBeTruthy();
  });

  it('未展开: 仅「读更多」按钮, 无 CTA', () => {
    render(<AwakeningStories />);
    expect(screen.getByText('读更多故事')).toBeTruthy();
    expect(screen.queryByText(/更多故事即将上线/)).toBeNull();
  });

  it('点击展开 → More coming + 注册 CTA (zh 链接)', () => {
    render(<AwakeningStories />);
    fireEvent.click(screen.getByText('读更多故事'));
    expect(screen.getByText(/更多故事即将上线/)).toBeTruthy();
    const cta = screen.getByText('Be the first →').closest('a');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('/zh/signup');
  });
});
