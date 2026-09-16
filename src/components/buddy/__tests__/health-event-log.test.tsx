// @vitest-environment happy-dom
/**
 * HealthEventLog 组件测试 (batch78-a — testgap v9 §十五.2 金额/成就展示层补盲)
 *
 * 该组件零直接金额渲染: 事件描述文本来自服务端, 唯一货币相邻产物是历史时薪
 * 标注 "at ${rate}/hr then" (字面 $ + ICU {rate} 插值, 产物形如 "at $40/hr then",
 * 与全 app 时薪口径 rateBanner "$25/hr" 一致 — 整数无小数, 不走 formatCurrency)。
 * 本文件锁: 空数据降级 (loading/error/empty) 不抛不出现 NaN/undefined、
 * View All 弹窗筛选计数、快照时薪标注显隐、长描述截断、清理历史两态。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HealthEventLog } from '../health-event-log';
import type { HealthEvent } from '@/types/buddy-state';

const { apiFetchVoidMock } = vi.hoisted(() => ({ apiFetchVoidMock: vi.fn() }));

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number> & { defaultValue?: string }) => {
      let result = params?.defaultValue ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (k !== 'defaultValue') result = result.replaceAll(`{${k}}`, String(v));
        }
      }
      return result;
    },
    locale: 'en',
  }),
}));

vi.mock('@/hooks/use-hourly-rate', () => ({
  useHourlyRate: () => ({
    hourlyRate: 25,
    rateIsDefault: false,
    setHourlyRate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  apiFetchVoid: apiFetchVoidMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function event(overrides: Partial<HealthEvent> = {}): HealthEvent {
  return {
    id: 'ev-1',
    eventType: 'challenge_completed',
    vitalityChange: 3,
    newVitality: 80,
    tokenChange: 0,
    triggerSource: 'test',
    triggerId: null,
    description: 'Completed a seeing challenge',
    metadata: {},
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    ...overrides,
  };
}

function renderLog(props: Partial<Parameters<typeof HealthEventLog>[0]> = {}) {
  const onRetry = props.onRetry ?? vi.fn();
  const view = render(
    <HealthEventLog
      healthEvents={props.healthEvents ?? []}
      isLoadingEvents={props.isLoadingEvents ?? false}
      healthEventsError={props.healthEventsError ?? null}
      onRetry={onRetry}
      onCleared={props.onCleared}
      isDemo={props.isDemo}
    />
  );
  return { ...view, onRetry };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HealthEventLog 空数据降级', () => {
  it('loading 态渲染骨架, 无事件行', () => {
    const { container } = render(
      <HealthEventLog healthEvents={[]} isLoadingEvents healthEventsError={null} onRetry={vi.fn()} />
    );
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    expect(container.textContent).not.toContain('Completed a seeing challenge');
  });

  it('error 态显示错误文案 + Retry 回调', () => {
    const { onRetry } = renderLog({ healthEventsError: 'boom' });
    expect(screen.getByText('boom')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('空数组渲染空态, 无清理按钮, 全文档无 NaN/undefined', () => {
    const { container } = renderLog({ healthEvents: [] });
    expect(container.textContent).toContain('buddy.noHealthEvents');
    expect(container.textContent).toContain('buddy.healthEventsDesc');
    expect(screen.queryByTitle('Clear history')).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('HealthEventLog 事件行渲染', () => {
  it('≤5 条内联渲染: 截断 80 字符 + 活力变动正负号', () => {
    const long = 'A'.repeat(85) + 'TAIL';
    renderLog({
      healthEvents: [
        event({ id: 'a', description: long, vitalityChange: 3 }),
        event({ id: 'b', eventType: 'impulse_damage', vitalityChange: -2, description: 'Impulse' }),
        event({ id: 'c', eventType: 'manual_adjustment', vitalityChange: 0, description: 'Adjusted' }),
      ],
    });
    // 截断: 80 字符 + '...', TAIL 不出现
    expect(screen.getByText('A'.repeat(80) + '...')).toBeTruthy();
    expect(document.body.textContent).not.toContain('TAIL');
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('-2')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it('快照时薪 ≠ 当前时薪 (25) → 标注 "at $40/hr then"; 相同/非法快照 → 不标注', () => {
    renderLog({
      healthEvents: [
        event({ id: 'snap-40', metadata: { hourly_rate_snapshot: 40 } }),
        event({ id: 'snap-25', metadata: { hourly_rate_snapshot: 25 } }),
        event({ id: 'snap-bad', metadata: { hourly_rate_snapshot: Infinity } }),
        event({ id: 'snap-none' }),
      ],
    });
    const note = screen.getByText('· at $40/hr then');
    expect(note.getAttribute('title')).toBe('Hours were calculated using your hourly rate at that time');
    // 时薪产物形状: $ + 整数, 无小数 (与全 app 时薪口径一致)
    expect(note.textContent).toMatch(/^· at \$\d+\/hr then$/);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('HealthEventLog View All 弹窗', () => {
  // >80 字符的长描述: 行内截断为 80 字符 + '...', 弹窗显示全文 (含 MODALTAIL 标记)
  const LONG_DESC = 'Positive one ' + 'y'.repeat(75) + 'MODALTAIL';
  const sixEvents = [
    event({ id: '1', eventType: 'challenge_completed', description: LONG_DESC }),
    event({ id: '2', eventType: 'impulse_damage', description: 'Negative one' }),
    event({ id: '3', eventType: 'refund_boost', description: 'Positive two' }),
    event({ id: '4', eventType: 'drain', description: 'Negative two' }),
    event({ id: '5', eventType: 'mindful_recovery', description: 'Positive three' }),
    event({ id: '6', eventType: 'manual_adjustment', description: 'Neutral one' }),
  ];

  it('>5 条出现 View All, 弹窗筛选计数与全文渲染正确', () => {
    renderLog({ healthEvents: sixEvents });
    fireEvent.click(screen.getByText('View all 6 events'));

    expect(screen.getByText('All (6)')).toBeTruthy();
    expect(screen.getByText('Positive (3)')).toBeTruthy();
    expect(screen.getByText('Negative (2)')).toBeTruthy();
    expect(screen.getByText('6 events total')).toBeTruthy();
    // 弹窗内全文 (不截断), 行内截断版不进弹窗
    expect(screen.getByText(LONG_DESC)).toBeTruthy();

    fireEvent.click(screen.getByText('Negative (2)'));
    // 负面事件: 行内 + 弹窗各一条
    expect(screen.getAllByText('Negative one').length).toBe(2);
    expect(screen.getAllByText('Negative two').length).toBe(2);
    // 正向事件被筛出弹窗, 只剩行内一条
    expect(screen.getAllByText('Positive three').length).toBe(1);
    expect(screen.queryByText(LONG_DESC)).toBeNull();

    fireEvent.click(screen.getByText('All (6)'));
    expect(screen.getByText(LONG_DESC)).toBeTruthy();
  });

  it('筛选无匹配 → 空态文案, 不抛错', () => {
    // 6 条全中性事件 → Negative 筛选 0 匹配
    renderLog({ healthEvents: Array.from({ length: 6 }, (_, i) => event({ id: `n${i}`, eventType: 'manual_adjustment' })) });
    fireEvent.click(screen.getByText('View all 6 events'));
    fireEvent.click(screen.getByText('Negative (0)'));
    expect(screen.getByText('No events in this filter')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('HealthEventLog 清理历史', () => {
  it('demo 模式: 直接回调 onCleared, 不发请求', async () => {
    const onCleared = vi.fn();
    renderLog({ healthEvents: [event()], isDemo: true, onCleared });
    fireEvent.click(screen.getByTitle('Clear history'));
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(apiFetchVoidMock).not.toHaveBeenCalled();
  });

  it('非 demo 成功: DELETE 请求 + 回调', async () => {
    apiFetchVoidMock.mockResolvedValueOnce(undefined);
    const onCleared = vi.fn();
    renderLog({ healthEvents: [event()], onCleared });
    fireEvent.click(screen.getByTitle('Clear history'));
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(apiFetchVoidMock).toHaveBeenCalledWith('/api/buddy/health-events', { method: 'DELETE' });
  });

  it('非 demo 失败: 静默 warn, 不回调不抛错', async () => {
    apiFetchVoidMock.mockRejectedValueOnce(new Error('network down'));
    const onCleared = vi.fn();
    renderLog({ healthEvents: [event()], onCleared });
    fireEvent.click(screen.getByTitle('Clear history'));
    await waitFor(() => expect(apiFetchVoidMock).toHaveBeenCalled());
    await waitFor(() => {
      // 失败后按钮恢复可用 (isClearing 复位)
      expect(screen.getByTitle('Clear history').hasAttribute('disabled')).toBe(false);
    });
    expect(onCleared).not.toHaveBeenCalled();
  });
});
