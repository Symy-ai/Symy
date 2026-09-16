// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InterceptMedalMoment } from '../intercept-medal-moment';
import { INTERCEPT_MEDAL_EVENT } from '@/lib/intercept-medal';
import type { InterceptMedalData } from '@/types/intercept-medal';

const toPngMock = vi.hoisted(() => vi.fn());
const shareModalRenderMock = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = values?.defaultValue ?? key;
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          if (name !== 'defaultValue') result = result.replace(`{${name}}`, String(value));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

vi.mock(import('@/lib/freedom-time'), async (importOriginal) => ({
  ...(await importOriginal()),
  moneyToFreedomLabel: () => '8.9 hours',
}));

vi.mock('@/lib/format', () => ({
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
}));

vi.mock('@/lib/html-to-image-loader', () => ({
  loadHtmlToImage: () => Promise.resolve({ toPng: toPngMock }),
}));

// 隔离网络 — 打开 ShareModal 会挂载即拉 stats/invite 两个接口, 真 fetch 悬挂到
// happy-dom teardown 会被 abort 成 unhandled AbortError; 组件自身捕获走降级路径
vi.mock('@/lib/api-client', () => ({ apiFetch: () => Promise.reject(new Error('skip in test')) }));

vi.mock('@/components/share/share-modal', async () => {
  const { ShareModal } = await vi.importActual<typeof import('@/components/share/share-modal')>(
    '@/components/share/share-modal',
  );
  return {
    ShareModal: (props: React.ComponentProps<typeof ShareModal>) => {
      shareModalRenderMock(props);
      return <ShareModal {...props} />;
    },
  };
});

const medal: InterceptMedalData = {
  itemTitle: 'Air Fryer',
  savedCents: 8900,
  date: '2026-09-05T10:00:00Z',
};

function dispatchMedal() {
  act(() => {
    window.dispatchEvent(new CustomEvent<InterceptMedalData>(INTERCEPT_MEDAL_EVENT, { detail: medal }));
  });
}

describe('InterceptMedalMoment', () => {
  beforeEach(() => {
    toPngMock.mockReset();
    toPngMock.mockResolvedValue('data:image/png;base64,AAA');
    shareModalRenderMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the in-chat moment with streak, time, and the private amount', () => {
    render(<InterceptMedalMoment streakDays={3} />);

    expect(screen.queryByTestId('intercept-medal-moment')).toBeNull();
    dispatchMedal();

    expect(screen.getByTestId('intercept-medal-moment')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getByText('8.9 hours')).toBeTruthy();
    expect(screen.getByText('$89.00')).toBeTruthy();
  });

  it('closes the inline moment and does not reopen it in this session', () => {
    render(<InterceptMedalMoment />);
    dispatchMedal();

    fireEvent.click(screen.getByLabelText('Close'));
    dispatchMedal();

    expect(screen.queryByTestId('intercept-medal-moment')).toBeNull();
  });

  it('opens the intercept ShareModal from the show-off action', async () => {
    render(<InterceptMedalMoment streakDays={3} />);
    dispatchMedal();
    fireEvent.click(screen.getByTestId('chat-show-off-medal-button'));

    await waitFor(() => expect(screen.getByTestId('share-modal')).toBeTruthy());
    expect(screen.getByTestId('intercept-card')).toBeTruthy();
    expect(shareModalRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        medal: expect.objectContaining(medal),
        streakDays: 3,
      }),
    );
  });

  it('keeps money out of the exported intercept card', async () => {
    render(<InterceptMedalMoment streakDays={3} />);
    dispatchMedal();
    fireEvent.click(screen.getByTestId('chat-show-off-medal-button'));

    await waitFor(() => expect(toPngMock).toHaveBeenCalled());
    expect(screen.getByTestId('intercept-card').textContent).not.toMatch(/[¥$]\d/);
  });

  it('removes the event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<InterceptMedalMoment />);

    unmount();
    dispatchMedal();

    expect(removeSpy).toHaveBeenCalledWith(INTERCEPT_MEDAL_EVENT, expect.any(Function));
    removeSpy.mockRestore();
  });
});
