// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmailReceiptsList } from '../email-receipts-list';
import type { EmailReceipt } from '@/lib/supabase';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => ({
      'monitor.order': 'Order',
      'monitor.talkToAI': 'Talk to AI',
      'monitor.ignore': 'Ignore',
      'monitor.refundable': 'Refundable',
      'monitor.refund': 'Refund',
      'monitor.refundPending': 'Refund Pending',
      'monitor.markRefunded': 'Mark as Refunded',
      'monitor.refundGuidance': `Manual refund via ${params?.platform ?? ''}`,
      'monitor.refundPendingSection': `Refund Pending (${params?.n ?? 0})`,
      'monitor.noActionableReceipts': 'No receipts yet',
      'monitor.allPurchasesIntentional': 'All purchases were intentional',
      'monitor.demoNoReceipts': 'No demo receipts',
      'monitor.demoNoReceiptsHint': 'Check notifications',
    })[key] ?? params?.defaultValue ?? key,
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

  it('空列表 → 引导空态 (BUG-3 拆分后守卫); demo 模式切 demo 文案', () => {
    const { rerender } = render(
      <EmailReceiptsList receipts={[]} onTalkToAI={vi.fn()} onIgnore={vi.fn()} onRefund={vi.fn()} />,
    );
    expect(screen.getByText('No receipts yet')).toBeTruthy();
    expect(screen.getByText('All purchases were intentional')).toBeTruthy();

    rerender(
      <EmailReceiptsList receipts={[]} onTalkToAI={vi.fn()} onIgnore={vi.fn()} onRefund={vi.fn()} isDemoMode />,
    );
    expect(screen.getByText('No demo receipts')).toBeTruthy();
  });

  it('Talk to AI → onTalkToAI 收 platform/amount/time 三元组 (C3 拆分行为锚)', () => {
    const onTalkToAI = vi.fn();
    render(
      <EmailReceiptsList receipts={[receipt]} onTalkToAI={onTalkToAI} onIgnore={vi.fn()} onRefund={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Talk to AI'));
    expect(onTalkToAI).toHaveBeenCalledTimes(1);
    const arg = onTalkToAI.mock.calls[0][0] as { platform: string; amount: number; reasons: string[] };
    expect(arg.platform).toBe('amazon');
    expect(arg.amount).toBe(70);
    expect(arg.reasons[0]).toContain('Amazon');
  });

  it('refund_eligible → Refund 按钮 + onRefund(receipt.id); Ignore → onIgnore', () => {
    const onRefund = vi.fn();
    const onIgnore = vi.fn();
    const eligible = { ...receipt, refund_eligible: true };
    render(
      <EmailReceiptsList receipts={[eligible]} onTalkToAI={vi.fn()} onIgnore={onIgnore} onRefund={onRefund} />,
    );
    fireEvent.click(screen.getByText('Refund'));
    expect(onRefund).toHaveBeenCalledWith('receipt-1');
    fireEvent.click(screen.getByText('Ignore'));
    expect(onIgnore).toHaveBeenCalledWith('receipt-1');
  });

  it('status=refunding → 退款中区置顶 + Mark as Refunded 回调; actionable 区不含它', () => {
    const refunding = { ...receipt, id: 'receipt-2', status: 'refunding', refund_eligible: false, amount: 30 } satisfies EmailReceipt;
    const onMarkRefunded = vi.fn();
    const { container } = render(
      <EmailReceiptsList
        receipts={[receipt, refunding]}
        onTalkToAI={vi.fn()}
        onIgnore={vi.fn()}
        onRefund={vi.fn()}
        onMarkRefunded={onMarkRefunded}
      />,
    );
    // 退款中区标题 (n=1)
    expect(screen.getByText('Refund Pending (1)')).toBeTruthy();
    expect(screen.getByText('Manual refund via Amazon')).toBeTruthy();
    fireEvent.click(screen.getByText('Mark as Refunded'));
    expect(onMarkRefunded).toHaveBeenCalledWith('receipt-2');
    // BUG-3: refunding 不出现在 actionable 区 — amount 30 只有一次渲染 (refunding 区)
    expect(container.innerHTML.match(/\$? ?30\.00/g)?.length).toBe(1);
  });

  it('impulse_score 分级配色: ≥60 amber / 30-59 yellow / <30 glass (视觉锚)', () => {
    const high = { ...receipt, id: 'r-high', impulse_score: 75, refund_eligible: false };
    const mid = { ...receipt, id: 'r-mid', impulse_score: 45, refund_eligible: false };
    const low = { ...receipt, id: 'r-low', impulse_score: 10, refund_eligible: false };
    const { container } = render(
      <EmailReceiptsList receipts={[high, mid, low]} onTalkToAI={vi.fn()} onIgnore={vi.fn()} onRefund={vi.fn()} />,
    );
    expect(container.innerHTML).toContain('bg-amber-500/10 border-amber-600/30');
    expect(container.innerHTML).toContain('bg-yellow-500/10 border-yellow-500/30');
    expect(container.innerHTML).toContain('bg-glass-fill border-glass-border');
    // 分数渲染
    expect(screen.getByText('75')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });
});
