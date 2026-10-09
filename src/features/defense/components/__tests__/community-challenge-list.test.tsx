// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../community-challenge-card', () => ({
  CommunityChallengeCard: vi.fn((props: { challenge: { id: string; title: string }; actionLoading: boolean; isDemo: boolean }) => (
    <div data-testid={`card-${props.challenge.id}`} data-loading={String(props.actionLoading)} data-demo={String(props.isDemo)}>
      card:{props.challenge.title}
    </div>
  )),
}));

import { CommunityChallengeList } from '../community-challenge-list';

const t = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'inward.challengesTitle': '社区挑战',
    'defense.noChallenges': '本周暂无进行中的挑战, 过几天再来看看!',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

const challenges = [
  { id: 'c1', title: '一周不外卖' },
  { id: 'c2', title: '三天不剁手' },
] as never[];

/**
 * community-challenge-list.tsx (72行) — 社区挑战列表三态。
 *
 * 锁定:
 * - loading → 双骨架 + animate-pulse
 * - 空列表 → 诚实空态文案
 * - 有数据 → 逐卡编排 (key=id, props 透传)
 */
describe('CommunityChallengeList 三态', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('loading → 双骨架 + pulse', () => {
    render(<CommunityChallengeList challenges={[]} isLoading isDemo={false} onJoin={vi.fn()} onCheckin={vi.fn()} actionLoading={false} t={t} />);
    expect(screen.getByText('社区挑战')).toBeTruthy();
    const skeletons = document.querySelectorAll('.animate-pulse > div');
    expect(skeletons).toHaveLength(2);
  });

  it('空列表 → 诚实空态', () => {
    render(<CommunityChallengeList challenges={[]} isLoading={false} isDemo={false} onJoin={vi.fn()} onCheckin={vi.fn()} actionLoading={false} t={t} />);
    expect(screen.getByText('本周暂无进行中的挑战, 过几天再来看看!')).toBeTruthy();
  });

  it('有数据 → 逐卡编排 (key=id + props 透传)', () => {
    render(<CommunityChallengeList challenges={challenges} isLoading={false} isDemo actionLoading onJoin={vi.fn()} onCheckin={vi.fn()} t={t} />);
    expect(screen.getByTestId('card-c1').textContent).toBe('card:一周不外卖');
    expect(screen.getByTestId('card-c2').textContent).toBe('card:三天不剁手');
    expect(screen.getByTestId('card-c1').getAttribute('data-loading')).toBe('true');
    expect(screen.getByTestId('card-c1').getAttribute('data-demo')).toBe('true');
  });
});
