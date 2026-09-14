// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuardCategoryCard } from '../guard-category-card';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => {
    const translations: Record<string, string> = {
      'profile.guardCategoryTitle': 'Category Insight',
      'profile.guardCategoryDesc': 'Where your guardian instincts shine',
      'profile.guardCategoryEmpty': 'Guard a few more times to see your category portrait',
      'profile.guardCategoryIntercepts': '{count} guards',
      'profile.guardCategoryHours': '{hours} back to yourself',
      'profile.guardCategorySaved': '≈ {amount} kept',
      'profile.guardCategoryShowDetail': 'Details',
      'profile.guardCategoryHideDetail': 'Hide details',
      'profile.guardCategoryName.clothing': 'Clothing',
      'profile.guardCategoryName.beauty': 'Beauty',
      'profile.guardCategoryName.home': 'Home',
      'profile.guardCategoryName.electronics': 'Electronics',
      'profile.guardCategoryName.food': 'Food',
      'profile.guardCategoryName.other': 'Other',
    };
    return {
      t: (key: string, params?: Record<string, unknown>) => {
        let result = translations[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            result = result.replace(`{${k}}`, String(v));
          }
        }
        return result;
      },
      locale: 'en',
    };
  },
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 25, rateIsDefault: true, setHourlyRate: vi.fn(), isLoading: false }),
}));

function mockEvents(events: Array<Record<string, unknown>>) {
  vi.mocked(apiFetch).mockResolvedValue({ events });
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GuardCategoryCard', () => {
  it('renders skeleton while loading', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as never);
    render(<GuardCategoryCard />);
    expect(screen.getByTestId('guard-category-card-skeleton')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  });

  it('renders top 3 categories with counts, money hidden until detail expanded', async () => {
    mockEvents([
      { metadata: { category: 'clothing', amount: 100 } },
      { metadata: { category: 'clothing', amount: 100 } },
      { metadata: { category: 'clothing', amount: 100 } },
      { metadata: { category: 'beauty', amount: 50 } },
      { metadata: { category: 'beauty', amount: 50 } },
      { metadata: { category: 'home', amount: 30 } },
      { metadata: { category: 'home', amount: 30 } },
      { metadata: { category: 'electronics', amount: 500 } }, // 第 4 名不进主面
      { metadata: {} },
      { metadata: {} },
      { metadata: {} }, // other 3 次最多但不上主面, 只进详情
    ]);
    render(<GuardCategoryCard />);
    await waitFor(() => expect(screen.getByTestId('guard-category-card')).toBeTruthy());

    const list = screen.getByTestId('guard-category-card-list');
    expect(list.children).toHaveLength(3);
    expect(screen.getByTestId('guard-category-row-clothing')).toBeTruthy();
    expect(screen.getByTestId('guard-category-row-beauty')).toBeTruthy();
    expect(screen.getByTestId('guard-category-row-home')).toBeTruthy();
    expect(screen.queryByTestId('guard-category-row-electronics')).toBeNull();
    expect(screen.queryByTestId('guard-category-row-other')).toBeNull();

    // 金额只出现在展开区
    expect(screen.queryByTestId('guard-category-card-detail')).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();

    fireEvent.click(screen.getByTestId('guard-category-card-toggle'));
    const detail = screen.getByTestId('guard-category-card-detail');
    expect(detail.textContent).toContain('$100');
    expect(detail.textContent).toContain('Other');
    expect(screen.getByTestId('guard-category-card-toggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows guidance empty state with fewer than 2 categories', async () => {
    mockEvents([{ metadata: { category: 'clothing', amount: 10 } }, { metadata: {} }]);
    render(<GuardCategoryCard />);
    await waitFor(() => expect(screen.getByTestId('guard-category-card-empty')).toBeTruthy());
    expect(screen.getByText('Guard a few more times to see your category portrait')).toBeTruthy();
  });

  it('degrades silently to empty state when the endpoint fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    render(<GuardCategoryCard />);
    await waitFor(() => expect(screen.getByTestId('guard-category-card-empty')).toBeTruthy());
  });
});
