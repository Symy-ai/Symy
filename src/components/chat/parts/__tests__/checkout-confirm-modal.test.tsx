// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CheckoutConfirmModal } from '../checkout-confirm-modal';

const localeMock = vi.hoisted(() => ({ value: 'en' as 'en' | 'zh' }));
const messagesMock = vi.hoisted(() => ({
  value: {} as Record<string, string>,
}));

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

function renderModal(overrides?: Partial<Parameters<typeof CheckoutConfirmModal>[0]>) {
  const defaultProps: Parameters<typeof CheckoutConfirmModal>[0] = {
    greenCount: 2,
    nonGreenCount: 1,
    total: '$450.00',
    totalHours: '≈18 hours',
    submitting: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  const props = { ...defaultProps, ...overrides };
  const result = render(<CheckoutConfirmModal {...props} />);
  return { result, props };
}

describe('CheckoutConfirmModal', () => {
  beforeEach(() => {
    localeMock.value = 'en';
    messagesMock.value = {
      'chat.cart.confirmTitle': 'Your guardian checklist',
      'chat.cart.confirmBody': '{greenCount} green picks and {nonGreenCount} other items.',
      'chat.cart.greenCount': 'Green items',
      'chat.cart.nonGreenCount': 'Items to reconsider',
      'chat.cart.total': 'Total',
      'chat.cart.totalHoursLabel': 'Life hours',
      'chat.cart.checkoutHonesty': 'It is not a payment.',
      'chat.cart.confirmCheckout': 'Submit list',
      'chat.cart.cancelCheckout': 'Let me think',
      'chat.cart.submitting': 'Submitting…',
      'common.close': 'Close',
    };
  });

  it('renders the dialog with title, counts, total, and life-hour summary', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Your guardian checklist' })).toBeTruthy();
    expect(screen.getByText('Your guardian checklist')).toBeTruthy();
    expect(screen.getByText('2 green picks and 1 other items.')).toBeTruthy();
    expect(screen.getByText('Green items').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Items to reconsider').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('$450.00')).toBeTruthy();
    expect(screen.getByText('≈18 hours')).toBeTruthy();
    expect(screen.getByText('It is not a payment.')).toBeTruthy();
  });

  it('hides non-green count row when nonGreenCount is zero', () => {
    renderModal({ nonGreenCount: 0 });
    expect(screen.getByText('Green items').nextElementSibling?.textContent).toBe('2');
    expect(screen.queryByText('Items to reconsider')).toBeNull();
  });

  it('calls onConfirm when the submit button is clicked', () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Submit list' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Let me think' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both action buttons while submitting and shows submitting label', () => {
    renderModal({ submitting: true });
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toHaveProperty('disabled', true));
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeTruthy();
  });

  it('renders the close icon button with the correct aria-label', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
