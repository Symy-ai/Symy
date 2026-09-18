/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * GET /api/community/inducement-strategies 路由测试 (batch81-b)
 *
 * mock admin supabase 计数: 聚合数学 / sample 阈值 / 查询失败与 admin 缺失降级 / 分页翻页。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const adminSupabase = {
  from: vi.fn(),
};

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async () => handler({ request: new NextRequest('http://localhost/api/community/inducement-strategies'), user: { id: 'user-1' }, supabase: {} });
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: adminSupabase, error: null })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';

type RangeResult = { data: unknown; error: unknown };

function stubRange(result: RangeResult | Promise<RangeResult>) {
  return {
    select: vi.fn(() => ({
      gte: vi.fn(() => ({
        order: vi.fn(() => ({
          range: vi.fn(async () => result),
        })),
      })),
    })),
  };
}

function row(rawText: string) {
  return { is_flash_sale: false, title: null, raw_text: rawText };
}

const PAGE = 1000;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/community/inducement-strategies', { method: 'GET' });
}

describe('GET /api/community/inducement-strategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates 7-day events into descending percentages and marks real at ≥20 classified', async () => {
    const events = [
      ...Array.from({ length: 20 }, () => row('flash sale limited time offer')),
      ...Array.from({ length: 5 }, () => row('Klarna pay in 4')),
    ];
    adminSupabase.from.mockReturnValue(stubRange({ data: events, error: null }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.source).toBe('real');
    expect(json.totalEvents).toBe(25);
    expect(json.strategies).toEqual([
      { strategy: 'limited_time', labelKey: 'defense.strategyLimitedTime', defaultLabel: 'Limited-time countdown', percentage: 80 },
      { strategy: 'bnpl', labelKey: 'defense.strategyBnpl', defaultLabel: 'BNPL "4 interest-free payments"', percentage: 20 },
    ]);
  });

  it('marks source=sample below the 20-event threshold but still returns the partial ranking', async () => {
    adminSupabase.from.mockReturnValue(stubRange({ data: [row('flash sale'), row('only 2 left')], error: null }));

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.source).toBe('sample');
    expect(json.totalEvents).toBe(2);
    expect(json.strategies).toHaveLength(2);
  });

  it('returns an empty sample payload when there are no events at all', async () => {
    adminSupabase.from.mockReturnValue(stubRange({ data: [], error: null }));

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json).toEqual({ strategies: [], source: 'sample', totalEvents: 0 });
  });

  it('degrades to an empty sample payload when the aggregation query fails', async () => {
    adminSupabase.from.mockReturnValue(stubRange({ data: null, error: { message: 'db down' } }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ strategies: [], source: 'sample', totalEvents: 0 });
  });

  it('degrades to an empty sample payload when the admin client is unavailable', async () => {
    const { createAdminClient } = await import('@/lib/supabase-admin');
    vi.mocked(createAdminClient).mockImplementationOnce(() => ({ supabase: null, error: 'missing key' }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ strategies: [], source: 'sample', totalEvents: 0 });
  });

  it('paginates past the 1000-row PostgREST page size and stops on the short page', async () => {
    const fullPage = Array.from({ length: PAGE }, () => row('flash sale'));
    adminSupabase.from
      .mockReturnValueOnce(stubRange({ data: fullPage, error: null }))
      .mockReturnValueOnce(stubRange({ data: [row('Klarna pay in 4')], error: null }));

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(adminSupabase.from).toHaveBeenCalledTimes(2);
    expect(json.totalEvents).toBe(PAGE + 1);
    expect(json.source).toBe('real');
    expect(json.strategies[0].strategy).toBe('limited_time');
  });

  it('swallows unexpected query builder exceptions into the sample payload', async () => {
    adminSupabase.from.mockReturnValue(stubRange(Promise.reject(new Error('boom'))));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ strategies: [], source: 'sample', totalEvents: 0 });
  });
});
