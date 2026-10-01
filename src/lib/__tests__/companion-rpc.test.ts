/**
 * Companion RPC helper tests — fire-and-forget 契约锁定
 *
 * 断言对齐现状:
 * - admin client 不可用时只 warn 且不抛错
 * - RPC 返回 error 时吞错并 warn
 * - RPC throw 时吞错并 warn
 * - variety 路径按最近 10 条选 key, 且 query 失败/异常都降级到默认 key
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/buddy-proactive-messages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/buddy-proactive-messages')>();
  return {
    ...actual,
    pickMessageTextKey: vi.fn(() => 'buddy.proactiveMessages.low_vitality_2'),
  };
});

import {
  awakenPersonality,
  fireAddProactiveMessage,
  fireAddProactiveMessages,
  fireAddProactiveMessageWithVariety,
  fireBumpIntimacy,
  fireReplenishDailyNeed,
} from '@/lib/companion-rpc';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { MESSAGE_FALLBACK } from '@/lib/buddy-proactive-messages';

const mockedCreateAdminClient = vi.mocked(createAdminClient);
const rpc = vi.fn();
const from = vi.fn();

function mockClient() {
  mockedCreateAdminClient.mockReturnValue({ supabase: { rpc, from } as never, error: null });
}

beforeEach(() => {
  mockedCreateAdminClient.mockReset();
  mockedCreateAdminClient.mockReturnValue({ supabase: { rpc, from } as never, error: null });
  rpc.mockReset().mockResolvedValue({ error: null });
  from.mockReset();
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.info).mockClear();
  vi.mocked(logger.error).mockClear();
});

it('fireReplenishDailyNeed 默认 clarity 补充 20', async () => {
  mockClient();
  await fireReplenishDailyNeed('user-1', 'clarity');
  expect(rpc).toHaveBeenCalledWith('replenish_daily_need', {
    p_user_id: 'user-1',
    p_need_type: 'clarity',
    p_amount: 20,
  });
});

it('fireReplenishDailyNeed 默认 connection 补充 15，显式 amount 优先', async () => {
  mockClient();
  await fireReplenishDailyNeed('user-1', 'connection', 30);
  expect(rpc.mock.calls[0][1].p_amount).toBe(30);
});

it('fireBumpIntimacy 主路径传入 delta', async () => {
  mockClient();
  await fireBumpIntimacy('user-1', 8);
  expect(rpc).toHaveBeenCalledWith('bump_intimacy', { p_user_id: 'user-1', p_delta: 8 });
});

it('fireAddProactiveMessage RPC error 不抛出并记录 warn', async () => {
  mockClient();
  rpc.mockResolvedValue({ error: { message: 'insert failed' } });
  await expect(fireAddProactiveMessage('u', 'low_vitality', 'k', 'fallback')).resolves.toBeUndefined();
  expect(logger.warn).toHaveBeenCalledWith(
    '[Companion] add_proactive_message(low_vitality) RPC error:',
    'insert failed',
  );
});

it('fireAddProactiveMessages 空数组直接短路，不创建 admin client', async () => {
  await fireAddProactiveMessages('u', []);
  expect(mockedCreateAdminClient).not.toHaveBeenCalled();
});

it('fireAddProactiveMessages 多条消息并行且失败不影响其他调用', async () => {
  mockClient();
  rpc
    .mockResolvedValueOnce({ error: new Error('first failed') })
    .mockResolvedValueOnce({ error: null });
  const messages = [
    { id: '1', trigger: 'morning_checkin' as const, textKey: 'a', textFallback: 'A', createdAt: '', read: false },
    { id: '2', trigger: 'low_vitality' as const, textKey: 'b', textFallback: 'B', createdAt: '', read: false },
  ];
  await fireAddProactiveMessages('u', messages);
  expect(rpc).toHaveBeenCalledTimes(2);
});

it('fireAddProactiveMessageWithVariety 只取最近 10 条并避开已用 key', async () => {
  mockClient();
  const messages = Array.from({ length: 12 }, (_, i) => ({
    textKey: `key-${i}`,
    createdAt: new Date(2026, 0, i).toISOString(),
  }));
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { proactive_messages: messages }, error: null }),
  };
  from.mockReturnValue(builder);
  await fireAddProactiveMessageWithVariety('u', 'low_vitality');
  expect(builder.maybeSingle).toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('add_proactive_message', {
    p_user_id: 'u',
    p_trigger: 'low_vitality',
    p_text_key: 'buddy.proactiveMessages.low_vitality_2',
    p_text_fallback: MESSAGE_FALLBACK.low_vitality,
  });
});

it('awakenPersonality RPC throw 时返回 false 并 warn', async () => {
  mockClient();
  rpc.mockRejectedValue(new Error('network down'));
  await expect(awakenPersonality('u', 'sage')).resolves.toBe(false);
  expect(logger.warn).toHaveBeenCalledWith(
    '[Companion] awaken_buddy_personality(sage) threw:',
    expect.any(Error),
  );
});

it('awakenPersonality admin client 不可用时返回 false，不调用 RPC', async () => {
  mockedCreateAdminClient.mockReturnValue({ supabase: null, error: 'env missing' });
  await expect(awakenPersonality('u', 'guardian')).resolves.toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});
