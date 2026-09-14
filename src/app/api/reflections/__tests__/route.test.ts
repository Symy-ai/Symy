/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * Tests for GET /api/reflections — QA 测试数据显示层过滤 (content-gate)。
 * mock supabase 回含 QA 条目的表数据, 断言响应里不含被 gate 的行。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      return handler({ request, user: { id: 'user-123' }, supabase });
    };
  },
}));

const mockRows = [
  { id: '1', avatar: '🌙', text: 'QA138-GRANT后UI提交验证', text_zh: null, resonates: 0, is_seed: false, created_at: '2026-09-06T01:00:00Z' },
  { id: '2', avatar: '🌿', text: 'QA138-GRANT验证-直插', text_zh: null, resonates: 0, is_seed: false, created_at: '2026-09-06T02:00:00Z' },
  { id: '3', avatar: '🐘', text: 'A quiet week — every guard counted.', text_zh: '安静的一周——每一次守住都算数', resonates: 2, is_seed: true, created_at: '2026-09-05T10:00:00Z' },
];

const supabase = {
  from: vi.fn(),
};

function chainWith(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(async () => result),
      })),
    })),
  };
}

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';

function makeRequest(locale: 'en' | 'zh'): NextRequest {
  return new NextRequest(`http://localhost/api/reflections?locale=${locale}`, { method: 'GET' });
}

describe('GET /api/reflections — content gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockImplementation(() => chainWith({ data: mockRows, error: null }));
  });

  it('never returns QA/test entries in the feed', async () => {
    const res = await GET(makeRequest('zh'));
    expect(res.status).toBe(200);
    const json = await res.json();
    const texts = json.reflections.map((r: { text: string }) => r.text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toBe('安静的一周——每一次守住都算数');
    expect(JSON.stringify(json)).not.toContain('QA138');
  });

  it('keeps seed and normal entries with zh text swap intact', async () => {
    const res = await GET(makeRequest('en'));
    const json = await res.json();
    expect(json.reflections).toHaveLength(1);
    expect(json.reflections[0].text).toBe('A quiet week — every guard counted.');
  });

  it('returns an empty list without crashing when the table read fails', async () => {
    supabase.from.mockImplementationOnce(() => chainWith({ data: null, error: { message: 'db down' } }));
    const res = await GET(makeRequest('en'));
    expect(res.status).toBe(200);
    expect((await res.json()).reflections).toEqual([]);
  });
});
