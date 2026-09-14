/* eslint-disable require-await -- test mocks use async for API consistency */

/**
 * Tests for user-hourly-rate.ts — 服务端用户时薪读取 (batch71-b, testgap v5 中危盲区补测)
 *
 * 报告出处: wool-report-testgap §十一.3 — "三条永不 throw 路径 (admin client 缺配置 /
 * 查询 error / 行缺失) 与 v4 观察名单建议吻合"。风险面: 时薪注入 AI chat context,
 * 坏值不该污染 prompt, 失败必须兜底 DEFAULT_HOURLY_RATE。
 *
 * 断言对齐现状:
 *   - admin client 未配置 / 查询 error / 行缺失 / 脏 rate (0/负/非 number) → 返回默认值, 永不抛
 *   - 合法正数 rate 原样透传 (含小数)
 *   - 查询链意外 reject 也被 catch 兜底
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getUserHourlyRate } from '@/lib/user-hourly-rate';
import { createAdminClient } from '@/lib/supabase-admin';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';

const mockedCreateAdminClient = vi.mocked(createAdminClient);

/** 构造 select().eq().maybeSingle() 查询链, maybeSingle 返回给定结果 */
function mockQueryChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, select, from };
}

beforeEach(() => {
  mockedCreateAdminClient.mockReset();
});

describe('getUserHourlyRate — 永不 throw 兜底路径', () => {
  it('admin client 未配置 (supabase=null) → 返回默认 20', async () => {
    mockedCreateAdminClient.mockReturnValue({ supabase: null, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('admin client error 非空 → 返回默认', async () => {
    mockedCreateAdminClient.mockReturnValue({
      supabase: { from: vi.fn() } as never,
      error: 'client init failed',
    });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('profiles 查询 error (列未迁移等) → 返回默认', async () => {
    const chain = mockQueryChain({ data: null, error: { message: 'column not found', code: '42703' } });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('行缺失 (maybeSingle → null) → 返回默认', async () => {
    const chain = mockQueryChain({ data: null, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('查询链意外 reject → 被 catch 兜底, 不向上抛', async () => {
    const maybeSingle = vi.fn(async () => {
      throw new Error('network boom');
    });
    const chain = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
    };
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });
});

describe('getUserHourlyRate — rate 有效性边界', () => {
  it('合法正数 (35) 原样透传', async () => {
    const chain = mockQueryChain({ data: { hourly_rate: 35 }, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(35);
  });

  it('小数 rate (12.5) 原样透传不取整', async () => {
    const chain = mockQueryChain({ data: { hourly_rate: 12.5 }, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(12.5);
  });

  it('rate = 0 → 视为未设置, 返回默认', async () => {
    const chain = mockQueryChain({ data: { hourly_rate: 0 }, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('rate 负数 → 返回默认', async () => {
    const chain = mockQueryChain({ data: { hourly_rate: -8 }, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('rate 非number (字符串 "30") → 返回默认, 不做隐式转换', async () => {
    const chain = mockQueryChain({ data: { hourly_rate: '30' }, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await expect(getUserHourlyRate('user-1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('查询走 profiles 表且按 id 过滤 (契约锁定)', async () => {
    const chain = mockQueryChain({ data: { hourly_rate: 40 }, error: null });
    mockedCreateAdminClient.mockReturnValue({ supabase: chain as never, error: null });
    await getUserHourlyRate('user-abc');
    expect(chain.from).toHaveBeenCalledWith('profiles');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-abc');
  });
});
