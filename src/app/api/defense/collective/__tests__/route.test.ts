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
});
