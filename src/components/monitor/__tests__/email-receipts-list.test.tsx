// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailReceiptsList } from '../email-receipts-list';
import type { EmailReceipt } from '@/lib/supabase';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'monitor.order': 'Order',
      'monitor.talkToAI': 'Talk to AI',
      'monitor.ignore': 'Ignore',
      'monitor.refundable': 'Refundable',
    })[key] ?? key,
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({ hourlyRate: 20, setHourlyRate: vi.fn(), isLoading: false }),
}));

vi.mock('../helpers', async () => {
  const actual = await vi.importActual('../helpers');
  return {
    ...actual,
    formatReceiptTime: () => 'Sep 6',
  };
});

const receipt = {
  id: 'receipt-1',
  user_id: 'user-1',
  connection_id: 'connection-1',
  message_id: 'message-1',
  from_address: 'orders@example.com',
  subject: 'Your order',
  snippet: '',
  platform: 'amazon',
  amount: 70,
  currency: 'USD',
  received_at: '2026-09-06T10:00:00Z',
  impulse_score: 45,
  refund_eligible: false,
  status: 'actionable',
  created_at: '2026-09-06T10:00:00Z',
} satisfies EmailReceipt;

describe('EmailReceiptsList', () => {
  it('renders the freedom-hours anchor beside the receipt amount', () => {
    const { container } = render(
      <EmailReceiptsList
        receipts={[receipt]}
        onTalkToAI={vi.fn()}
        onIgnore={vi.fn()}
        onRefund={vi.fn()}
      />,
    );
    expect(screen.getByText(/3\.5 hours/)).toBeTruthy();
    expect(container.innerHTML).toContain('≈ 3.5 hours');
    expect(container.innerHTML).not.toContain('red-500');
  });
});
