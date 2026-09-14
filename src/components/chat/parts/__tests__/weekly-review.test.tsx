// @vitest-environment happy-dom

/**
 * WeeklyReviewCard 测试 — 小象引导式周复盘对话卡 (batch52-b)
 *
 * 覆盖: 无数据周引导态; 3–4 轮流程 (回顾 → 自评分层回应 → 选骄傲时刻 → 总结卡);
 * 完成时写 manual_adjustment (metadata: source=weekly_review + week_key +
 * rating + proud_key/proud_item); 已复盘周直接回看总结; 分享弹层打开;
 * 上报失败静默。i18n key 直接从真实 zh/en message 表读取 (无 defaultValue)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WeeklyReviewCard } from '../weekly-review';
import { deriveWeeklyReview } from '@/lib/weekly-review';
import { _resetGuardIntensityStateForTest } from '@/hooks/use-guard-intensity';
import type { WeeklyGuardEventInput } from '@/lib/weekly-guard-compare';
import zh from '../../../../i18n/messages/zh.json';
import en from '../../../../i18n/messages/en.json';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('@/hooks/use-impulse-window', () => ({
  useImpulseWindow: () => ({ summary: null, isLoading: false }),
}));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = zh.chat.weeklyReview as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.weeklyReview\./, '')
        .split('.')
        .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), table);
      let result = typeof raw === 'string' ? raw : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) result = result.replace(`{${k}}`, v);
      }
      return result;
    },
    locale: 'zh',
  }),
}));

const NOW = new Date(2026, 8, 9, 20, 0, 0); // 周三晚

function events(): WeeklyGuardEventInput[] {
  return [
    { eventType: 'challenge_completed', triggerSource: 'chat', triggerId: 't1', metadata: { itemName: '无线耳机' }, createdAt: new Date(2026, 8, 8, 10).toISOString() },
    { eventType: 'challenge_failed', triggerSource: 'chat', triggerId: 't2', metadata: null, createdAt: new Date(2026, 8, 7, 21).toISOString() },
  ];
}

function dueDerivation() {
  return deriveWeeklyReview(events(), NOW, 25);
}

function reviewedDerivation() {
  return deriveWeeklyReview(
    events().concat([
      { eventType: 'manual_adjustment', triggerSource: 'manual', triggerId: null, metadata: { source: 'weekly_review', week_key: '2026-09-07', rating: 'okay', proud_key: 't1', proud_item: '无线耳机' }, createdAt: new Date(2026, 8, 9, 21).toISOString() },
    ]),
    NOW,
    25,
  );
}

describe('i18n key alignment (chat.weeklyReview)', () => {
  const KEYS = [
    'entryHint', 'title', 'recapGreeting', 'recapTrend.up', 'recapTrend.down',
    'continueBtn', 'finishBtn', 'closeBtn', 'ratingQuestion',
    'chip.exceeded', 'chip.okay', 'chip.tough',
    'reply.exceeded.gentle', 'reply.exceeded.balanced', 'reply.exceeded.strict',
    'reply.okay.gentle', 'reply.okay.balanced', 'reply.okay.strict',
    'reply.tough.gentle', 'reply.tough.balanced', 'reply.tough.strict',
    'proudQuestion', 'momentGeneric', 'skipProud', 'proudAck', 'proudSkipped',
    'statGuards', 'statHours', 'momentLine',
    'blessing.exceeded', 'blessing.okay', 'blessing.tough',
    'tip.dawn', 'tip.daytime', 'tip.evening', 'tip.lateNight', 'tip.generic',
    'noDataBody', 'reviewedNote', 'shareBtn', 'shareClose',
    'share.pill', 'share.momentLabel', 'share.momentFallback', 'share.guardLabel', 'share.hoursLabel',
  ] as const;

  const pick = (obj: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);

  it.each(KEYS)('chat.weeklyReview.%s exists in both zh and en with no defaultValue', (key) => {
    expect(typeof pick(zh.chat.weeklyReview, key)).toBe('string');
    expect(typeof pick(en.chat.weeklyReview, key)).toBe('string');
  });

  it('艰难周分支温暖不指责 — zh/en 无「浪费」式表述', () => {
    for (const tone of ['gentle', 'balanced', 'strict'] as const) {
      expect((zh.chat.weeklyReview.reply.tough as Record<string, string>)[tone]).not.toContain('浪费');
      expect((en.chat.weeklyReview.reply.tough as Record<string, string>)[tone]).not.toMatch(/wasted|you wasted/i);
    }
  });
});

describe('WeeklyReviewCard (周复盘对话卡)', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
    apiFetchMock.mockResolvedValue({ ok: true });
    _resetGuardIntensityStateForTest();
  });

  afterEach(() => {
    cleanup();
    _resetGuardIntensityStateForTest();
  });

  it('无数据周: 引导态 (不空壳不假数据), 可关闭', () => {
    const onClose = vi.fn();
    render(<WeeklyReviewCard derivation={deriveWeeklyReview([], NOW)} onCompleted={vi.fn()} onClose={onClose} />);
    expect(screen.getByTestId('weekly-review-empty').textContent).toContain('这一周还没有守护时刻');
    expect(screen.queryByTestId('weekly-review-recap')).toBeNull();
    fireEvent.click(screen.getByTestId('weekly-review-close-empty'));
    expect(onClose).toHaveBeenCalled();
  });

  it('轮1 回顾: 本周次数/小时 + 趋势行; 继续进入自评', () => {
    render(<WeeklyReviewCard derivation={dueDerivation()} onCompleted={vi.fn()} onClose={vi.fn()} />);
    const recap = screen.getByTestId('weekly-review-recap');
    expect(recap.textContent).toContain('2 次');
    // 上周无数据 → noBaseline → 无趋势行 (反假洞察)
    expect(screen.queryByTestId('weekly-review-recap-trend')).toBeNull();
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    expect(screen.getByTestId('weekly-review-rating')).toBeTruthy();
  });

  it('轮2 自评: 三 chip; 「有点艰难」回应温暖分层 (balanced 默认档)', () => {
    render(<WeeklyReviewCard derivation={dueDerivation()} onCompleted={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    for (const r of ['exceeded', 'okay', 'tough'] as const) {
      expect(screen.getByTestId(`weekly-review-rating-${r}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId('weekly-review-rating-tough'));
    expect(screen.getByTestId('weekly-review-rating-reply').textContent).toContain(
      (zh.chat.weeklyReview.reply.tough as Record<string, string>).balanced,
    );
  });

  it('轮3 骄傲时刻: 候选 chip (itemName 回显/通用文案) + 跳过; 选中出 ack', () => {
    render(<WeeklyReviewCard derivation={dueDerivation()} onCompleted={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-rating-okay'));
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    // 候选最近在前: t1 (无线耳机) → t2 (通用文案「第 2 次守护」)
    expect(screen.getByTestId('weekly-review-proud-0').textContent).toContain('无线耳机');
    expect(screen.getByTestId('weekly-review-proud-1').textContent).toContain('第 2 次守护');
    fireEvent.click(screen.getByTestId('weekly-review-proud-0'));
    expect(screen.getByTestId('weekly-review-proud-ack').textContent).toContain('无线耳机');
  });

  it('轮4 总结: 写 manual_adjustment (week_key + rating + proud_key/proud_item) + 统计/寄语/建议 + onCompleted', () => {
    const onCompleted = vi.fn();
    render(<WeeklyReviewCard derivation={dueDerivation()} onCompleted={onCompleted} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-rating-okay'));
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-proud-0'));
    fireEvent.click(screen.getByTestId('weekly-review-finish'));

    const summary = screen.getByTestId('weekly-review-summary');
    expect(summary.textContent).toContain('守护 2 次');
    expect(summary.textContent).toContain('小时');
    expect(screen.getByTestId('weekly-review-moment').textContent).toContain('无线耳机');
    expect(screen.getByTestId('weekly-review-tip').textContent).toContain('危险窗口');
    expect(onCompleted).toHaveBeenCalledTimes(1);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.body.eventType).toBe('manual_adjustment');
    expect(opts.body.triggerSource).toBe('manual');
    expect(opts.body.metadata).toEqual({
      source: 'weekly_review',
      week_key: '2026-09-07',
      rating: 'okay',
      proud_key: 't1',
      proud_item: '无线耳机',
    });
  });

  it('分享弹层可打开 (分享面字段: 次数/小时/时刻, 无金额)', () => {
    render(<WeeklyReviewCard derivation={dueDerivation()} onCompleted={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-rating-okay'));
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-proud-0'));
    fireEvent.click(screen.getByTestId('weekly-review-finish'));
    fireEvent.click(screen.getByTestId('weekly-review-share-btn'));

    expect(screen.getByTestId('weekly-review-share-modal')).toBeTruthy();
    const face = screen.getByTestId('weekly-review-share-face');
    expect(face.textContent).toContain('无线耳机');
    expect(face.textContent).not.toContain('$');
    expect(face.textContent).not.toContain('50');
  });

  it('已复盘周 (入口回看): 直接总结卡 + reviewedNote, 不再写事件', () => {
    render(<WeeklyReviewCard derivation={reviewedDerivation()} onCompleted={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('weekly-review-summary')).toBeTruthy();
    expect(screen.getByTestId('weekly-review-reviewed-note')).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('上报失败静默 — 总结卡照常展示, 不抛错', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    render(<WeeklyReviewCard derivation={dueDerivation()} onCompleted={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-rating-okay'));
    fireEvent.click(screen.getByTestId('weekly-review-continue'));
    fireEvent.click(screen.getByTestId('weekly-review-proud-skip'));
    fireEvent.click(screen.getByTestId('weekly-review-finish'));
    expect(screen.getByTestId('weekly-review-summary')).toBeTruthy();
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    // 跳过时 proud_key/proud_item 不写 (null)
    expect(apiFetchMock.mock.calls[0][1].body.metadata.proud_key).toBeNull();
  });
});
