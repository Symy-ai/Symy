// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatHeader } from '../chat-header';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/hooks/use-green-pref', () => ({ useGreenPref: () => ({ enabled: false }) }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: () => ({ hourlyRate: null }) }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

describe('ChatHeader', () => {
  afterEach(() => {
    cleanup();
    apiFetchMock.mockReset();
  });

  it('renders the Symy brand and cart entry', () => {
    render(<ChatHeader />);
    expect(screen.getByText(/Symy/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cart' })).toBeTruthy();
    expect(screen.getByText('购物车')).toBeTruthy();
  });

  it('uses the cart title as the button accessible label', () => {
    render(<ChatHeader />);
    const button = screen.getByRole('button', { name: 'Cart' });
    expect(button.getAttribute('aria-label')).toBe('Cart');
  });

  it('renders children between the toolbar and cart drawer', () => {
    render(<ChatHeader><span>header children</span></ChatHeader>);
    expect(screen.getByText('header children')).toBeTruthy();
  });

  it('opens the cart panel from the header button', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, data: { cart_lines: [], cart_total_cents: 0 } });
    render(<ChatHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Cart' }));
    expect(await screen.findByText(/购物车还是空的/)).toBeTruthy();
  });

  it('does not load the cart panel before the button is clicked', () => {
    render(<ChatHeader />);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
