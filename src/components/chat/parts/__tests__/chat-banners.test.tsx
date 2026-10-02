// @vitest-environment happy-dom
// chat-banners — 挑战横幅四按钮 + 「买了」内联确认条（此前 0 测试）
// 这是 e2e 挑战链的 UI 面（QA11 取证过真实形态）。
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const t = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'chat.challengeBannerTitle': '拦截进行中',
    'demo.quickReplies.resisted': '我守住门，没买',
    'demo.quickReplies.dontNeed': '其实我不需要',
    'demo.quickReplies.boughtIt': '我买了',
    'demo.quickReplies.boughtImpulse': '被诱导买了，本象陪你想办法',
    'chat.challengeBuyConfirm': '确定？',
    'chat.challengeBuyConfirmYes': '确定',
    'chat.challengeBuyConfirmNo': '再陪我看一看',
    'chat.challengeDesc': '描述文案',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t }),
}));

import { ChatBanners } from '../chat-banners';

const challenge = {
  id: 'ch-1',
  itemName: '空气炸锅',
  amount: 88,
  platform: 'taobao',
};

function renderBanner(overrides: Record<string, unknown> = {}) {
  const onGiveUp = vi.fn();
  const onChooseToBuy = vi.fn();
  const onResume = vi.fn();
  const onDismiss = vi.fn();
  const utils = render(
    <ChatBanners
      activeChallenge={challenge as never}
      expiredChallenge={null}
      onGiveUp={onGiveUp}
      onChooseToBuy={onChooseToBuy}
      onResume={onResume}
      onDismiss={onDismiss}
      isLoading={false}
      {...overrides}
    />,
  );
  return { onGiveUp, onChooseToBuy, onResume, onDismiss, ...utils };
}

describe('ActiveChallengeBanner — 挑战横幅', () => {
  it('四细粒度决策按钮齐全（守住/不需要/买了/被诱导）', () => {
    renderBanner();
    expect(screen.getByText(/我守住门，没买/)).toBeTruthy();
    expect(screen.getByText(/其实我不需要/)).toBeTruthy();
    expect(screen.getByText(/我买了/)).toBeTruthy();
    expect(screen.getByText(/被诱导买了/)).toBeTruthy();
  });

  it('点「我买了」→ 内联确认条出现（确定？+确定+再陪我看一看）', () => {
    renderBanner();
    fireEvent.click(screen.getByText(/我买了/));
    expect(screen.getByText(/确定？/)).toBeTruthy();
    expect(screen.getByText('确定')).toBeTruthy();
    expect(screen.getByText('再陪我看一看')).toBeTruthy();
  });

  it('确认条点「再陪我看一看」→ 收起, 不触发 onChooseToBuy', () => {
    const { onChooseToBuy } = renderBanner();
    fireEvent.click(screen.getByText(/我买了/));
    fireEvent.click(screen.getByText('再陪我看一看'));
    expect(screen.queryByText(/确定？/)).toBeNull();
    expect(onChooseToBuy).not.toHaveBeenCalled();
  });

  it('确认条点「确定」→ onChooseToBuy 收到当前挑战', () => {
    const { onChooseToBuy } = renderBanner();
    fireEvent.click(screen.getByText(/我买了/));
    fireEvent.click(screen.getByText('确定'));
    expect(onChooseToBuy).toHaveBeenCalledTimes(1);
    expect(onChooseToBuy).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch-1' }));
  });

  it('isLoading 时按钮禁用', () => {
    renderBanner({ isLoading: true });
    const buy = screen.getByText(/我买了/).closest('button');
    expect(buy?.hasAttribute('disabled')).toBe(true);
  });
});
