/**
 * green-alt-rejection 客户端上报封装测试 (batch62-b)
 *
 * - 冷却窗内同 entry 同 reason 只发一次请求 (幂等, 不制造垃圾事件)
 * - 不同 reason 可上报 (用户改口 = 更新偏好)
 * - 冷却过期后同 entry 同 reason 可再上报 (刷新偏好)
 * - 载荷走既有 /api/buddy/health-events manual_adjustment 审计通道
 * - 上报失败静默降级 (不抛错, latest 回放照常)
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGreenAltRejectionForTest,
  _seedGreenAltRejectionForTest,
  latestGreenAltRejectionReason,
  reportGreenAltRejection,
} from '../green-alt-rejection';
import { GREEN_ALT_ENTRY_COOLDOWN_DAYS } from '@/lib/green-alt-preference';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { apiFetch } from '@/lib/api-client';

const DAY_MS = 86400000;

afterEach(() => {
  _resetGreenAltRejectionForTest();
  vi.clearAllMocks();
});

describe('reportGreenAltRejection', () => {
  it('首次上报: 走既有 manual_adjustment 通道 + metadata 全量口径', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });

    const outcome = await reportGreenAltRejection('fur', 'not_now');
    expect(outcome.status).toBe('recorded');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(apiFetch).mock.calls[0] as [string, { method: string; body: { eventType: string; triggerId: string; metadata: Record<string, unknown> } }];
    expect(url).toBe('/api/buddy/health-events');
    expect(init.method).toBe('POST');
    expect(init.body.eventType).toBe('manual_adjustment');
    expect(init.body.triggerId).toContain('green-alt-rejection:fur:not_now:');
    expect(init.body.metadata).toEqual({
      source: 'green_alt_rejection',
      entryId: 'fur',
      category: 'wear',
      reason: 'not_now',
    });
  });

  it('冷却窗内同 entry 同 reason 重复点击 → duplicate 不发请求', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });

    await reportGreenAltRejection('fur', 'not_now');
    const again = await reportGreenAltRejection('fur', 'not_now');
    expect(again.status).toBe('duplicate');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('同 entry 不同 reason 可上报 (改口更新偏好)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });

    await reportGreenAltRejection('fur', 'not_now');
    const changed = await reportGreenAltRejection('fur', 'prefer_buy');
    expect(changed.status).toBe('recorded');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(latestGreenAltRejectionReason('fur')).toBe('prefer_buy');
  });

  it('冷却过期后同 entry 同 reason 可再上报 (偏好刷新)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });
    const days = GREEN_ALT_ENTRY_COOLDOWN_DAYS.not_now;

    _seedGreenAltRejectionForTest('fur', 'not_now', Date.now() - (days + 1) * DAY_MS);
    const refreshed = await reportGreenAltRejection('fur', 'not_now');
    expect(refreshed.status).toBe('recorded');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('未知词条 → invalid 不发请求', async () => {
    const outcome = await reportGreenAltRejection('definitely_not_an_entry', 'not_now');
    expect(outcome.status).toBe('invalid');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('上报失败静默降级: 不抛错, latest 回放照常', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));

    const outcome = await reportGreenAltRejection('fur', 'wrong_channel');
    expect(outcome.status).toBe('recorded');
    expect(latestGreenAltRejectionReason('fur')).toBe('wrong_channel');
  });

  it('无记录时 latest 回放为 null', () => {
    expect(latestGreenAltRejectionReason('fur')).toBeNull();
  });
});
