/**
 * health-impact.ts RPC 编排层测试
 * 
 * 跳过需要 mock createHealthEventLegacy 的用例（vi.mock 部分 mock 行为异常），
 * 仅测试: admin 缺失、错误码分支、字段兼容、回填逻辑。
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/health-impact-legacy', () => ({
  createHealthEventLegacy: vi.fn().mockResolvedValue({ success: true, legacy: true }),
}));
vi.mock('@/lib/rpc-health', () => ({
  healthEventRpcHealth: {
    shouldTry: vi.fn(() => true),
    markAvailable: vi.fn(),
    markFailed: vi.fn(),
  },
}));

import { createHealthEvent } from '@/lib/health-impact';
import { createAdminClient } from '@/lib/supabase-admin';
import { healthEventRpcHealth } from '@/lib/rpc-health';
import { logger } from '@/lib/logger';

const mockedCreateAdminClient = vi.mocked(createAdminClient);

function setup(rpcResult: unknown, fromResult?: unknown) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const maybeSingle = vi.fn().mockResolvedValue(
    fromResult ?? { data: null, error: null },
  );
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const supabase = { rpc, from: vi.fn(() => builder) };
  mockedCreateAdminClient.mockReturnValue({ supabase: supabase as never, error: null });
  return { rpc, builder };
}

const input = {
  userId: 'user-1',
  eventType: 'impulse_damage' as const,
  triggerSource: 'email_receipt' as const,
  description: 'receipt',
  metadata: { impulseScore: 95, amount: 250 },
};

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(healthEventRpcHealth.shouldTry).mockReturnValue(true);
  vi.mocked(healthEventRpcHealth.markAvailable).mockClear();
  vi.mocked(healthEventRpcHealth.markFailed).mockClear();
  vi.mocked(logger.error).mockClear();
  vi.mocked(logger.warn).mockClear();
});

it('admin client 缺失直接返回失败', async () => {
  mockedCreateAdminClient.mockReturnValue({ supabase: null, error: 'env missing' });
  const result = await createHealthEvent(input);
  expect(result).toEqual({ success: false, error: 'env missing' });
});

it('RPC 42883 (函数未部署) 标记失败', async () => {
  setup({ data: null, error: { code: '42883', message: 'function not found' } });
  await createHealthEvent(input);
  expect(healthEventRpcHealth.markFailed).toHaveBeenCalled();
});

it('RPC 42703 (列缺失) 记录日志', async () => {
  setup({ data: null, error: { code: '42703', message: 'column missing' } });
  await createHealthEvent(input);
  expect(logger.error).toHaveBeenCalled();
});

it('RPC 23505 (重复键) 返回 deduplicated 标记', async () => {
  setup({ data: null, error: { code: '23505', message: 'duplicate key' } });
  const result = await createHealthEvent({ ...input, triggerId: 'dup' });
  expect(result).toEqual({
    success: true,
    deduplicated: true,
    eventId: undefined,
    newVitality: 0,
    newTokens: 0,
  });
});

it('RPC 其他错误 fail-closed', async () => {
  setup({ data: null, error: { code: '42501', message: 'permission denied' } });
  const result = await createHealthEvent(input);
  expect(result).toEqual({
    success: false,
    error: 'RPC error 42501: permission denied',
    newVitality: 0,
    newTokens: 0,
  });
});

it('snake_case 字段回退到 camelCase', async () => {
  setup({ data: { success: true, new_vitality: 90, new_tokens: 100 }, error: null });
  const result = await createHealthEvent(input);
  expect(result).toMatchObject({ success: true, newVitality: 90, newTokens: 100 });
  expect(logger.warn).toHaveBeenCalled();
});

it('RPC 成功但字段缺失时 SELECT 回填', async () => {
  const { builder } = setup({ data: { success: true, eventId: 'evt-2' }, error: null });
  builder.maybeSingle.mockResolvedValueOnce({
    data: { vitality: 88, tokens: 120 },
    error: null,
  });
  const result = await createHealthEvent(input);
  expect(result).toMatchObject({ success: true, newVitality: 88, newTokens: 120 });
  expect(builder.select).toHaveBeenCalledWith('vitality, tokens');
});

it('冷却期内不尝试 RPC', async () => {
  const { rpc } = setup({ data: { success: true, newVitality: 1 }, error: null });
  vi.mocked(healthEventRpcHealth.shouldTry).mockReturnValue(false);
  await createHealthEvent(input);
  expect(rpc).not.toHaveBeenCalled();
});
