// @vitest-environment happy-dom

/**
 * PostPurchaseReview 测试 — 购后复盘回访条 (batch51-a)
 *
 * 覆盖: 回访问题渲染 (itemName 回显/通用文案), 三个 chip 分别写 manual_adjustment
 * 事件 (metadata: source=post_purchase_review + rating + review_key), 分层回应
 * 文案展示, 小结行计数与提交后 +1, 上报失败静默不打扰。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PostPurchaseReview } from '../post-purchase-review';
import { _resetGuardIntensityStateForTest } from '@/hooks/use-guard-intensity';
import type { DuePostPurchaseReview, PostPurchaseReviewSummary } from '@/types/post-purchase-review';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      ({
        'chat.postPurchaseReview.itemGeneric': 'the thing you bought',
        'chat.postPurchaseReview.question': `That ${vars?.item ?? ''} you bought — putting it to use?`,
        'chat.postPurchaseReview.chip.worth': 'Totally worth it',
        'chat.postPurchaseReview.chip.ok': "It's okay",
        'chat.postPurchaseReview.chip.regret': 'A bit of regret',
        'chat.postPurchaseReview.reply.worth.balanced': 'Good spending IS part of the guard 🌱',
        'chat.postPurchaseReview.reply.ok.balanced': 'Passing grade, no thrill 🐘',
        'chat.postPurchaseReview.reply.regret.balanced': 'Regret is an honest feeling 🐘 (never "I told you so")',
        'chat.postPurchaseReview.summary': `Reviewed ${vars?.total}: ${vars?.worth} worth it, ${vars?.regret} with regret`,
      })[key] || key,
  }),
}));

const RECORD: DuePostPurchaseReview = { key: 'cf:u1:ch1', itemName: '耳机', failedAt: '2026-09-07T00:00:00' };
const EMPTY_SUMMARY: PostPurchaseReviewSummary = { worth: 0, ok: 0, regret: 0, total: 0 };

describe('PostPurchaseReview (购后复盘回访条)', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValue({ ok: true });
    _resetGuardIntensityStateForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
  });

  it('渲染回访问题 (itemName 回显; 缺失用通用文案)', () => {
    render(<PostPurchaseReview record={RECORD} summary={EMPTY_SUMMARY} onAnswered={vi.fn()} />);
    expect(screen.getByTestId('post-purchase-review-question').textContent).toContain('耳机');

    cleanup();
    render(<PostPurchaseReview record={{ ...RECORD, itemName: null }} summary={EMPTY_SUMMARY} onAnswered={vi.fn()} />);
    expect(screen.getByTestId('post-purchase-review-question').textContent).toContain('the thing you bought');
  });

  it('三个快捷回应 chip 渲染; total=0 时不显示小结行', () => {
    render(<PostPurchaseReview record={RECORD} summary={EMPTY_SUMMARY} onAnswered={vi.fn()} />);
    expect(screen.getByTestId('post-purchase-review-worth')).toBeTruthy();
    expect(screen.getByTestId('post-purchase-review-ok')).toBeTruthy();
    expect(screen.getByTestId('post-purchase-review-regret')).toBeTruthy();
    expect(screen.queryByTestId('post-purchase-review-summary')).toBeNull();
  });

  it.each(['worth', 'ok', 'regret'] as const)('「%s」chip: 写 manual_adjustment 事件 (rating + review_key) + 分层回应 + onAnswered 回调', (rating) => {
    const onAnswered = vi.fn();
    render(<PostPurchaseReview record={RECORD} summary={EMPTY_SUMMARY} onAnswered={onAnswered} />);

    fireEvent.click(screen.getByTestId(`post-purchase-review-${rating}`));

    expect(screen.getByTestId('post-purchase-review-reply').textContent).toContain(
      rating === 'worth' ? 'part of the guard' : rating === 'ok' ? 'Passing grade' : 'honest feeling',
    );
    expect(onAnswered).toHaveBeenCalledWith(rating);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.body.eventType).toBe('manual_adjustment');
    expect(opts.body.triggerSource).toBe('manual');
    expect(opts.body.metadata).toEqual({
      source: 'post_purchase_review',
      rating,
      review_key: 'cf:u1:ch1',
    });
  });

  it('小结行: 复盘过的计数展示 (纯次数, 无金额); 提交后本地 +1', () => {
    const summary: PostPurchaseReviewSummary = { worth: 2, ok: 1, regret: 1, total: 4 };
    const onAnswered = (rating: string) => {
      // 模拟 hook 的 recordReview: 本地小结 +1 后卡片重渲染
      cleanup();
      const next = { ...summary, [rating]: summary[rating as 'worth'] + 1, total: summary.total + 1 } as PostPurchaseReviewSummary;
      render(<PostPurchaseReview record={RECORD} summary={next} onAnswered={vi.fn()} />);
    };
    const { unmount } = render(<PostPurchaseReview record={RECORD} summary={summary} onAnswered={onAnswered} />);
    expect(screen.getByTestId('post-purchase-review-summary').textContent).toContain('Reviewed 4: 2 worth it, 1 with regret');

    fireEvent.click(screen.getByTestId('post-purchase-review-worth'));
    expect(screen.getByTestId('post-purchase-review-summary').textContent).toContain('Reviewed 5: 3 worth it, 1 with regret');
    unmount();
  });

  it('上报失败静默 — 回应文案照常展示, 不抛错', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    render(<PostPurchaseReview record={RECORD} summary={EMPTY_SUMMARY} onAnswered={vi.fn()} />);

    fireEvent.click(screen.getByTestId('post-purchase-review-worth'));
    expect(screen.getByTestId('post-purchase-review-reply').textContent).toContain('part of the guard');
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  });
});
