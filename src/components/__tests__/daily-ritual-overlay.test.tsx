// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { DailyRitualOverlay } from '../daily-ritual-overlay';
import { getLimitWindow } from '@/lib/limit-window';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> & { defaultValue?: string }) => {
      if (params?.defaultValue !== undefined) {
        return String(params.defaultValue).replace(/\{days\}/g, String(params.days));
      }
      return key;
    },
    locale: 'en',
  }),
}));

function renderRitual(overrides: Partial<ComponentProps<typeof DailyRitualOverlay>> = {}) {
  return render(<DailyRitualOverlay totalSaved={100} streakDays={3} {...overrides} />);
}

describe('DailyRitualOverlay', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ shouldShow: true, lastRitualAt: null, intervalMs: 86_400_000 });
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('waits for the authenticated status response before showing', async () => {
    renderRitual();
    expect(document.body.textContent).not.toContain('Day 3');
    expect(await screen.findByText('Day 3')).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/user/ritual-status');
  });

  it('stays hidden when the authenticated status check fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));
    renderRitual();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).not.toContain('Day 3');
  });

  it('pauses while higher-priority onboarding is visible', async () => {
    const { rerender } = renderRitual({ paused: true });
    // paused: 组件 return null — 等状态请求完成后依然不渲染
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).not.toContain('Day 3');

    rerender(<DailyRitualOverlay totalSaved={100} streakDays={3} paused={false} />);
    expect(await screen.findByText('Day 3')).toBeTruthy();
  });

  it('shows today once for demo mode when no window is stored', async () => {
    renderRitual({ isDemo: true });
    expect(await screen.findByText('Day 3')).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('stays hidden for demo mode in the current limit window', async () => {
    localStorage.setItem('symy-daily-ritual', getLimitWindow());
    renderRitual({ isDemo: true });
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).not.toContain('Day 3');
  });

  it('keeps the ritual form red line: one button and no skip affordance', async () => {
    renderRitual();
    await screen.findByText('Day 3');
    expect(document.body.querySelectorAll('button')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/skip|task|recommend/i);
  });

  it('posts on authenticated close, then hides after the 400ms fade', async () => {
    renderRitual();
    fireEvent.click(await screen.findByRole('button', { name: 'ritual.closeButton' }));

    // 契约: close 发 POST 到 ritual-status (不纠结 act 环境下的调用次数)
    await waitFor(() => {
      const posts = apiFetchMock.mock.calls.filter((c) => (c[1] as { method?: string })?.method === 'POST');
      expect(posts.length).toBeGreaterThanOrEqual(1);
      expect(posts.every((c) => c[0] === '/api/user/ritual-status')).toBe(true);
    });
    // fade (400ms) 完成后 Day N 消失 — 真计时等待
    await waitFor(() => expect(screen.queryByText(/Day 3/)).toBeNull(), { timeout: 2500 });
  });

  it('writes the current demo window on close and clears the fade timer on unmount', async () => {
    const { unmount } = renderRitual({ isDemo: true });
    fireEvent.click(await screen.findByRole('button', { name: 'ritual.closeButton' }));
    await waitFor(() => expect(localStorage.getItem('symy-daily-ritual')).toBe(getLimitWindow()));
    unmount();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
