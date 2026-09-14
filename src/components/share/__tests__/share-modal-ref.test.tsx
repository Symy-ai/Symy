/**
 * ShareModal invite attribution tests (batch8-c)
 *
 * 验证各模板统一附带 ref 链接, 且 refCode 获取失败绝不阻塞分享主流程。
 */
// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ShareModal } from '../share-modal';
import type { BadgeCardData, ChallengeCardData } from '../card-templates';
import type { InterceptMedalData } from '@/types/intercept-medal';

const toPngMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = params?.defaultValue ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          if (name !== 'defaultValue') result = result.replace(`{${name}}`, String(value));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

vi.mock('@/lib/format', () => ({ formatCurrency: (amount: number) => `$${amount.toFixed(0)}` }));

const medal: InterceptMedalData = {
  itemTitle: 'Air Fryer',
  savedCents: 8900,
  date: '2026-09-05T10:00:00Z',
};

const badgeCard: BadgeCardData = {
  badge: {
    id: 'green_guardian_10',
    emoji: '🌿',
    color: '',
    unlockConditionKey: '',
    progressTarget: 10,
    progressType: 'challenge_wins',
    group: 'guardian',
  },
  progressValue: 12,
};

const challengeCard: ChallengeCardData = {
  challenge: {
    id: 'daily_green_gate',
    period: 'daily',
    titleKey: '',
    descKey: '',
    doneTitleKey: '',
    progressSource: 'today_see_it',
    target: 1,
    rewardBadgeId: 'impulse_shield',
  },
};

async function shareSelected() {
  fireEvent.click(await screen.findByText('Share'));
}

function mockShare() {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  return share;
}

describe('ShareModal invite attribution', () => {
  beforeEach(() => {
    toPngMock.mockReset().mockResolvedValue('data:image/png;base64,AAA');
    apiFetchMock.mockReset().mockImplementation((url: string) => Promise.resolve(url === '/api/invite/link' ? { refCode: 'friend01' } : { totalSaw: 26, totalPassed: 23, totalFailed: 3 }));
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, origin: 'https://symy.ai' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares url and appends the same link to text when refCode exists', async () => {
    const share = mockShare();
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/invite/link'));
    await shareSelected();
    await waitFor(() => expect(share).toHaveBeenCalled());

    const payload = share.mock.calls[0][0] as { text: string; url: string };
    const url = 'https://symy.ai/?ref=friend01';
    expect(payload.url).toBe(url);
    expect(payload.text.endsWith(`\n${url}`)).toBe(true);
    expect(payload.text.startsWith('I skipped an impulse buy and won back')).toBe(true);
  });

  it('silently shares without a link when invite lookup fails', async () => {
    apiFetchMock.mockImplementation((url: string) => url === '/api/invite/link' ? Promise.reject(new Error('offline')) : Promise.resolve({ totalSaw: 26, totalPassed: 23, totalFailed: 3 }));
    const share = mockShare();
    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/invite/link'));
    await shareSelected();

    const payload = await waitFor(() => {
      const value = share.mock.calls[0]?.[0] as { text: string; url?: string } | undefined;
      if (!value) throw new Error('share not called');
      return value;
    });
    expect(payload.url).toBeUndefined();
    expect(payload.text).not.toContain('?ref=');
  });

  it('keeps each template copy intact before the appended link', async () => {
    const share = mockShare();
    const cases = [
      { initialTemplate: 'streak' as const, props: { streakDays: 0 }, prefix: 'My green streak starts today' },
      { initialTemplate: 'streak' as const, props: { streakDays: 4 }, prefix: 'My green streak is alive' },
      { initialTemplate: 'milestone' as const, props: { interceptCount: 9 }, prefix: 'Guard #9' },
      { initialTemplate: 'badge' as const, props: { badgeCard }, prefix: 'The Green Guardian 10 honor is unlocked' },
      { initialTemplate: 'challenge' as const, props: { challengeCard }, prefix: 'Challenge complete' },
      { initialTemplate: 'weekly' as const, props: { weeklyCard: { guardDays: 5, intercepts: 3, streakDays: 2, savedHours: 12 } }, prefix: '5 days guarded this week' },
    ];

    for (const testCase of cases) {
      share.mockClear();
      apiFetchMock.mockClear();
      const { unmount } = render(
        <ShareModal
          open
          onClose={vi.fn()}
          medal={medal}
          initialTemplate={testCase.initialTemplate}
          {...testCase.props}
        />
      );
      await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/invite/link'));
      await shareSelected();
      const payload = await waitFor(() => {
        const value = share.mock.calls[0]?.[0] as { text: string } | undefined;
        if (!value) throw new Error('share not called');
        return value;
      });
      expect(
        payload.text.startsWith(testCase.prefix),
        `copy: ${payload.text}`
      ).toBe(true);
      expect(payload.text.endsWith('\nhttps://symy.ai/?ref=friend01')).toBe(true);
      unmount();
    }
  });

  it('falls back to download when navigator.share is unavailable', async () => {
    const clicks: string[] = [];
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const element = Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag), {
          click: () => clicks.push(tag),
        });
        return element as HTMLElement;
      });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });

    render(<ShareModal open onClose={vi.fn()} medal={medal} streakDays={3} />);
    await shareSelected();

    await waitFor(() => expect(clicks).toContain('a'));
    createElement.mockRestore();
  });
});
