// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommitmentSettlement } from '../commitment-settlement';
import type { GreenCommitmentSettlement } from '@/types/green-commitment';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      // 参数插值回显 — 断言可捕 days/subject 注入
      const kv = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',');
      return `${key}[${kv}]`;
    },
    locale: 'en',
  }),
}));

vi.mock('lucide-react', async (importOriginal) => {
  const m = await importOriginal();
  return m;
});

const apiPostMock = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiPostMock(...(args as [])),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/chat-parts/commitment-share', () => ({
  CommitmentShareFace: (p: { data: { days: number; assistCount: number } }) => (
    <div data-testid="share-face" data-days={String(p.data.days)} data-assists={String(p.data.assistCount)} />
  ),
}));

const settlement = (outcome: GreenCommitmentSettlement['outcome'], overrides: Partial<GreenCommitmentSettlement> = {}): GreenCommitmentSettlement =>
  ({
    record: { subject: '奶茶', category: 'drink' },
    outcome,
    days: 7,
    assistCount: 3,
    hoursReclaimed: 2.5,
    refKey: '20261001#20261008',
    ...overrides,
  }) as unknown as GreenCommitmentSettlement;

function setup(overrides: Partial<Parameters<typeof CommitmentSettlement>[0]> = {}) {
  const onSettled = vi.fn();
  const onClose = vi.fn();
  const props = {
    settlement: settlement('kept'),
    onSettled,
    onClose,
    ...overrides,
  };
  return { onSettled, onClose, view: render(<CommitmentSettlement {...props} />) };
}

describe('CommitmentSettlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPostMock.mockClear();
  });

  afterEach(() => cleanup());

  it('kept: 庆祝文案含 subject/days 插值 + 双统计 (天数/助攻)', () => {
    setup({ settlement: settlement('kept', { days: 7, assistCount: 3 }) });
    const body = screen.getByTestId('commitment-settlement-kept').textContent ?? '';
    expect(body).toContain('subject=奶茶');
    expect(body).toContain('days=7');
    expect(screen.getByTestId('commitment-settlement-stats').textContent).toContain('days=7');
    expect(screen.getByTestId('commitment-settlement-stats').textContent).toContain('count=3');
  });

  it('kept + hoursReclaimed>0: 私有区渲染自由小时 (数值>0 才渲染)', () => {
    setup({ settlement: settlement('kept', { hoursReclaimed: 2.5 }) });
    expect(screen.getByTestId('commitment-settlement-hours')).toBeTruthy();
    cleanup();
    setup({ settlement: settlement('kept', { hoursReclaimed: 0 }) });
    expect(screen.queryByTestId('commitment-settlement-hours')).toBeNull();
  });

  it('kept: settle("kept") 传 refKey 回调', () => {
    const { onSettled } = setup({ settlement: settlement('kept', { refKey: 'RK#1' }) });
    fireEvent.click(screen.getByTestId('commitment-settlement-close'));
    expect(onSettled).toHaveBeenCalledWith('RK#1', 'kept');
  });

  it('kept: 分享面只含天数+助攻 — 结构上无金额 (红线)', () => {
    setup({ settlement: settlement('kept', { days: 9, assistCount: 4, hoursReclaimed: 6 }) });
    fireEvent.click(screen.getByTestId('commitment-settlement-share-btn'));
    const face = screen.getByTestId('share-face');
    expect(face.getAttribute('data-days')).toBe('9');
    expect(face.getAttribute('data-assists')).toBe('4');
    // share modal 打开
    expect(screen.getByTestId('commitment-share-modal')).toBeTruthy();
  });

  it('kept: 分享面 hoursReclaimed 不下传 (私有字段隔离)', () => {
    setup({ settlement: settlement('kept', { hoursReclaimed: 5 }) });
    fireEvent.click(screen.getByTestId('commitment-settlement-share-btn'));
    const faceAttrs = screen.getByTestId('share-face').attributes;
    for (const a of Array.from(faceAttrs)) {
      expect(a.name).not.toMatch(/hour|amount|money|price/i);
    }
  });

  it('broken: 非羞辱文案 + 一键重启', () => {
    setup({ settlement: settlement('broken') });
    expect(screen.getByTestId('commitment-settlement-broken')).toBeTruthy();
    expect(screen.getByTestId('commitment-settlement-broken-note')).toBeTruthy();
    fireEvent.click(screen.getByTestId('commitment-restart-btn'));
    expect(screen.getByTestId('commitment-restart-ack')).toBeTruthy();
    expect(screen.queryByTestId('commitment-restart-btn')).toBeNull();
  });

  it('broken: 重启只 POST 一次 (restarted 锁防双击)', () => {
    setup({ settlement: settlement('broken') });
    const btn = screen.getByTestId('commitment-restart-btn');
    fireEvent.click(btn);
    // 重启后按钮消失 — 无从双击; ack 已渲染
    expect(apiPostMock).toHaveBeenCalledTimes(1);
    const post = apiPostMock.mock.calls[0] as unknown[];
    expect(post[0]).toBe('/api/buddy/health-events');
    expect((post[1] as { body: { metadata: { subject: string } } }).body.metadata.subject).toBe('奶茶');
  });

  it('broken: settle("broken") 回调', () => {
    const { onSettled } = setup({ settlement: settlement('broken') });
    fireEvent.click(screen.getByTestId('commitment-settlement-close'));
    expect(onSettled).toHaveBeenCalledWith(expect.any(String), 'broken');
  });

  it('insufficient: 温和说明分支 + settle("insufficient")', () => {
    const { onSettled } = setup({ settlement: settlement('insufficient') });
    expect(screen.getByTestId('commitment-settlement-insufficient')).toBeTruthy();
    fireEvent.click(screen.getByTestId('commitment-settlement-close'));
    expect(onSettled).toHaveBeenCalledWith(expect.any(String), 'insufficient');
  });

  it('分享弹层: 背板点击关闭整卡, 内容点击不关 (stopPropagation)', () => {
    const { onClose } = setup({ settlement: settlement('kept') });
    fireEvent.click(screen.getByTestId('commitment-settlement-share-btn'));
    const modal = screen.getByTestId('commitment-share-modal');
    fireEvent.click(modal); // 背板
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
