// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LandingRefHero } from '../landing-ref-hero';

const apiFetchMock = vi.fn();

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, values?: { defaultValue?: string; name?: string }) => {
      let result = values?.defaultValue ?? key;
      if (values?.name) result = result.replaceAll('{name}', values.name);
      return result;
    },
  }),
}));

describe('LandingRefHero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('renders public stats, reward copy, and locale-prefixed signup CTA', async () => {
    window.history.replaceState({}, '', '/?ref=abcd1234');
    apiFetchMock.mockResolvedValueOnce({
      found: true,
      displayName: 'Avery',
      intercepts: 37,
      guardDays: 12,
      freedomHours: 12.5,
    });

    render(<LandingRefHero isAuthenticated={false} />);

    await waitFor(() => expect(screen.getByText('Avery guards every impulse with Symy')).toBeTruthy());
    expect(screen.getByText('37')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('13 小时')).toBeTruthy();
    expect(screen.getByText(/you both get \+30 days of premium/i)).toBeTruthy();
    expect(screen.getByTestId('landing-ref-signup').getAttribute('href')).toBe('/zh/auth/signup');
  });

  it('renders nothing when stats are not found', async () => {
    window.localStorage.setItem('symy_ref_code', 'missing-code');
    apiFetchMock.mockResolvedValueOnce({ found: false });

    const { container } = render(<LandingRefHero isAuthenticated={false} />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('never fetches or renders for authenticated users', () => {
    window.history.replaceState({}, '', '/?ref=abcd1234');
    const { container } = render(<LandingRefHero isAuthenticated />);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });
});
