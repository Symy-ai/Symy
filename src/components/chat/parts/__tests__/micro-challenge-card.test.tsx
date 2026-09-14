/* eslint-disable require-await -- test mocks use async for API consistency */
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MicroChallengeCard } from '../micro-challenge-card';
// 用真实 use-green-pref (共享状态 + localStorage), 走开关静默路径
import { _resetGreenPrefStateForTest, setGreenPrefEnabled } from '@/hooks/use-green-pref';
import {
  _resetMicroChallengeStoreForTest,
  getDueMicroChallenge,
  readMicroChallengeHistory,
} from '../micro-challenge-store';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'chat.microChallenge.title': 'A tiny 24-hour challenge',
        'chat.microChallenge.duration': '24h',
        'chat.microChallenge.accept': "I'm in",
        'chat.microChallenge.skip': 'Not today',
        'chat.microChallenge.acceptedNote': "It's a deal 🌱",
        'chat.microChallenge.body.clothing': 'Skip buying new clothes for 24h.',
        'chat.microChallenge.itemName.clothing': '24h micro challenge: no new clothes',
      })[key] || key,
  }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import type { MicroChallengeProposal } from '@/types/micro-challenge';

const proposal: MicroChallengeProposal = {
  category: 'clothing',
  titleKey: 'chat.microChallenge.body.clothing',
  durationHours: 24,
};

describe('MicroChallengeCard', () => {
  beforeEach(() => {
    setGreenPrefEnabled(true);
    apiFetchMock.mockReset();
    _resetMicroChallengeStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGreenPrefStateForTest();
    _resetMicroChallengeStoreForTest();
  });

  it('渲染标题/文案/时长, 中性 chat 卡底色 (非拦截深绿金)', () => {
    const { container } = render(<MicroChallengeCard proposal={proposal} />);
    expect(screen.getByText('A tiny 24-hour challenge')).toBeTruthy();
    expect(screen.getByText('Skip buying new clothes for 24h.')).toBeTruthy();
    expect(screen.getByText('24h')).toBeTruthy();
    // 展示即记频控锚点 (接受/跳过/忽略都算已发起)
    expect(readMicroChallengeHistory()).toEqual([
      expect.objectContaining({ category: 'clothing' }),
    ]);
    // 金额红线: 卡片不出现任何金额
    expect(container.textContent).not.toMatch(/\$|\¥|5/);
  });

  it('接受: 调现有挑战创建端点 + 写待回访记录 + 进已确认态', async () => {
    apiFetchMock.mockResolvedValueOnce({ challengeId: 'ch-1' });
    render(<MicroChallengeCard proposal={proposal} />);

    fireEvent.click(screen.getByTestId('micro-challenge-accept-button'));
    expect(await screen.findByTestId('micro-challenge-accepted-note')).toBeTruthy();
    expect(screen.queryByTestId('micro-challenge-accept-button')).toBeNull();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/challenge/create');
    expect(init.method).toBe('POST');
    expect(init.body).toEqual({
      itemName: '24h micro challenge: no new clothes',
      amount: 5,
    });

    // 待回访记录: 未到期不派发
    expect(getDueMicroChallenge(Date.now() + 25 * 60 * 60 * 1000)?.challengeId).toBe('ch-1');
    expect(getDueMicroChallenge(Date.now())).toBeNull();
  });

  it('跳过: 卡片温和收起, 零负面文案', () => {
    const { container } = render(<MicroChallengeCard proposal={proposal} />);
    fireEvent.click(screen.getByTestId('micro-challenge-skip-button'));
    expect(container.querySelector('[data-testid="micro-challenge-card"]')).toBeNull();
    // 频控标记已存 (展示时记录)
    expect(readMicroChallengeHistory().length).toBe(1);
  });

  it('绿色守护关闭: 整体静默不渲染', () => {
    setGreenPrefEnabled(false);
    const { container } = render(<MicroChallengeCard proposal={proposal} />);
    expect(container.querySelector('[data-testid="micro-challenge-card"]')).toBeNull();
  });
});
