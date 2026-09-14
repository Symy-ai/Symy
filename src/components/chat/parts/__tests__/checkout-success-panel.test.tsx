// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckoutSuccessPanel } from '../checkout-success-panel';

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

describe('CheckoutSuccessPanel', () => {
  beforeEach(() => {
    localeMock.value = 'en';
    messagesMock.value = {
      'chat.cart.successTitle': 'Shopping list submitted',
      'chat.cart.successBody': 'Spend on purpose 🐘',
      'chat.cart.successSummary': '{greenCount} green items · ≈{hours} of your life',
      'chat.cart.successToast': 'Shopping list submitted 🌿',
    };
  });

  it('renders the success section with title, body, and summary badge', () => {
    render(<CheckoutSuccessPanel greenCount={3} totalHours="24 hours" toastVisible={false} />);
    expect(screen.getByTestId('checkout-success')).toBeTruthy();
    expect(screen.getByText('Shopping list submitted')).toBeTruthy();
    expect(screen.getByText('Spend on purpose 🐘')).toBeTruthy();
    expect(screen.getByText('3 green items · ≈24 hours of your life')).toBeTruthy();
  });

  it('renders the toast overlay when toastVisible is true', () => {
    render(<CheckoutSuccessPanel greenCount={1} totalHours="8 hours" toastVisible={true} />);
    expect(screen.getByText('Shopping list submitted 🌿')).toBeTruthy();
  });

  it('does not render the toast overlay when toastVisible is false', () => {
    render(<CheckoutSuccessPanel greenCount={1} totalHours="8 hours" toastVisible={false} />);
    expect(screen.queryByText('Shopping list submitted 🌿')).toBeNull();
  });

  it('does not assert any price or currency in the success panel', () => {
    render(<CheckoutSuccessPanel greenCount={2} totalHours="12 hours" toastVisible={false} />);
    expect(document.body.textContent).not.toMatch(/(\$|¥|€|£)\s*\d/i);
    expect(screen.queryByText(/\d+\.\d{2}/)).toBeNull();
  });
});
