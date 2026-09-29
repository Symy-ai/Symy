/**
 * letta-agent-pool 状态机单测 (Lane K — F6 盲区, 507 行零专测)
 *
 * 覆盖源码 4 条状态机主干 + admin 统计:
 * 1. createPooledAgent   — 无主 agent 创建 (env/client 缺失 / 无 id / 工具同步失败)
 * 2. assignAgentFromPool — RPC 原子分配 + letta-blocks memory 更新 + 工具附加 (全部降级路径)
 * 3. refillPool          — 补满 (池满跳过 / 创建成功链 / DB 失败→删孤儿防月费泄漏 CRITICAL 路径)
 * 4. checkAndRefill      — 分布式锁 skip / refill / double_and_refill / stale creating 清理
 * 5. getPoolStatus       — 池状态统计
 *
 * Mock 面: @/lib/supabase-admin (池表 CRUD) / @/lib/letta-mcp-manager (getLettaClient+lettaAPI)
 *        / @/lib/letta-agent-tools (syncAgentSymyTools) / @/lib/letta-blocks (listAgentBlocks+
 *        upsertAgentBlock) / @/lib/distributed-lock / @/lib/letta-agent-manager (parseBooleanEnv)
 *        / @/lib/logger
 */
/* eslint-disable require-await -- test mocks use async for API consistency */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYMY_PERSONA_BLOCK } from '@/lib/symy-persona';

// ============================================================
// Hoisted 状态与 mock 实例 — vi.mock 工厂在 import 前运行, 须经 vi.hoisted 持有
// ============================================================
const h = vi.hoisted(() => {
  // letta-agent-pool 在 module-load 时读取 LETTA_API_KEY (空则 createPooledAgent 快速失败),
  // 必须在模块首次 import 之前设置
  process.env.LETTA_API_KEY = 'test-letta-key';
  return {
    adminSupabase: null as unknown,
    adminError: null as string | null,
  };
});

const mocks = vi.hoisted(() => ({
  getLettaClient: vi.fn(),
  lettaAPI: vi.fn(),
  listAgentBlocks: vi.fn(),
  upsertAgentBlock: vi.fn(),
  syncAgentSymyTools: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  // 忠实还原 letta-agent-manager 的 TRUTHY_STRINGS 白名单
  parseBooleanEnv: vi.fn((value: string | undefined | null): boolean =>
    ['true', '1', 'yes', 'on', 'y', 't'].includes((value || '').toLowerCase().trim()),
  ),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: h.adminSupabase, error: h.adminError })),
}));
vi.mock('@/lib/letta-mcp-manager', () => ({
  getLettaClient: mocks.getLettaClient,
  lettaAPI: mocks.lettaAPI,
}));
vi.mock('@/lib/letta-blocks', () => ({
  listAgentBlocks: mocks.listAgentBlocks,
  upsertAgentBlock: mocks.upsertAgentBlock,
}));
vi.mock('@/lib/letta-agent-tools', () => ({
  syncAgentSymyTools: mocks.syncAgentSymyTools,
}));
vi.mock('@/lib/letta-agent-manager', () => ({
  parseBooleanEnv: mocks.parseBooleanEnv,
}));
vi.mock('@/lib/distributed-lock', () => ({
  acquireLock: mocks.acquireLock,
  releaseLock: mocks.releaseLock,
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
  },
}));

import {
  assignAgentFromPool,
  checkAndRefill,
  createPooledAgent,
  getPoolStatus,
  refillPool,
} from '../letta-agent-pool';

// ============================================================
// Supabase 查询链 mock — 可控的池表 CRUD + 调用序列记录
// ============================================================
type Payload = Record<string, unknown>;

interface CallRecord {
  seq: number;
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  payload?: Payload;
  filters: Array<[string, unknown]>;
  selectArgs: unknown[];
}

interface DbState {
  configRow: Payload | null; // letta_agent_pool_config 行 (select)
  availableCount: number | null; // count('exact') 查询结果
  statusRows: Array<{ status: string }>; // getPoolStatus 的 select('status') 行
  staleRows: Payload[] | null; // stale 'creating' 清理 delete 的返回行
  staleError: { message: string } | null;
  rpcData: string | null;
  rpcError: { message: string } | null;
  insertResults: Array<{ data?: Payload | null; error?: { message: string } | null }>;
  failUpdateWhen: ((table: string, payload: Payload) => boolean) | null;
  failUpdateError: { message: string } | null;
  insertCounter: number;
  calls: CallRecord[];
}

function freshDb(): DbState {
  return {
    configRow: { pool_size: 1, initial_pool_size: 1 },
    availableCount: 0,
    statusRows: [],
    staleRows: null,
    staleError: null,
    rpcData: null,
    rpcError: null,
    insertResults: [],
    failUpdateWhen: null,
    failUpdateError: null,
    insertCounter: 1,
    calls: [],
  };
}

function makeSupabase(db: DbState) {
  const updateError = (table: string, payload: Payload): { message: string } | null =>
    db.failUpdateWhen?.(table, payload)
      ? db.failUpdateError ?? { message: 'update failed' }
      : null;

  const terminal = (
    rec: Omit<CallRecord, 'seq'>,
  ): { data: unknown; error: { message: string } | null; count: number | null } => {
    db.calls.push({ ...rec, seq: db.calls.length });
    if (rec.table === 'letta_agent_pool_config') {
      if (rec.op === 'select') return { data: db.configRow, error: null, count: null };
      // update 落状态: 真实 DB 中 checkAndRefill 翻倍后 refillPool 会重读 config 拿新值
      if (db.configRow && rec.payload) Object.assign(db.configRow, rec.payload);
      return { data: null, error: updateError(rec.table, rec.payload ?? {}), count: null };
    }
    if (rec.table === 'letta_agent_pool') {
      if (rec.op === 'select') {
        const opts = rec.selectArgs[1] as { count?: string } | undefined;
        if (opts?.count) return { data: null, error: null, count: db.availableCount };
        return { data: db.statusRows, error: null, count: null };
      }
      if (rec.op === 'delete') return { data: db.staleRows ?? [], error: db.staleError, count: null };
      if (rec.op === 'insert') {
        const next =
          db.insertResults.shift() ??
          { data: { id: `pool-row-${db.insertCounter++}` } as Payload, error: null };
        return { data: next.data ?? null, error: next.error ?? null, count: null };
      }
      return { data: null, error: updateError(rec.table, rec.payload ?? {}), count: null };
    }
    return { data: null, error: null, count: null };
  };

  // 链式 builder: from(t).select/insert/update/delete(...).eq/lt/order/limit(...)
  // 终端: maybeSingle()/single() 或直接 await (thenable)
  const makeChain = (table: string, op: CallRecord['op'] | null, payload?: Payload) => {
    const rec: Omit<CallRecord, 'seq'> = {
      table,
      op: op ?? 'select',
      payload,
      filters: [],
      selectArgs: [],
    };
    const chain: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        rec.selectArgs = args;
        return chain;
      },
      insert: (p: Payload) => {
        rec.op = 'insert';
        rec.payload = p;
        return chain;
      },
      update: (p: Payload) => {
        rec.op = 'update';
        rec.payload = p;
        return chain;
      },
      delete: () => {
        rec.op = 'delete';
        return chain;
      },
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val]);
        return chain;
      },
      lt: (col: string, val: unknown) => {
        rec.filters.push([col, val]);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(terminal(rec)),
      single: () => Promise.resolve(terminal(rec)),
      then: (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(terminal(rec)).then(onFulfilled, onRejected),
    };
    return chain;
  };

  return {
    rpc: vi.fn(async (fn: string, args?: Payload) => {
      db.calls.push({
        seq: db.calls.length,
        table: `rpc:${fn}`,
        op: 'rpc',
        payload: args,
        filters: [],
        selectArgs: [],
      });
      return { data: db.rpcData, error: db.rpcError };
    }),
    from: vi.fn((table: string) => makeChain(table, null)),
  };
}

// 断言辅助
const poolInserts = () => db.calls.filter((c) => c.table === 'letta_agent_pool' && c.op === 'insert');
const poolUpdates = () => db.calls.filter((c) => c.table === 'letta_agent_pool' && c.op === 'update');
const configUpdates = () =>
  db.calls.filter((c) => c.table === 'letta_agent_pool_config' && c.op === 'update');
const callTrail = () => db.calls.map((c) => `${c.op}:${c.table}`);

// ============================================================
// 每测重置
// ============================================================
let db: DbState;
let agentsCreate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  db = freshDb();
  h.adminSupabase = makeSupabase(db);
  h.adminError = null;
  agentsCreate = vi.fn(async () => ({ id: 'agent-created-1' }));
  mocks.getLettaClient.mockReturnValue({ agents: { create: agentsCreate } } as never);
  mocks.lettaAPI.mockResolvedValue({ ok: true });
  mocks.listAgentBlocks.mockResolvedValue([
    { id: 'blk-human', label: 'human', value: '', limit: 2000 },
  ]);
  mocks.upsertAgentBlock.mockResolvedValue({ created: true });
  mocks.syncAgentSymyTools.mockResolvedValue(undefined);
  mocks.acquireLock.mockResolvedValue(true);
  mocks.releaseLock.mockResolvedValue(undefined);
});

// ============================================================
// 1. createPooledAgent
// ============================================================
describe('createPooledAgent', () => {
  it('创建成功: Letta create (小象 persona SSOT) + 工具同步, 返回 agentId', async () => {
    const res = await createPooledAgent('pool-1');

    expect(res).toEqual({ agentId: 'agent-created-1' });
    expect(agentsCreate).toHaveBeenCalledTimes(1);

    const payload = agentsCreate.mock.calls[0][0] as Payload;
    expect(String(payload.name)).toMatch(/^symy-pool-/); // 随机名, 不绑定用户
    expect(payload.system).toBeTruthy(); // doc/AI_Prompt.md 真实读取
    expect(payload.tags).toEqual(['symy', 'pooled', 'unassigned']);
    expect(payload.metadata).toMatchObject({ created_by: 'symy-agent-pool', pool_id: 'pool-1' });

    const blocks = payload.memory_blocks as Array<{ label: string; value: string; limit: number }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ label: 'persona', limit: 5000 });
    expect(blocks[0].value).toBe(SYMY_PERSONA_BLOCK); // SSOT: 与主创建流程共用小象模板
    expect(blocks[1]).toMatchObject({ label: 'human', limit: 5000 });

    expect(mocks.syncAgentSymyTools).toHaveBeenCalledWith('agent-created-1');
    expect(mocks.lettaAPI).not.toHaveBeenCalled(); // 创建路径不直接走 lettaAPI
  });

  it('LETTA_API_KEY 缺失 → 快速失败, 不触碰 Letta', async () => {
    const saved = process.env.LETTA_API_KEY;
    delete process.env.LETTA_API_KEY;
    vi.resetModules();
    const mod = await import('../letta-agent-pool'); // 重新求值: 模块级 const 捕获空 key

    const res = await mod.createPooledAgent('pool-1');

    expect(res.agentId).toBeNull();
    expect(res.error).toContain('LETTA_API_KEY');
    expect(mocks.getLettaClient).not.toHaveBeenCalled();
    process.env.LETTA_API_KEY = saved;
  });

  it('getLettaClient 抛错 → 返回错误信息, 不发起创建', async () => {
    mocks.getLettaClient.mockImplementation(() => {
      throw new Error('no base url');
    });

    const res = await createPooledAgent('pool-1');

    expect(res.agentId).toBeNull();
    expect(res.error).toContain('getLettaClient failed');
    expect(agentsCreate).not.toHaveBeenCalled();
  });

  it('Letta create 返回无 id → 失败, 不附加工具', async () => {
    agentsCreate.mockResolvedValueOnce({});

    const res = await createPooledAgent('pool-1');

    expect(res.agentId).toBeNull();
    expect(res.error).toContain('no ID');
    expect(mocks.syncAgentSymyTools).not.toHaveBeenCalled();
  });

  it('syncAgentSymyTools 抛错 → 整体失败 (源码现状: agent 已创建但不删除 → 孤儿风险, 见 Lane 报告)', async () => {
    mocks.syncAgentSymyTools.mockRejectedValueOnce(new Error('tools down'));

    const res = await createPooledAgent('pool-1');

    expect(res.agentId).toBeNull();
    expect(res.error).toBe('tools down');
    expect(agentsCreate).toHaveBeenCalledTimes(1); // Letta 侧 agent 已存在…
    expect(mocks.lettaAPI).not.toHaveBeenCalled(); // …但无 DELETE 调用 (锁现状)
  });
});

// ============================================================
// 2. assignAgentFromPool
// ============================================================
describe('assignAgentFromPool', () => {
  it('池有 agent: RPC 原子分配 + blocks 更新 + 工具附加, 零 Letta 创建', async () => {
    db.rpcData = 'agent-77';

    const res = await assignAgentFromPool('user-42');

    expect(res).toBe('agent-77');
    // 唯一的 DB 调用是 RPC (FOR UPDATE SKIP LOCKED 在 SQL 侧, 池满直接复用)
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({
      table: 'rpc:assign_pool_agent',
      op: 'rpc',
      payload: { p_user_id: 'user-42' },
    });
    // 零 Letta agent 创建
    expect(agentsCreate).not.toHaveBeenCalled();
    expect(mocks.lettaAPI).not.toHaveBeenCalled();
    // memory blocks 走 letta-blocks 共享层
    expect(mocks.listAgentBlocks).toHaveBeenCalledWith('agent-77');
    expect(mocks.upsertAgentBlock).toHaveBeenCalledTimes(2);
    expect(mocks.upsertAgentBlock).toHaveBeenNthCalledWith(
      1,
      'agent-77',
      'human',
      expect.stringContaining('User ID: user-42'),
      2000, // 沿用 human block 既有 limit
    );
    expect(mocks.upsertAgentBlock).toHaveBeenNthCalledWith(2, 'agent-77', 'user_id', 'user-42', 100);
    // 顺序: human 先于 user_id
    const [humanOrder, userIdOrder] = mocks.upsertAgentBlock.mock.invocationCallOrder;
    expect(humanOrder).toBeLessThan(userIdOrder);
    // 工具附加
    expect(mocks.syncAgentSymyTools).toHaveBeenCalledWith('agent-77');
  });

  it('池空: RPC 返回 null → 返回 null, 不触碰 Letta/blocks/工具', async () => {
    db.rpcData = null;

    await expect(assignAgentFromPool('user-42')).resolves.toBeNull();

    expect(mocks.getLettaClient).not.toHaveBeenCalled();
    expect(mocks.listAgentBlocks).not.toHaveBeenCalled();
    expect(mocks.upsertAgentBlock).not.toHaveBeenCalled();
    expect(mocks.syncAgentSymyTools).not.toHaveBeenCalled();
  });

  it('RPC 出错 → 返回 null', async () => {
    db.rpcError = { message: 'function assign_pool_agent does not exist' };

    await expect(assignAgentFromPool('user-42')).resolves.toBeNull();

    expect(mocks.listAgentBlocks).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it('admin client 不可用 → 返回 null, RPC 未发起', async () => {
    h.adminSupabase = null;
    h.adminError = 'service role key missing';

    await expect(assignAgentFromPool('user-42')).resolves.toBeNull();

    expect(db.calls).toHaveLength(0);
  });

  it('human block 缺失 → 跳过 human, 仍写 user_id block', async () => {
    db.rpcData = 'agent-77';
    mocks.listAgentBlocks.mockResolvedValueOnce([
      { id: 'blk-persona', label: 'persona', value: 'x', limit: 5000 },
    ]);

    await expect(assignAgentFromPool('user-42')).resolves.toBe('agent-77');

    expect(mocks.upsertAgentBlock).toHaveBeenCalledTimes(1);
    expect(mocks.upsertAgentBlock).toHaveBeenCalledWith('agent-77', 'user_id', 'user-42', 100);
  });

  it('blocks 更新抛错 → 降级不阻断分配, 工具附加仍执行, 返回 agentId', async () => {
    db.rpcData = 'agent-77';
    mocks.listAgentBlocks.mockRejectedValueOnce(new Error('letta 503'));

    await expect(assignAgentFromPool('user-42')).resolves.toBe('agent-77');

    expect(mocks.upsertAgentBlock).not.toHaveBeenCalled();
    // 独立 try 块: blocks 失败不阻断 MCP 工具附加
    expect(mocks.syncAgentSymyTools).toHaveBeenCalledWith('agent-77');
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it('syncAgentSymyTools 抛错 → 降级不阻断, blocks 已完成, 返回 agentId', async () => {
    db.rpcData = 'agent-77';
    mocks.syncAgentSymyTools.mockRejectedValueOnce(new Error('mcp down'));

    await expect(assignAgentFromPool('user-42')).resolves.toBe('agent-77');

    expect(mocks.upsertAgentBlock).toHaveBeenCalledTimes(2);
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });
});

// ============================================================
// 3. refillPool
// ============================================================
describe('refillPool', () => {
  it('池满 (available >= pool_size) → 零创建零写入, 直接返回', async () => {
    db.configRow = { pool_size: 2 };
    db.availableCount = 2;

    const res = await refillPool();

    expect(res).toEqual({ created: 0, failed: 0, targetSize: 2 });
    expect(poolInserts()).toHaveLength(0);
    expect(agentsCreate).not.toHaveBeenCalled();
    expect(configUpdates()).toHaveLength(0); // 早退: 连 last_refill_at 都不写
  });

  it('池空 → creating 行 → Letta 创建 → available 更新 → last_refill_at (完整链与序列)', async () => {
    // 默认: pool_size=1, available=0 → need=1
    const res = await refillPool();

    expect(res).toEqual({ created: 1, failed: 0, targetSize: 1 });
    expect(callTrail()).toEqual([
      'select:letta_agent_pool_config', // 读 pool_size
      'select:letta_agent_pool', // count available
      'insert:letta_agent_pool', // creating 占位行
      'update:letta_agent_pool', // → available
      'update:letta_agent_pool_config', // last_refill_at
    ]);

    // creating 行: pending- 前缀占位 id
    const insertPayload = poolInserts()[0].payload as Payload;
    expect(insertPayload.status).toBe('creating');
    expect(String(insertPayload.letta_agent_id)).toMatch(/^pending-/);

    // Letta 创建, metadata 绑定池行 id
    expect(agentsCreate).toHaveBeenCalledTimes(1);
    expect((agentsCreate.mock.calls[0][0] as Payload).metadata).toMatchObject({
      pool_id: 'pool-row-1',
    });
    expect(mocks.syncAgentSymyTools).toHaveBeenCalledWith('agent-created-1');

    // 更新为 available + 绑定真实 letta_agent_id
    const upd = poolUpdates()[0];
    expect(upd.payload).toEqual({ letta_agent_id: 'agent-created-1', status: 'available' });
    expect(upd.filters).toEqual([['id', 'pool-row-1']]);

    // last_refill_at 落库
    expect((configUpdates()[0].payload as Payload).last_refill_at).toEqual(expect.any(String));
  });

  it('部分缺口 → 只补缺的数量 (target=2, available=1 → 创建 1)', async () => {
    db.configRow = { pool_size: 2 };
    db.availableCount = 1;

    const res = await refillPool();

    expect(res).toEqual({ created: 1, failed: 0, targetSize: 2 });
    expect(agentsCreate).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL: DB 更新失败 → DELETE 孤儿 Letta agent 防月费泄漏 + 行标 failed', async () => {
    // 模拟 pool 行 update (带 letta_agent_id 的那次) 失败
    db.failUpdateWhen = (table, payload) =>
      table === 'letta_agent_pool' && 'letta_agent_id' in payload;
    db.failUpdateError = { message: 'simulated DB failure' };

    const res = await refillPool();

    expect(res).toEqual({ created: 0, failed: 1, targetSize: 1 });
    // Letta agent 已创建 (月费风险源头)…
    expect(agentsCreate).toHaveBeenCalledTimes(1);
    // …因此必须 DELETE /agents/{id} 防泄漏
    expect(mocks.lettaAPI).toHaveBeenCalledTimes(1);
    expect(mocks.lettaAPI).toHaveBeenCalledWith('/agents/agent-created-1', { method: 'DELETE' });
    // 顺序保证: 先创建后删除
    expect(mocks.lettaAPI.mock.invocationCallOrder[0]).toBeGreaterThan(
      agentsCreate.mock.invocationCallOrder[0],
    );
    // 池行标记 failed + 原因
    const failedUpd = poolUpdates().find((c) => (c.payload as Payload).status === 'failed');
    expect(failedUpd?.payload).toMatchObject({
      status: 'failed',
      failure_reason: 'DB update failed: simulated DB failure',
    });
  });

  it('CRITICAL 叠加: DELETE 也失败 → 仍标 failed + CRITICAL 日志, 不向外抛', async () => {
    db.failUpdateWhen = (table, payload) =>
      table === 'letta_agent_pool' && 'letta_agent_id' in payload;
    mocks.lettaAPI.mockRejectedValueOnce(new Error('letta down too'));

    const res = await refillPool();

    expect(res).toEqual({ created: 0, failed: 1, targetSize: 1 });
    expect(mocks.lettaAPI).toHaveBeenCalledTimes(1);
    expect(
      poolUpdates().some((c) => (c.payload as Payload).status === 'failed'),
    ).toBe(true);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL: Failed to delete orphan agent'),
      expect.anything(),
    );
  });

  it('Letta 创建失败 → 行标 failed + 原因, 不调用 DELETE (无 agent 可删)', async () => {
    agentsCreate.mockRejectedValueOnce(new Error('letta 503'));

    const res = await refillPool();

    expect(res).toEqual({ created: 0, failed: 1, targetSize: 1 });
    expect(poolUpdates()[0].payload).toMatchObject({
      status: 'failed',
      failure_reason: 'letta 503',
    });
    expect(mocks.lettaAPI).not.toHaveBeenCalled();
    // last_refill_at 仍会落库 (循环后无条件执行)
    expect(
      configUpdates().some((c) => 'last_refill_at' in (c.payload as Payload)),
    ).toBe(true);
  });

  it('creating 行插入失败 → failed++ 且不触发 Letta 创建', async () => {
    db.insertResults = [{ data: null, error: { message: 'insert rejected' } }];

    const res = await refillPool();

    expect(res).toEqual({ created: 0, failed: 1, targetSize: 1 });
    expect(agentsCreate).not.toHaveBeenCalled();
  });

  it('admin client 不可用 → 零操作返回', async () => {
    h.adminSupabase = null;
    h.adminError = 'no key';

    await expect(refillPool()).resolves.toEqual({ created: 0, failed: 0, targetSize: 0 });
  });
});

// ============================================================
// 4. checkAndRefill (cron: 分布式锁 + 翻倍判定 + stale 清理)
// ============================================================
describe('checkAndRefill', () => {
  it('分布式锁被占用 → skip, 不释放他人锁, 不触碰 DB (failClosed 竞态防御)', async () => {
    mocks.acquireLock.mockResolvedValueOnce(false);

    const res = await checkAndRefill();

    expect(res).toEqual({ action: 'skip', poolSize: 0, available: 0, created: 0, failed: 0 });
    // 锁参数: 固定 key + TTL 90s (覆盖 Vercel maxDuration 60s) + failClosed
    expect(mocks.acquireLock).toHaveBeenCalledWith('cron-agent-pool-checkAndRefill', 90_000, true);
    // 未持锁不释放 (等 TTL 自然过期, 防止误删他人锁)
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    expect(db.calls).toHaveLength(0);
  });

  it('available >= 1/4 池 → 只 refill 不翻倍', async () => {
    db.configRow = { pool_size: 4, initial_pool_size: 4 };
    db.availableCount = 2; // quarter = max(1, floor(4/4)) = 1, 2 >= 1

    const res = await checkAndRefill();

    expect(res.action).toBe('refill');
    expect(res.available).toBe(2);
    expect(res.created).toBe(2); // 补到 4: need = 4-2
    // 无翻倍写 (config update 不含 pool_size)
    const doubling = configUpdates().find((c) => 'pool_size' in (c.payload as Payload));
    expect(doubling).toBeUndefined();
    expect(agentsCreate).toHaveBeenCalledTimes(2);
  });

  it('available < 1/4 池 → 翻倍 + 补满 (double_and_refill)', async () => {
    // 默认: pool_size=1, available=0 → quarter=1, 0 < 1 → 翻倍到 2 再补满
    const res = await checkAndRefill();

    expect(res.action).toBe('double_and_refill');
    expect(res.poolSize).toBe(2);
    expect(res.created).toBe(2);
    const doubling = configUpdates().find((c) => 'pool_size' in (c.payload as Payload));
    expect(doubling?.payload).toMatchObject({
      pool_size: 2,
      last_doubled_at: expect.any(String),
    });
    expect(agentsCreate).toHaveBeenCalledTimes(2);
    // finally 释放锁 (下一次 cron 立即可跑, 不等 TTL)
    expect(mocks.releaseLock).toHaveBeenCalledWith('cron-agent-pool-checkAndRefill');
  });

  it('清理 stale creating 行: delete 带 status/created_at(>5min) 过滤', async () => {
    db.configRow = { pool_size: 4, initial_pool_size: 4 };
    db.availableCount = 4; // 池满: need=0, 不创建
    db.staleRows = [{ id: 'stale-1', letta_agent_id: 'pending-dead' }];

    const res = await checkAndRefill();

    expect(res.action).toBe('refill');
    expect(res.created).toBe(0);
    const staleDelete = db.calls.find((c) => c.op === 'delete');
    expect(staleDelete?.table).toBe('letta_agent_pool');
    expect(staleDelete?.filters[0]).toEqual(['status', 'creating']);
    expect(staleDelete?.filters[1]?.[0]).toBe('created_at');
    // 5 分钟窗口: cutoff ≈ now - 5min
    const cutoff = new Date(staleDelete!.filters[1][1] as string).getTime();
    expect(cutoff).toBeGreaterThan(Date.now() - 5 * 60 * 1000 - 1000);
    expect(cutoff).toBeLessThan(Date.now() - 5 * 60 * 1000 + 1000);
  });

  it('stale 清理 delete 出错 → 降级继续 (warn 不抛)', async () => {
    db.configRow = { pool_size: 4, initial_pool_size: 4 };
    db.availableCount = 4;
    db.staleError = { message: 'rls blocked' };

    const res = await checkAndRefill();

    expect(res.action).toBe('refill');
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it('锁释放失败 → 结果不受影响 (catch 降级)', async () => {
    db.configRow = { pool_size: 1, initial_pool_size: 1 };
    db.availableCount = 0;
    mocks.releaseLock.mockRejectedValueOnce(new Error('lock owner mismatch'));

    const res = await checkAndRefill();

    expect(res.action).toBe('double_and_refill');
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it('admin client 不可用 → skip, 但锁正常获取与释放', async () => {
    h.adminSupabase = null;
    h.adminError = 'no key';

    const res = await checkAndRefill();

    expect(res).toEqual({ action: 'skip', poolSize: 0, available: 0, created: 0, failed: 0 });
    expect(mocks.acquireLock).toHaveBeenCalledTimes(1);
    expect(mocks.releaseLock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 5. getPoolStatus
// ============================================================
describe('getPoolStatus', () => {
  it('按 status 聚合池行 + 映射 config 字段', async () => {
    db.configRow = {
      pool_size: 3,
      initial_pool_size: 2,
      last_cron_check: '2026-09-30T00:00:00Z',
      last_refill_at: '2026-09-30T00:01:00Z',
      last_doubled_at: '2026-09-30T00:02:00Z',
    };
    db.statusRows = [
      { status: 'available' },
      { status: 'available' },
      { status: 'assigned' },
      { status: 'creating' },
      { status: 'failed' },
    ];

    await expect(getPoolStatus()).resolves.toEqual({
      poolSize: 3,
      initialPoolSize: 2,
      available: 2,
      assigned: 1,
      creating: 1,
      failed: 1,
      lastCronCheck: '2026-09-30T00:00:00Z',
      lastRefillAt: '2026-09-30T00:01:00Z',
      lastDoubledAt: '2026-09-30T00:02:00Z',
    });
  });

  it('空池 + 无 config → 默认尺寸 1 + 零计数 + null 时间戳', async () => {
    db.configRow = null;
    db.statusRows = [];

    await expect(getPoolStatus()).resolves.toEqual({
      poolSize: 1,
      initialPoolSize: 1,
      available: 0,
      assigned: 0,
      creating: 0,
      failed: 0,
      lastCronCheck: null,
      lastRefillAt: null,
      lastDoubledAt: null,
    });
  });

  it('admin client 不可用 → null', async () => {
    h.adminSupabase = null;

    await expect(getPoolStatus()).resolves.toBeNull();
  });
});
