/**
 * green-alt-adoption 客户端上报封装测试 (batch45-a)
 *
 * - 同一 entryId 只发一次请求 (localStorage 去重)
 * - 上报失败静默降级 (不抛错, UI 仍进已确认态)
 *
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGreenAltAdoptionForTest,
  isGreenAltAdoptionReported,
  reportGreenAltAdoption,
} from '../green-alt-adoption';
import { logger } from '@/lib/logger';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { apiFetch } from '@/lib/api-client';

afterEach(() => {
  _resetGreenAltAdoptionForTest();
  vi.clearAllMocks();
});

describe('reportGreenAltAdoption', () => {
  it('同一 entryId 只上报一次, 第二次返回 duplicate 且不发请求', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });

    const first = await reportGreenAltAdoption('fur');
    expect(first.status).toBe('reported');
    expect(apiFetch).toHaveBeenCalledTimes(1);

    const second = await reportGreenAltAdoption('fur');
    expect(second.status).toBe('duplicate');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('不同 entryId 各自上报', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });
    await reportGreenAltAdoption('fur');
    await reportGreenAltAdoption('tissues');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('上报失败静默降级: 不抛错, 本地仍记账 (logger.warn)', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('401 unauthorized'));

    const result = await reportGreenAltAdoption('fur');
    expect(result.status).toBe('reported');
    expect(logger.warn).toHaveBeenCalled();

    // 失败后也不重试 — 已本地记账
    const again = await reportGreenAltAdoption('fur');
    expect(again.status).toBe('duplicate');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('isGreenAltAdoptionReported 反映本地记账状态', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ success: true });
    expect(isGreenAltAdoptionReported('batteries')).toBe(false);
    await reportGreenAltAdoption('batteries');
    expect(isGreenAltAdoptionReported('batteries')).toBe(true);
  });
});
