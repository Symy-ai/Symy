/**
 * WelcomeBackOverlay 回归欢迎视觉叙事守卫 (batch28-c)
 *
 * 这组测试防回归:
 *   - 文案: 无 shame 词 (断/清零/可惜/失败了/0天/坚持), 英文无 streak/re-start/reset/count 等字
 *   - 结构: 小象/段位/自由小时/CTA 四行结构, 段位可选
 *   - 行为: CTA 点击后调用 onNavigateChat, 点击背景调用 onClose, fade-out ~400ms
 *   - i18n: zh + en welcomeBack.* 齐全
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { WelcomeBackOverlay } from '../welcome-back-overlay';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';

const messages = { zh, en };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="zh" messages={messages.zh}>
    {children}
  </NextIntlClientProvider>
);

describe('WelcomeBackOverlay', () => {
  const baseProps = {
    totalSaved: 1337,
    hourlyRate: 25,
    onClose: vi.fn(),
    onNavigateChat: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ 文案羞耻守卫 ============
  describe('no-shame word guards', () => {
    const SHAME_WORDS = /断|清零|可惜|失败|0天|坚持|重置|重新开始计数|streak|countdown|restart counting|you failed|0 days/i;

    it('zh.json welcomeBack.* keys contain no shame words', () => {
      const block = (zh as Record<string, unknown>).welcomeBack as Record<string, string>;
      for (const [key, value] of Object.entries(block)) {
        expect(value, `zh.${key}`).not.toMatch(SHAME_WORDS);
      }
    });

    it('en.json welcomeBack.* keys contain no shame words', () => {
      const block = (en as Record<string, unknown>).welcomeBack as Record<string, string>;
      for (const [key, value] of Object.entries(block)) {
        expect(value, `en.${key}`).not.toMatch(SHAME_WORDS);
      }
    });
  });

  // ============ 渲染结构 ============
  describe('render structure', () => {
    it('renders eyebrow + subtitle + ledger + CTA', async () => {
      render(<WelcomeBackOverlay {...baseProps} />, { wrapper });
      await waitFor(() => screen.getByText('好久不见'));
      expect(screen.getByText(/守护还在记着/)).toBeDefined();
      expect(screen.getByText(/自由小时/)).toBeDefined();
      expect(screen.getByText('重新出发，先守护一笔')).toBeDefined();
    });

    it('renders rank row when guardRankStats provided', async () => {
      render(
        <WelcomeBackOverlay
          {...baseProps}
          guardRankStats={{ totalIntercepts: 12, streakDays: 7, badgesUnlocked: 2 }}
        />,
        { wrapper },
      );
      await waitFor(() => screen.getByText(/守护者段位还在/));
    });

    it('omits rank row when guardRankStats omitted', async () => {
      render(<WelcomeBackOverlay {...baseProps} />, { wrapper });
      await waitFor(() => screen.queryByText(/守护者段位还在/));
      expect(screen.queryByText(/守护者段位还在/)).toBeNull();
    });
  });

  // ============ 交互 ============
  describe('interactions', () => {
    it('calls onClose when background clicked', async () => {
      render(<WelcomeBackOverlay {...baseProps} />, { wrapper });
      await waitFor(() => screen.getByText('好久不见'));
      const overlay = screen.getAllByRole('button')[0];
      overlay.click();
      await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1), { timeout: 2000 });
    });

    it('calls onNavigateChat when CTA clicked', async () => {
      render(<WelcomeBackOverlay {...baseProps} />, { wrapper });
      await waitFor(() => screen.getByText('重新出发，先守护一笔'));
      screen.getByText('重新出发，先守护一笔').click();
      expect(baseProps.onNavigateChat).toHaveBeenCalledTimes(1);
    });
  });

  // ============ 自由小时换算 ============
  describe('freedom hours', () => {
    it('converts totalSaved + hourlyRate into hours label', async () => {
      render(<WelcomeBackOverlay {...baseProps} totalSaved={500} hourlyRate={25} />, { wrapper });
      await waitFor(() => screen.getByText(/自由小时/));
      // 500 / 25 = 20.0 hours
      expect(screen.getByText(/20/)).toBeDefined();
    });
  });
});
