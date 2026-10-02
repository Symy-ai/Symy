// 🔧 apicache 配套: 轮内共享快照的行为锁
// - 同 userId 并发 → 共享同一 in-flight promise（去重关键）
// - 完成后短窗内仍可复用（轮内多消费方时序不齐）
// - 失败返回 null（消费方各自回退默认值）
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createAdminClient } from '@/lib/supabase-admin';
import { getChatProfileSnapshot } from '../chat-profile-snapshot';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

function setRow(row: Record<string, unknown> | null) {
  vi.mocked(createAdminClient).mockReturnValue({
    supabase: { from },
  } as unknown as ReturnType<typeof createAdminClient>);
  maybeSingle.mockResolvedValue({ data: row, error: null });
}

describe('chat-profile-snapshot — 轮内共享快照', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('并发同 userId 去重: 两个 await 共享一次 DB 查询', async () => {
    let resolveRead: (v: { data: unknown; error: unknown }) => void = () => {};
    maybeSingle.mockImplementation(
      () => new Promise((res) => { resolveRead = res; }),
    );
    vi.mocked(createAdminClient).mockReturnValue({
      supabase: { from },
    } as unknown as ReturnType<typeof createAdminClient>);

    const p1 = getChatProfileSnapshot('u-dedup');
    const p2 = getChatProfileSnapshot('u-dedup');
    resolveRead({ data: { plan: 'premium', timezone: 'Asia/Shanghai', hourly_rate: 35 }, error: null });

    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual({ plan: 'premium', timezone: 'Asia/Shanghai', hourlyRate: 35 });
    expect(b).toBe(a); // 同一 promise 结果
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('三列映射: plan/timezone/hourly_rate → snapshot 字段', async () => {
    setRow({ plan: 'free', timezone: 'Europe/Berlin', hourly_rate: 42 });
    const snap = await getChatProfileSnapshot('u-cols');
    expect(snap).toEqual({ plan: 'free', timezone: 'Europe/Berlin', hourlyRate: 42 });
    expect(select).toHaveBeenCalledWith('plan, timezone, hourly_rate');
  });

  it('行缺失/列空 → null 字段（消费方走默认值）', async () => {
    setRow(null);
    const snap = await getChatProfileSnapshot('u-missing');
    expect(snap).toBeNull();
  });

  it('查询报错 → null（不抛, 消费方 fail-open）', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.mocked(createAdminClient).mockReturnValue({
      supabase: { from },
    } as unknown as ReturnType<typeof createAdminClient>);
    await expect(getChatProfileSnapshot('u-err')).resolves.toBeNull();
  });

  it('admin client 不可用 → null', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ supabase: null } as unknown as ReturnType<typeof createAdminClient>);
    await expect(getChatProfileSnapshot('u-noclient')).resolves.toBeNull();
  });
});
