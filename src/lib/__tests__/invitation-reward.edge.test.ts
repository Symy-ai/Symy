/**
 * invitation-reward edge tests — 幂等与防滥用分支（补 invitation-reward.test.ts 未覆盖路径）
 *
 * batch83-c (testgap v9 长尾): K 因子数据源质量固化。主测试文件已覆盖 happy path 与
 * 审计路径；本文件锁死奖励不被重复发放的防御分支：
 *   - 非 pending（已完成）invitation → noAward，pending 过滤器固化（重复调用幂等）
 *   - CAS 抢锁失败（并发第二请求）→ noAward，零奖励写库
 *   - CAS UPDATE 出错 → noAward
 *   - referrer 每日上限命中 → claim 回滚为 pending，noAward
 *   - lib 层自邀 → status=rejected（CAS 条件更新），noAward
 *   - admin client 不可用 / invitations 表缺失 (42P01) → noAward 优雅降级
 *   - generateRefCode: 8 字符 base62、CSPRNG
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { processInvitationReward, generateRefCode } from '@/lib/invitation-reward';
import { createAdminClient } from '@/lib/supabase-admin';

const REFEREE = 'referee-123';
const REFERRER = 'referrer-456';
const INVITATION = {
  id: 'inv-1',
  referrer_user_id: REFERRER,
  referee_user_id: REFEREE,
  status: 'pending',
  reward_amount: 50,
};

interface EqRecord {
  table: string;
  col: string;
  val: unknown;
}
interface UpdateRecord {
  table: string;
  payload: Record<string, unknown>;
}
interface DbLog {
  tables: string[];
  eq: EqRecord[];
  updates: UpdateRecord[];
}

/** select().eq()×eqCount → terminal() → value（记录 eq 实参，固化查询过滤器） */
function selectChain(
  log: DbLog,
  table: string,
  eqCount: number,
  terminal: 'maybeSingle' | 'gte',
  value: unknown
): unknown {
  const eqFn = (i: number) => (col: string, val: unknown) => {
    log.eq.push({ table, col, val });
    if (i + 1 < eqCount) return { eq: eqFn(i + 1) };
    return { [terminal]: () => Promise.resolve(value) };
  };
  return { select: () => ({ eq: eqFn(0) }) };
}

/** update(payload).eq()×n；selectResult 给定 → .select().maybeSingle()（CAS 形态），否则链可直接 await */
function updateChain(
  log: DbLog,
  table: string,
  opts: { eqCount: number; selectResult?: { data: unknown; error: unknown } | null; awaitResult?: { error: unknown } }
): unknown {
  return {
    update: (payload: Record<string, unknown>) => {
      log.updates.push({ table, payload });
      const eqFn = (i: number) => (col: string, val: unknown) => {
        log.eq.push({ table, col, val });
        if (i + 1 < opts.eqCount) return { eq: eqFn(i + 1) };
        if (opts.selectResult !== undefined) {
          return { select: () => ({ maybeSingle: () => Promise.resolve(opts.selectResult) }) };
        }
        return opts.awaitResult ?? { error: null };
      };
      return { eq: eqFn(0) };
    },
  };
}

/** 安装 from() 分发器：handlers[table](第 n 次调用) → 链；缺省表按 health_events.insert 处理 */
function installDb(handlers: Record<string, (n: number) => unknown>): DbLog {
  const log: DbLog = { tables: [], eq: [], updates: [] };
  const counts = new Map<string, number>();
  mockSupabaseFrom.mockImplementation((table: string) => {
    const n = (counts.get(table) ?? 0) + 1;
    counts.set(table, n);
    log.tables.push(table);
    return handlers[table]?.(n) ?? { insert: () => Promise.resolve({ error: null }) };
  });
  return log;
}

describe('processInvitationReward — 幂等与防滥用（batch83-c）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminClient).mockReturnValue({
      supabase: { from: mockSupabaseFrom },
      error: null,
    } as never);
  });

  it('非 pending（已完成）invitation → noAward：pending 过滤器固化，重复调用零写库（幂等）', async () => {
    const log = installDb({
      invitations: () => selectChain(log, 'invitations', 2, 'maybeSingle', { data: null, error: null }),
    });

    const result = await processInvitationReward(REFEREE);
    expect(result.awarded).toBe(false);
    expect(result.refereePremiumDaysAwarded).toBe(0);
    // 查询固化 referee_user_id + status=pending：完成后再调用查不到 pending → 不再发奖
    expect(log.eq).toEqual([
      { table: 'invitations', col: 'referee_user_id', val: REFEREE },
      { table: 'invitations', col: 'status', val: 'pending' },
    ]);
    expect(log.updates).toEqual([]);
    expect(log.tables).toEqual(['invitations']);
  });

  it('CAS 抢锁失败（并发第二请求 claim 到 data:null）→ noAward，零奖励写库', async () => {
    const log = installDb({
      invitations: (n) => {
        if (n === 1) return selectChain(log, 'invitations', 2, 'maybeSingle', { data: INVITATION, error: null });
        return updateChain(log, 'invitations', { eqCount: 2, selectResult: { data: null, error: null } });
      },
    });

    const result = await processInvitationReward(REFEREE);
    expect(result).toMatchObject({
      awarded: false,
      refereePremiumDaysAwarded: 0,
      referrerUserId: null,
      referrerPremiumDaysAwarded: 0,
    });
    // CAS update 已发出（payload 固化），但另一请求持有锁 → 不得触碰 profiles/buddy_state/health_events
    expect(log.updates).toHaveLength(1);
    expect(log.updates[0].payload.status).toBe('completed');
    expect(log.tables).toEqual(['invitations', 'invitations']);
  });

  it('CAS UPDATE 出错 → noAward，不触碰 profiles', async () => {
    const log = installDb({
      invitations: (n) => {
        if (n === 1) return selectChain(log, 'invitations', 2, 'maybeSingle', { data: INVITATION, error: null });
        return updateChain(log, 'invitations', {
          eqCount: 2,
          selectResult: { data: null, error: { message: 'claim exploded', code: '40001' } },
        });
      },
    });

    const result = await processInvitationReward(REFEREE);
    expect(result.awarded).toBe(false);
    expect(log.tables).toEqual(['invitations', 'invitations']);
  });

  it('referrer 每日上限命中（今日 completed=51 > 50）→ claim 回滚 pending+completed_at:null，noAward', async () => {
    const log = installDb({
      invitations: (n) => {
        if (n === 1) return selectChain(log, 'invitations', 2, 'maybeSingle', { data: INVITATION, error: null });
        if (n === 2) {
          return updateChain(log, 'invitations', { eqCount: 2, selectResult: { data: { id: 'inv-1' }, error: null } });
        }
        if (n === 3) return selectChain(log, 'invitations', 2, 'gte', { count: 51, error: null });
        return updateChain(log, 'invitations', { eqCount: 2 });
      },
    });

    const result = await processInvitationReward(REFEREE);
    expect(result.awarded).toBe(false);
    // 回滚 CAS 条件更新：只回滚自己抢到的这条（status=completed），双方 trial 不动
    expect(log.updates).toHaveLength(2);
    expect(log.updates[1]).toEqual({
      table: 'invitations',
      payload: { status: 'pending', completed_at: null },
    });
    expect(log.eq.filter((e) => e.table === 'invitations').slice(-2)).toEqual([
      { table: 'invitations', col: 'id', val: 'inv-1' },
      { table: 'invitations', col: 'status', val: 'completed' },
    ]);
    expect(log.tables).not.toContain('profiles');
  });

  it('lib 层自邀（referrer == referee）→ status=rejected 且 CAS 仅限 pending，noAward', async () => {
    const log = installDb({
      invitations: (n) => {
        if (n === 1) {
          return selectChain(log, 'invitations', 2, 'maybeSingle', {
            data: { ...INVITATION, referrer_user_id: REFEREE },
            error: null,
          });
        }
        return updateChain(log, 'invitations', { eqCount: 2 });
      },
    });

    const result = await processInvitationReward(REFEREE);
    expect(result.awarded).toBe(false);
    expect(log.updates).toEqual([{ table: 'invitations', payload: { status: 'rejected' } }]);
    expect(log.eq.slice(-2)).toEqual([
      { table: 'invitations', col: 'id', val: 'inv-1' },
      { table: 'invitations', col: 'status', val: 'pending' },
    ]);
    expect(log.tables).toEqual(['invitations', 'invitations']);
  });

  it('admin client 不可用 → noAward，零查库', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ supabase: null, error: 'no key' } as never);
    const result = await processInvitationReward(REFEREE);
    expect(result.awarded).toBe(false);
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('invitations 表缺失（migration 086 未应用, 42P01）→ noAward 优雅降级', async () => {
    const log = installDb({
      invitations: () =>
        selectChain(log, 'invitations', 2, 'maybeSingle', {
          data: null,
          error: { message: 'Could not find the table', code: '42P01' },
        }),
    });

    const result = await processInvitationReward(REFEREE);
    expect(result.awarded).toBe(false);
    expect(log.updates).toEqual([]);
    expect(log.tables).toEqual(['invitations']);
  });
});

describe('generateRefCode', () => {
  it('8 字符 base62、CSPRNG、多次调用互不相同', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = generateRefCode();
      expect(code).toMatch(/^[a-zA-Z0-9]{8}$/);
      codes.add(code);
    }
    // 62^8 ≈ 2.2e14 空间，200 次抽样碰撞概率 ~1e-10，出现碰撞即视为实现退化
    expect(codes.size).toBe(200);
  });
});
