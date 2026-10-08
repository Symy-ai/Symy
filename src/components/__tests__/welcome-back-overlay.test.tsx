// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string; hours?: string }) => {
      const map: Record<string, string> = {
        'welcomeBack.eyebrow': '欢迎回来',
        'welcomeBack.subtitle': '小象一直在等你',
        'welcomeBack.rankStillThere': '你的守护段位还在',
        'welcomeBack.ledgerLine': '累计赢回 {hours} 自由时光',
        'welcomeBack.cta': '重新开始守护',
        'profile.guardRank.trainee': '见习守护者',
      };
      let v = map[key] ?? opts?.defaultValue ?? key;
      if (opts?.hours) v = v.replace('{hours}', opts.hours);
      return v;
    },
  }),
}));
vi.mock('@/lib/freedom-time', () => ({
  moneyToFreedomLabel: (v: number) => `${v}小时`,
}));

import { WelcomeBackOverlay } from '../welcome-back-overlay';

const baseProps = {
  totalSaved: 500,
  onClose: vi.fn(),
};

function renderUI(props: Partial<Parameters<typeof WelcomeBackOverlay>[0]> = {}) {
  return render(<WelcomeBackOverlay {...baseProps} {...props} />);
}

/**
 * welcome-back-overlay.tsx (143行) — 回归欢迎全屏 Portal。
 *
 * 锁定:
 * - 首帧 mounted 门 (SSR 安全)
 * - 面子/里子: 欢迎文案 + 自由小时换算行
 * - 段位行: 有 stats 渲染 emoji+名, 无 stats 不渲染
 * - CTA: 触发 onNavigateChat + 关闭链
 * - 遮罩点击 → 400ms 淡出后 onClose
 */
describe('WelcomeBackOverlay 回归欢迎时刻', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('挂载后渲染欢迎三要素 (eyebrow/subtitle/自由小时行)', () => {
    renderUI();
    expect(screen.getByText('欢迎回来')).toBeTruthy();
    expect(screen.getByText('小象一直在等你')).toBeTruthy();
    expect(screen.getByText('累计赢回 500小时 自由时光')).toBeTruthy();
  });

  it('段位行: 拦截 3+ → trainee emoji+名', () => {
    renderUI({ guardRankStats: { totalIntercepts: 3, streakDays: 0, badgesUnlocked: 0 } });
    expect(screen.getByText('你的守护段位还在')).toBeTruthy();
    expect(screen.getByText('见习守护者')).toBeTruthy();
  });

  it('无 stats → 段位行不渲染', () => {
    renderUI();
    expect(screen.queryByText('你的守护段位还在')).toBeNull();
  });

  it('CTA 点击 → onNavigateChat + onClose 链', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onNav = vi.fn();
    renderUI({ onNavigateChat: onNav });
    act(() => { fireEvent.click(screen.getByText('重新开始守护')); });
    expect(onNav).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(500); });
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('遮罩点击 → 400ms 后 onClose (淡出窗口)', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderUI();
    act(() => { fireEvent.click(screen.getAllByRole('button')[0]); }); // 遮罩 div 在前
    expect(baseProps.onClose).not.toHaveBeenCalled(); // 400ms 内未触发
    act(() => { vi.advanceTimersByTime(450); });
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('closed 后不再渲染', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderUI();
    act(() => { fireEvent.click(screen.getAllByRole('button')[0]); }); // 遮罩 div 在前
    act(() => { vi.advanceTimersByTime(450); });
    expect(screen.queryByText('欢迎回来')).toBeNull();
  });
});
