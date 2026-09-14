// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatCartPanel } from '../cart-panel';
import {
  _resetGreenPrefStateForTest,
  setGreenPrefEnabled,
} from '@/hooks/use-green-pref';

const apiFetchMock = vi.hoisted(() => vi.fn());
const localeMock = vi.hoisted(() => ({ value: 'en' as 'en' | 'zh' }));
const messagesMock = vi.hoisted(() => ({
  value: {
    'chat.cart.title': 'Cart',
    'chat.cart.empty': 'Cart is empty',
    'chat.cart.total': 'Total',
    'chat.cart.remove': 'Remove',
    'chat.cart.hoursBadge': '≈{hours} of life',
    'chat.cart.greenPick': 'Green pick',
    'chat.cart.greenerHint': 'A greener choice?',
    'chat.cart.totalHoursBadge': '≈{hours} of life',
    'chat.cart.nonGreenOrderHint': '🌿 Some items may have a greener path.',
  } as Record<string, string>,
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: localeMock.value,
    t: (key: string, values?: Record<string, string | number>) => {
      const template = messagesMock.value[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
  }),
}));

const greenLine = { product_ref: 'green', title: 'Organic cotton tote bag', qty: 1, price_cents: 29900 };
const nonGreenLine = { product_ref: 'plastic', title: 'Disposable plastic cups', qty: 2, price_cents: 900 };

function mockList(lines: unknown[], totalCents = 60000) {
  apiFetchMock.mockResolvedValue({ ok: true, data: { cart_lines: lines, cart_total_cents: totalCents } });
}

async function renderOpen() {
  render(<ChatCartPanel open onClose={() => {}} />);
  await waitFor(() => expect(screen.queryByText('…')).toBeNull());
}

describe('ChatCartPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    _resetGreenPrefStateForTest();
    localeMock.value = 'en';
    messagesMock.value = {
      'chat.cart.title': 'Cart',
      'chat.cart.empty': 'Cart is empty',
      'chat.cart.total': 'Total',
      'chat.cart.remove': 'Remove',
      'chat.cart.hoursBadge': '≈{hours} of life',
      'chat.cart.greenPick': 'Green pick',
      'chat.cart.greenerHint': 'A greener choice?',
      'chat.cart.totalHoursBadge': '≈{hours} of life',
      'chat.cart.nonGreenOrderHint': '🌿 Some items may have a greener path.',
      'chat.cart.checkout': 'Review & submit list',
      'chat.cart.confirmTitle': 'Your guardian checklist',
      'chat.cart.confirmBody': '{greenCount} green picks and {nonGreenCount} other items.',
      'chat.cart.greenCount': 'Green items',
      'chat.cart.nonGreenCount': 'Items to reconsider',
      'chat.cart.totalHoursLabel': 'Life hours',
      'chat.cart.checkoutHonesty': 'It is not a payment.',
      'chat.cart.confirmCheckout': 'Submit list',
      'chat.cart.cancelCheckout': 'Let me think',
      'chat.cart.submitting': 'Submitting…',
      'chat.cart.successTitle': 'Shopping list submitted',
      'chat.cart.successBody': 'Spend on purpose 🐘',
      'chat.cart.successSummary': '{greenCount} green items · ≈{hours} of your life',
      'chat.cart.successToast': 'Shopping list submitted 🌿',
      'chat.cart.emptyCheckout': 'Your cart is empty.',
      'chat.cart.checkoutFailed': 'Could not submit the list.',
      'chat.cart.removeFailed': 'Could not remove the item.',
      'chat.cart.removeConfirm': 'Remove this item?',
      'chat.cart.removeYes': 'Remove',
      'chat.cart.removeNo': 'Keep',
    };
  });

  it('renders green pick, greener hint, and life-hour badges', async () => {
    mockList([greenLine, nonGreenLine], 31700);
    await renderOpen();
    expect(screen.getByText('Green pick')).toBeTruthy();
    expect(screen.getByText('A greener choice?')).toBeTruthy();
    expect(screen.getAllByText(/of life/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('🌿 Some items may have a greener path.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/save|saved|省下|省了/i);
    expect(document.body.textContent).not.toMatch(/(¥|\$)\s*\d+\s*(saved|省)/i);
  });

  it('hides all guardian layer when green preference is off', async () => {
    localStorage.setItem('symy-green-pref', 'off');
    mockList([greenLine, nonGreenLine], 31700);
    await renderOpen();
    expect(screen.queryByText('Green pick')).toBeNull();
    expect(screen.queryByText('A greener choice?')).toBeNull();
    expect(screen.queryByText(/of life/)).toBeNull();
    expect(screen.queryByText(/greener path/)).toBeNull();
  });

  it.each([
    ['zh', '¥', '≈{hours} 的人生', '¥600.00'],
    ['en', '$', '≈{hours} of life', '$600.00'],
  ] as const)('formats prices and life hours for %s', async (locale, symbol, hoursText, total) => {
    localeMock.value = locale;
    messagesMock.value['chat.cart.hoursBadge'] = hoursText;
    messagesMock.value['chat.cart.totalHoursBadge'] = hoursText;
    localStorage.setItem('symy-locale', locale);
    setGreenPrefEnabled(true);
    mockList([{ ...greenLine, price_cents: 60000 }], 60000);
    await renderOpen();
    expect(screen.getAllByText(total).length).toBe(2);
  expect(screen.getAllByText(hoursText.replace('{hours}', locale === 'zh' ? '24 小时' : '24 hours')).length).toBe(2);
    expect(screen.getAllByText(total).every((node) => node.textContent?.startsWith(symbol))).toBe(true);
  });

  it('degrades to an unreachable state when the API fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));
    await renderOpen();
    expect(screen.getByText('chat.cart.unreachable')).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the admin-notified copy when upstream auth fails (502 + HANDS_AUTH_FAILED)', async () => {
    apiFetchMock.mockRejectedValue(Object.assign(new Error('Cart service unavailable'), {
      status: 502,
      body: { ok: false, error: 'Cart service unavailable', code: 'HANDS_AUTH_FAILED' },
    }));
    await renderOpen();
    expect(screen.getByText('chat.cart.adminNotified')).toBeTruthy();
  });

  it('requires confirmation before checkout and celebrates the submitted list', async () => {
    mockList([greenLine, nonGreenLine], 31700);
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Review & submit list' }));
    expect(screen.getByRole('dialog', { name: 'Your guardian checklist' })).toBeTruthy();
    expect(screen.getByText('Green items').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Items to reconsider').nextElementSibling?.textContent).toBe('1');
    expect(screen.getAllByText('$317.00').length).toBe(2);
    expect(screen.getAllByText(/≈\d+ hours/).length).toBeGreaterThanOrEqual(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Submit list' }));
    await waitFor(() => expect(screen.getByTestId('checkout-success')).toBeTruthy());
    expect(screen.getByText('Shopping list submitted')).toBeTruthy();
    expect(screen.getByText(/1 green items · ≈\d+ hours of your life/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/payment succeeded|paid successfully|支付成功|已付款/i);
  });

  it('requires confirmation before removing a line', async () => {
    mockList([greenLine]);
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove this item?')).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    apiFetchMock.mockResolvedValue({ ok: true, data: { cart_lines: [], cart_total_cents: 0 } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock.mock.calls[1][1]?.body).toContain('"action":"remove"');
  });
});
