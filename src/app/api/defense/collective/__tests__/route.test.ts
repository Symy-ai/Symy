import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/transparency-weekly-server', () => ({
  loadTransparencyWeekly: vi.fn(),
}));

import { GET } from '../route';
import { loadTransparencyWeekly } from '@/lib/transparency-weekly-server';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/defense/collective', () => {
  it('returns only collective hours and guards', async () => {
    vi.mocked(loadTransparencyWeekly).mockResolvedValue({
      hoursWon: { week: 2, total: 1234.5 },
      guards: 9876,
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ hours: 1234.5, guards: 9876 });
    expect(response.headers.get('Cache-Control')).toContain('public, max-age=60');
  });

  it('loadTransparencyWeekly null → snapshot.hoursWon.total 崩前守卫 (route 信任上游, 此处锚 null 传播现状)', async () => {
    vi.mocked(loadTransparencyWeekly).mockResolvedValue(null as never);
    await expect(GET()).rejects.toThrow(); // 现状: null 直接访问崩 → 500 (上游契约由 transparency-weekly-server 测试锁)
  });

  it('Cache-Control 全量: s-maxage=300 + stale-while-revalidate=600 (CDN 梯度)', async () => {
    vi.mocked(loadTransparencyWeekly).mockResolvedValue({ hoursWon: { week: 1, total: 1 }, guards: 1 } as never);
    const response = await GET();
    const cc = response.headers.get('Cache-Control') ?? '';
    expect(cc).toContain('s-maxage=300');
    expect(cc).toContain('stale-while-revalidate=600');
  });
});
