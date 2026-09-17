// @vitest-environment happy-dom

/**
 * InterceptMedalBanner 展示层 savedCents 守卫测试 (batch78-c — testgap v9 §十五.3, 纯测试)
 *
 * 背景: 上游 lib dispatchInterceptMedal 已有 dedup + savedCents≤0 守卫, 但 banner
 * 直接监听裸 CustomEvent (INTERCEPT_MEDAL_EVENT) 且展示层有独立守卫
 * (Number.isFinite(savedCents) && savedCents > 0) — 此前展示层无测。
 * 本文件绕过 lib 派发裸事件, 只测展示层守卫。
 *
 * 覆盖:
 *  - savedCents = 0 / 负数 / NaN / 字段缺失 → banner 不渲染 (data-testid 零命中)
 *  - savedCents > 0 对照组 → banner 正常渲染 (证明守卫生效不是事件没绑上)
 *  - 有效展示后再来一条 savedCents≤0 → banner 保留 (守卫语义 = 忽略非法事件,
 *    不清除既有勋章; banner 保持到用户手动关闭)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { InterceptMedalBanner } from '../intercept-medal-banner';
import { INTERCEPT_MEDAL_EVENT } from '@/lib/intercept-medal';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown> & { defaultValue?: string }) =>
      values?.defaultValue ?? key,
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 25,
    rateIsDefault: true,
    setHourlyRate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/components/share/share-modal', () => ({
  ShareModal: () => <div data-testid="share-modal-stub" />,
}));

vi.mock('@/components/chat/parts/intercept-reason-chip', () => ({
  InterceptReasonChip: () => <div data-testid="reason-chip-stub" />,
}));

/** 绕过 lib dispatchInterceptMedal 的守卫, 裸派发展示层监听的同一事件 */
function dispatchRawMedal(detail: unknown) {
  act(() => {
    window.dispatchEvent(new CustomEvent(INTERCEPT_MEDAL_EVENT, { detail }));
  });
}

function renderBanner() {
  return render(<InterceptMedalBanner streakDays={3} />);
}

function expectBannerHidden() {
  expect(screen.queryByTestId('intercept-medal-banner')).toBeNull();
  expect(screen.queryByTestId('show-off-medal-button')).toBeNull();
}

describe('InterceptMedalBanner 展示层 savedCents 守卫', () => {
  it.each([
    ['savedCents = 0', { itemTitle: 'Milk Tea', savedCents: 0 }],
    ['savedCents 负数', { itemTitle: 'Milk Tea', savedCents: -500 }],
    ['savedCents = NaN', { itemTitle: 'Milk Tea', savedCents: NaN }],
    ['savedCents 字段缺失', { itemTitle: 'Milk Tea' }],
  ])('%s → 不渲染 banner', (_label, detail) => {
    renderBanner();
    dispatchRawMedal(detail);
    expectBannerHidden();
  });

  it('detail 为 null → 不渲染 banner', () => {
    renderBanner();
    dispatchRawMedal(null);
    expectBannerHidden();
  });

  it('对照组: savedCents > 0 → banner 渲染 (含晒勋章入口)', () => {
    renderBanner();
    dispatchRawMedal({ itemTitle: 'Milk Tea', savedCents: 500 });
    expect(screen.getByTestId('intercept-medal-banner')).toBeTruthy();
    expect(screen.getByTestId('show-off-medal-button')).toBeTruthy();
  });

  it('有效展示后再来一条 savedCents≤0 → banner 保留 (忽略而非清除)', () => {
    renderBanner();
    dispatchRawMedal({ itemTitle: 'Milk Tea', savedCents: 500 });
    expect(screen.getByTestId('intercept-medal-banner')).toBeTruthy();

    dispatchRawMedal({ itemTitle: 'Sneak', savedCents: 0 });
    expect(screen.getByTestId('intercept-medal-banner')).toBeTruthy();
  });
});
