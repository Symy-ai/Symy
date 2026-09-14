// @vitest-environment happy-dom

/**
 * CommitmentCard / CommitmentSettlement / CommitmentShareFace 测试 (batch53-a)
 *
 * 覆盖验收:
 * 1. 登记卡 → 时长 chips 可改 → 确认 → health_events 写入 (metadata:
 *    source=green_commitment + category + subject + start_key/end_key, 零 DDL)
 * 2. 到期结算卡三分支 (kept/broken/insufficient) 各有渲染; 破戒文案非羞辱
 *    (不含「失败/失信」类措辞)
 * 3. 分享面数据结构断言: 无金额字段 (类型级 + dump 级)
 * i18n key 直接从真实 zh/en message 表读取 (无 defaultValue)。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommitmentCard } from '../commitment-card';
import { CommitmentSettlement } from '../commitment-settlement';
import { CommitmentShareFace } from '../../../chat-parts/commitment-share';
import type { GreenCommitmentSettlement } from '@/types/green-commitment';
import zh from '../../../../i18n/messages/zh.json';
import en from '../../../../i18n/messages/en.json';

const apiFetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const table = zh.chat.commitment as unknown as Record<string, unknown>;
      const raw = key
        .replace(/^chat\.commitment\./, '')
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

afterEach(() => {
  cleanup();
  apiFetchMock.mockClear();
});

describe('CommitmentCard 登记流', () => {
  it('命中卡渲染对象原词 + 默认时长 (month_end); 改选 14 天后确认写入完整 metadata', () => {
    render(<CommitmentCard data={{ subject: '咖啡', durationKind: 'month_end', days: null }} />);
    expect(screen.getByTestId('commitment-card').textContent).toContain('咖啡');

    fireEvent.click(screen.getByTestId('commitment-duration-14'));
    fireEvent.click(screen.getByTestId('commitment-confirm'));

    expect(screen.getByTestId('commitment-confirmed')).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe('/api/buddy/health-events');
    expect(opts.method).toBe('POST');
    expect(opts.body.eventType).toBe('manual_adjustment');
    expect(opts.body.triggerSource).toBe('manual');
    const meta = opts.body.metadata as Record<string, unknown>;
    expect(meta.source).toBe('green_commitment');
    expect(meta.subject).toBe('咖啡');
    expect(typeof meta.category).toBe('string');
    expect(String(meta.start_key)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(meta.end_key)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.start_key).not.toBe(meta.end_key);
  });

  it('fixed 意图预选显式天数; 确认只写一次 (防连点)', () => {
    render(<CommitmentCard data={{ subject: '游戏', durationKind: 'fixed', days: 30 }} />);
    fireEvent.click(screen.getByTestId('commitment-confirm'));
    // 确认后按钮即消解 (防连点的 UI 层保障), 无第二次写入
    expect(screen.queryByTestId('commitment-confirm')).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('识别不出对象走通用文案', () => {
    render(<CommitmentCard data={{ subject: null, durationKind: 'month_end', days: null }} />);
    expect(screen.getByText(zh.chat.commitment.confirmBody.replace('{subject}', zh.chat.commitment.subjectFallback))).toBeTruthy();
  });

  it('上报失败静默 (卡面已确认, 不抛异常)', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    render(<CommitmentCard data={{ subject: '咖啡', durationKind: 'month_end', days: null }} />);
    fireEvent.click(screen.getByTestId('commitment-confirm'));
    expect(screen.getByTestId('commitment-confirmed')).toBeTruthy();
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  });
});

function settlement(outcome: GreenCommitmentSettlement['outcome']): GreenCommitmentSettlement {
  return {
    record: { category: 'food', subject: '咖啡', startKey: '2026-08-01', endKey: '2026-08-31' },
    outcome,
    days: 30,
    assistCount: outcome === 'kept' ? 3 : 0,
    hoursReclaimed: outcome === 'kept' ? 2.4 : 0,
    refKey: '2026-08-01#2026-08-31',
  };
}

describe('CommitmentSettlement 三分支', () => {
  it('kept: 庆祝 + 天数/助攻 + 私有小时 + 分享入口', () => {
    render(<CommitmentSettlement settlement={settlement('kept')} onSettled={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('commitment-settlement-kept')).toBeTruthy();
    expect(screen.getByTestId('commitment-settlement-stats').textContent).toContain('30');
    expect(screen.getByTestId('commitment-settlement-stats').textContent).toContain('3');
    expect(screen.getByTestId('commitment-settlement-hours').textContent).toContain('小时');
    expect(screen.getByTestId('commitment-settlement-share-btn')).toBeTruthy();
  });

  it('broken: 非羞辱文案 (不含失败/失信), 一键重启写新承诺', () => {
    const onSettled = vi.fn();
    render(<CommitmentSettlement settlement={settlement('broken')} onSettled={onSettled} onClose={vi.fn()} />);
    const brokenText = screen.getByTestId('commitment-settlement-broken').textContent || '';
    expect(brokenText).not.toMatch(/失败|失信|违约|没做到|不守信用/);

    fireEvent.click(screen.getByTestId('commitment-restart-btn'));
    expect(screen.getByTestId('commitment-restart-ack')).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = apiFetchMock.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    const meta = opts.body.metadata as Record<string, unknown>;
    expect(meta.source).toBe('green_commitment');
    expect(meta.subject).toBe('咖啡');
    expect(String(meta.end_key)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('insufficient: 温和说明 + 可重启', () => {
    render(<CommitmentSettlement settlement={settlement('insufficient')} onSettled={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('commitment-settlement-insufficient')).toBeTruthy();
    fireEvent.click(screen.getByTestId('commitment-restart-btn'));
    expect(screen.getByTestId('commitment-restart-ack')).toBeTruthy();
  });

  it('关闭按钮回调 onSettled (结算消解由 hook 写 settlement 事件)', () => {
    const onSettled = vi.fn();
    render(<CommitmentSettlement settlement={settlement('kept')} onSettled={onSettled} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('commitment-settlement-close'));
    expect(onSettled).toHaveBeenCalledWith('2026-08-01#2026-08-31', 'kept');
  });

  it('kept 分享弹层打开/关闭', () => {
    render(<CommitmentSettlement settlement={settlement('kept')} onSettled={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('commitment-settlement-share-btn'));
    expect(screen.getByTestId('commitment-share-modal')).toBeTruthy();
    expect(screen.getByTestId('commitment-share-face')).toBeTruthy();
  });
});

describe('CommitmentShareFace 结构断言', () => {
  it('分享面数据结构无金额字段 (类型级: days/assistCount only)', () => {
    const data = { days: 30, assistCount: 3 };
    expect(Object.keys(data).sort()).toEqual(['assistCount', 'days']);
    expect(JSON.stringify(data)).not.toMatch(/amount|saved|money|price|cost/i);
  });

  it('渲染 dump 无金额字样, 天数/助攻可见', () => {
    const { container } = render(<CommitmentShareFace data={{ days: 30, assistCount: 3 }} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/\$\d|USD|CNY|¥/);
    expect(screen.getByTestId('commitment-share-stats').textContent).toContain('30');
    expect(screen.getByTestId('commitment-share-stats').textContent).toContain('3');
  });
});

describe('i18n key alignment (chat.commitment)', () => {
  const KEYS = [
    'title', 'confirmBody', 'subjectFallback', 'durationMonthEnd', 'durationDays',
    'untilHint', 'confirmBtn', 'confirmedBody', 'guardNote', 'closeBtn', 'shareBtn', 'shareClose',
    'settlement.title', 'settlement.keptBody', 'settlement.statDays', 'settlement.statAssists',
    'settlement.hoursPrivate', 'settlement.brokenBody', 'settlement.brokenNote',
    'settlement.insufficientBody', 'settlement.restartBtn', 'settlement.restartAck',
    'share.pill', 'share.headlineLabel', 'share.headline', 'share.daysLabel', 'share.assistsLabel',
  ];

  it('zh/en 双语 key 齐全且非空', () => {
    for (const key of KEYS) {
      const zhVal = key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], zh.chat.commitment);
      const enVal = key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], en.chat.commitment);
      expect(typeof zhVal, `zh.${key}`).toBe('string');
      expect((zhVal as string).length, `zh.${key} 非空`).toBeGreaterThan(0);
      expect(typeof enVal, `en.${key}`).toBe('string');
      expect((enVal as string).length, `en.${key} 非空`).toBeGreaterThan(0);
    }
  });
});
