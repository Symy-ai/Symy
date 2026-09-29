/**
 * embed-backfill 单测 (Lane R — F6 盲区收尾, 529 行零专测)
 *
 * 覆盖源码主干:
 * 1. backfillImpulseEvents   — 查询→批量嵌入→批量写回; 查询失败/embedding 失败/23505 降级逐条/批量硬失败/admin 缺失/空集
 * 2. backfillEmailReceipts   — 同上路径 (逐条插入版) + 23505 幂等跳过 + tokensUsed 只计 inserted
 * 3. backfillChatMessages    — 主干 + content 截断 1000 字符
 * 4. embedSingleRecord       — 永不抛错; 空内容短路; insert 形状 (content 截断+metadata toJson)
 * 5. triggerLazyBackfillIfNeeded — 分布式锁 skip / count 阈值 / 触发回填 / count 失败释放锁 / backfill 短路
 *
 * Mock 面: @/lib/supabase-admin (三源表查询+user_embeddings CRUD) / @/lib/embeddings
 *        (generateEmbedding+generateEmbeddingsBatch, 间接挡掉智谱 API; build*Text 用真实实现
 *        验证文本构造) / @/lib/admin-audit (fireAndForgetSafely) / @/lib/distributed-lock
 *        / @/lib/logger
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// Hoisted 状态 — vi.mock 工厂在 import 前运行, 须经 vi.hoisted 持有
// ============================================================
const h = vi.hoisted(() => ({
  adminSupabase: null as unknown,
  adminError: null as string | null,
}));

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  generateEmbeddingsBatch: vi.fn(),
  fireAndForgetSafely: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: h.adminSupabase, error: h.adminError })),
}));
// build*Text 不 mock — 用真实实现, 断言回填文本构造正确
vi.mock('@/lib/embeddings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/embeddings')>('@/lib/embeddings');
  return {
    ...actual,
    generateEmbedding: mocks.generateEmbedding,
    generateEmbeddingsBatch: mocks.generateEmbeddingsBatch,
  };
});
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: mocks.fireAndForgetSafely,
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
  backfillChatMessages,
  backfillEmailReceipts,
  backfillImpulseEvents,
  embedSingleRecord,
  triggerLazyBackfillIfNeeded,
} from '../embed-backfill';

// ============================================================
// Supabase 查询链 mock — 可控的表 CRUD + 调用序列记录
// ============================================================
type Payload = Record<string, unknown>;

interface CallRecord {
  seq: number;
  table: string;
  op: 'select' | 'insert';
  payload?: Payload;
  filters: Array<[string, unknown]>;
  selectArgs: unknown[];
  orderCalls: Array<[string, Record<string, unknown>]>;
  limitVal: number | null;
}

interface DbState {
  // 表 → select 返回行 (三源表); user_embeddings 查询走 countOnly
  tableRows: Record<string, Payload[] | null>;
  selectError: Record<string, { message: string; code?: string } | null>;
  // user_embeddings count 查询 (head:true) 返回值
  embeddingsCount: number | null;
  countError: { message: string } | null;
  // user_embeddings insert 逐次结果 (shift 消费; 不足时用 defaultInsertResult)
  insertResults: Array<{ data?: Payload | null; error?: { message: string; code?: string } | null }>;
  defaultInsertResult: { data: Payload | null; error: { message: string; code?: string } | null };
  calls: CallRecord[];
}

function freshDb(): DbState {
  return {
    tableRows: {},
    selectError: {},
    embeddingsCount: 0,
    countError: null,
    insertResults: [],
    defaultInsertResult: { data: null, error: null },
    calls: [],
  };
}

function makeSupabase(db: DbState) {
  const terminal = (
    rec: Omit<CallRecord, 'seq'>,
  ): { data: unknown; error: { message: string; code?: string } | null; count: number | null } => {
    db.calls.push({ ...rec, seq: db.calls.length });
    if (rec.op === 'select') {
      if (rec.table === 'user_embeddings') {
        const opts = rec.selectArgs[1] as { count?: string; head?: boolean } | undefined;
        if (opts?.count) {
          // count 查询 (head:true) — triggerLazyBackfillIfNeeded 的阈值检查
          return { data: null, error: db.countError, count: db.embeddingsCount };
        }
      }
      const err = db.selectError[rec.table] ?? null;
      if (err) return { data: null, error: err, count: null };
      const rows = db.tableRows[rec.table];
      return { data: rows === undefined ? [] : rows, error: null, count: null };
    }
    // insert
    const next = db.insertResults.shift() ?? db.defaultInsertResult;
    return { data: next.data ?? null, error: next.error ?? null, count: null };
  };

  // 链式 builder: from(t).select(...).eq/order/limit(...) → await (thenable)
  const makeChain = (table: string, op: CallRecord['op'] | null, payload?: Payload) => {
    const rec: Omit<CallRecord, 'seq'> = {
      table,
      op: op ?? 'select',
      payload,
      filters: [],
      selectArgs: [],
      orderCalls: [],
      limitVal: null,
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
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val]);
        return chain;
      },
      order: (col: string, opts: Record<string, unknown>) => {
        rec.orderCalls.push([col, opts]);
        return chain;
      },
      limit: (n: number) => {
        rec.limitVal = n;
        return chain;
      },
      then: (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(insertFakeTerminal(rec)).then(onFulfilled, onRejected),
    };
    // insert 后链式调用被 await 直接结算 — insert 已记录 op, 复用 terminal
    const insertFakeTerminal = (r: Omit<CallRecord, 'seq'>) => terminal(r);
    return chain;
  };

  return {
    from: vi.fn((table: string) => makeChain(table, null)),
  };
}

// ============================================================
// 断言辅助
// ============================================================
const userEmbeddingInserts = () =>
  db.calls.filter((c) => c.table === 'user_embeddings' && c.op === 'insert');
const sourceSelect = (table: string) =>
  db.calls.find((c) => c.table === table && c.op === 'select');

// 固定向量 (mock embedding 返回)
const VEC = (n: number) => Array.from({ length: 8 }, (_, i) => n * 100 + i);

function mockBatchOk(n: number, tokens = 10) {
  mocks.generateEmbeddingsBatch.mockImplementation((texts: string[]) =>
    Promise.resolve(texts.map((_, i) => ({ embedding: VEC(i + n), tokens }))),
  );
}

// 三源表典型行
const EVENT_ROW = (id: string, over: Partial<Payload> = {}): Payload => ({
  id,
  platform: 'taobao',
  title: '无线耳机',
  amount: 199,
  category: '数码',
  raw_text: '深夜直播间的冲动',
  reasons: ['深夜', '折扣'],
  created_at: '2026-09-01T00:00:00Z',
  ...over,
});
const RECEIPT_ROW = (id: string, over: Partial<Payload> = {}): Payload => ({
  id,
  platform: 'jd',
  item_name: '机械键盘',
  amount: 399,
  subject: '订单通知',
  snippet: '您购买的机械键盘已发货',
  from_address: 'no-reply@jd.com',
  received_at: '2026-09-02T00:00:00Z',
  ...over,
});
const MESSAGE_ROW = (id: string, over: Partial<Payload> = {}): Payload => ({
  id,
  role: 'user',
  content: '帮我看看这笔消费',
  created_at: '2026-09-03T00:00:00Z',
  ...over,
});

// ============================================================
// 每测重置
// ============================================================
let db: DbState;

beforeEach(() => {
  vi.clearAllMocks();
  db = freshDb();
  h.adminSupabase = makeSupabase(db);
  h.adminError = null;
  mockBatchOk(0);
  mocks.generateEmbedding.mockResolvedValue({ embedding: VEC(9), tokens: 7 });
  mocks.acquireLock.mockResolvedValue(true);
  mocks.releaseLock.mockResolvedValue(undefined);
  mocks.fireAndForgetSafely.mockImplementation((p: Promise<unknown>) => {
    void p; // 测试环境直接 fire-and-forget
  });
});

// ============================================================
// 1. backfillImpulseEvents
// ============================================================
describe('backfillImpulseEvents', () => {
  it('正常回填: 查询→批量嵌入→单次批量 INSERT, 形状与统计正确', async () => {
    db.tableRows.impulse_events = [EVENT_ROW('e1'), EVENT_ROW('e2')];
    mockBatchOk(1, 12);

    const res = await backfillImpulseEvents('user-1');

    // 查询形状
    const sel = sourceSelect('impulse_events');
    expect(sel).toBeTruthy();
    expect(sel!.filters).toContainEqual(['user_id', 'user-1']);
    expect(sel!.orderCalls).toEqual([['created_at', { ascending: false }]]);
    expect(sel!.limitVal).toBe(500); // 默认 limit

    // embedding 批量调用 + 真实 buildImpulseEventText 构造的文本
    expect(mocks.generateEmbeddingsBatch).toHaveBeenCalledTimes(1);
    const texts = mocks.generateEmbeddingsBatch.mock.calls[0][0] as string[];
    expect(texts[0]).toBe(
      'Platform: taobao | Title: 无线耳机 | Amount: $199 | Category: 数码 | Details: 深夜直播间的冲动 | Impulse signals: 深夜, 折扣',
    );

    // 批量写回: 单次 insert, rows 形状 (content/embedding 对位, metadata 含源字段)
    const inserts = userEmbeddingInserts();
    expect(inserts).toHaveLength(1);
    const rows = inserts[0].payload as unknown as Payload[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      source_type: 'impulse_event',
      source_id: 'e1',
      embedding: VEC(1),
    });
    expect(rows[0].content).toBe(texts[0]);
    expect(rows[0].metadata).toMatchObject({ platform: 'taobao', amount: 199, category: '数码' });
    expect(rows[1].source_id).toBe('e2');

    // 统计
    expect(res).toEqual({
      sourceType: 'impulse_event',
      total: 2,
      embedded: 2,
      skipped: 0,
      failed: 0,
      tokensUsed: 24, // 2 × 12
      firstError: undefined,
    });
  });

  it('空集: 零源表零写回, total=0 直接返回', async () => {
    db.tableRows.impulse_events = [];

    const res = await backfillImpulseEvents('user-1');

    expect(mocks.generateEmbeddingsBatch).not.toHaveBeenCalled();
    expect(userEmbeddingInserts()).toHaveLength(0);
    expect(res).toMatchObject({ total: 0, embedded: 0, skipped: 0, failed: 0 });
  });

  it('源表查询失败: 零写回, 不触 embedding API, 返回全零结果', async () => {
    db.selectError.impulse_events = { message: 'connection reset' };

    const res = await backfillImpulseEvents('user-1');

    expect(mocks.generateEmbeddingsBatch).not.toHaveBeenCalled();
    expect(userEmbeddingInserts()).toHaveLength(0);
    expect(res).toMatchObject({ total: 0, embedded: 0, failed: 0 });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Query impulse_events failed'),
    );
  });

  it('embedding API 失败: 全部计 failed, 零写回 (不写脏数据)', async () => {
    db.tableRows.impulse_events = [EVENT_ROW('e1'), EVENT_ROW('e2'), EVENT_ROW('e3')];
    mocks.generateEmbeddingsBatch.mockRejectedValue(new Error('zhipuai 429 rate limited'));

    const res = await backfillImpulseEvents('user-1');

    expect(userEmbeddingInserts()).toHaveLength(0); // 零副作用
    expect(res).toMatchObject({ total: 3, embedded: 0, skipped: 0, failed: 3 });
    expect(res.firstError).toContain('batch_embedding_failed');
    expect(res.firstError).toContain('429');
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('429'));
  });

  it('批量插入 23505 冲突 → 降级逐条插入, 已存在跳过计数', async () => {
    db.tableRows.impulse_events = [EVENT_ROW('e1'), EVENT_ROW('e2'), EVENT_ROW('e3')];
    // 第一次 insert (批量) 23505 → 后续 3 次逐条: e1 23505 已存在, e2 成功, e3 成功
    db.insertResults = [
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: null, error: null },
      { data: null, error: null },
    ];

    const res = await backfillImpulseEvents('user-1');

    // 1 次批量 + 3 次逐条
    const inserts = userEmbeddingInserts();
    expect(inserts).toHaveLength(4);
    expect((inserts[0].payload as unknown as Payload[]).length).toBe(3); // 批量 rows
    expect(inserts[1].payload).toMatchObject({ source_id: 'e1' }); // 逐条
    expect(inserts[2].payload).toMatchObject({ source_id: 'e2' });
    expect(inserts[3].payload).toMatchObject({ source_id: 'e3' });

    expect(res).toMatchObject({ total: 3, embedded: 2, skipped: 1, failed: 0 });
    expect(res.tokensUsed).toBe(30); // 3 × 10 (tokens 已花, 与插入结果无关)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('falling back to per-row insert'),
    );
  });

  it('批量插入硬失败 (非 23505) → 全部计 failed, 不降级不重试', async () => {
    db.tableRows.impulse_events = [EVENT_ROW('e1'), EVENT_ROW('e2')];
    db.defaultInsertResult = { data: null, error: { code: '42P01', message: 'relation not found' } };

    const res = await backfillImpulseEvents('user-2');

    expect(userEmbeddingInserts()).toHaveLength(1); // 只 1 次批量尝试, 无逐条降级
    expect(res).toMatchObject({ total: 2, embedded: 0, failed: 2 });
    expect(res.firstError).toContain('42P01');
  });

  it('admin client 缺失 → 全零结果, 不触任何表', async () => {
    h.adminSupabase = null;

    const res = await backfillImpulseEvents('user-1');

    expect(db.calls).toHaveLength(0);
    expect(res).toMatchObject({ total: 0, embedded: 0, skipped: 0, failed: 0 });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Admin client unavailable'),
    );
  });
});

// ============================================================
// 2. backfillEmailReceipts
// ============================================================
describe('backfillEmailReceipts', () => {
  it('正常回填: 逐条插入 (非批量), 形状与 tokensUsed 只计 inserted', async () => {
    db.tableRows.email_receipts = [RECEIPT_ROW('r1'), RECEIPT_ROW('r2'), RECEIPT_ROW('r3')];
    // r1 insert 成功, r2 已存在 (23505), r3 成功
    db.insertResults = [
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: null, error: null },
    ];

    const res = await backfillEmailReceipts('user-1');

    // 查询形状 (received_at 倒序 + nullsFirst:false)
    const sel = sourceSelect('email_receipts');
    expect(sel!.orderCalls).toEqual([['received_at', { ascending: false, nullsFirst: false }]]);
    expect(sel!.limitVal).toBe(500);

    // embedding 文本 (真实 buildReceiptText)
    const texts = mocks.generateEmbeddingsBatch.mock.calls[0][0] as string[];
    expect(texts[0]).toBe(
      'Platform: jd | Item: 机械键盘 | Amount: $399 | Subject: 订单通知 | Snippet: 您购买的机械键盘已发货 | From: no-reply@jd.com',
    );

    // 逐条插入形状
    const inserts = userEmbeddingInserts();
    expect(inserts).toHaveLength(3);
    expect(inserts[0].payload).toMatchObject({
      user_id: 'user-1',
      source_type: 'email_receipt',
      source_id: 'r1',
      embedding: VEC(0),
    });
    expect(inserts[0].payload!.content).toBe(texts[0]);
    expect(inserts[0].payload!.metadata).toMatchObject({
      platform: 'jd',
      item_name: '机械键盘',
      amount: 399,
      received_at: '2026-09-02T00:00:00Z',
    });

    // 统计: tokensUsed 只计 inserted (2 × 10), skipped 不计 tokens
    expect(res).toMatchObject({ total: 3, embedded: 2, skipped: 1, failed: 0 });
    expect(res.tokensUsed).toBe(20);
  });

  it('逐条插入非 23505 失败 → 计 failed + firstError, 不中断后续行', async () => {
    db.tableRows.email_receipts = [RECEIPT_ROW('r1'), RECEIPT_ROW('r2')];
    db.insertResults = [
      { data: null, error: { code: '57014', message: 'query canceled' } },
      { data: null, error: null },
    ];

    const res = await backfillEmailReceipts('user-1');

    expect(res).toMatchObject({ total: 2, embedded: 1, skipped: 0, failed: 1 });
    expect(res.firstError).toContain('57014');
    expect(userEmbeddingInserts()).toHaveLength(2); // r2 仍被插入
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('Insert failed'));
  });

  it('embedding API 失败: 全部计 failed, 零写回', async () => {
    db.tableRows.email_receipts = [RECEIPT_ROW('r1')];
    mocks.generateEmbeddingsBatch.mockRejectedValue(new Error('API timeout'));

    const res = await backfillEmailReceipts('user-1');

    expect(userEmbeddingInserts()).toHaveLength(0);
    expect(res).toMatchObject({ total: 1, embedded: 0, failed: 1, tokensUsed: 0 });
    expect(res.firstError).toContain('batch_embedding_failed');
  });

  it('admin client 缺失 → 全零结果', async () => {
    h.adminSupabase = null;
    const res = await backfillEmailReceipts('user-1');
    expect(res).toMatchObject({ sourceType: 'email_receipt', total: 0, failed: 0 });
    expect(db.calls).toHaveLength(0);
  });
});

// ============================================================
// 3. backfillChatMessages
// ============================================================
describe('backfillChatMessages', () => {
  it('正常回填: [role]: content 文本 + 逐条插入', async () => {
    db.tableRows.chat_messages = [MESSAGE_ROW('m1'), MESSAGE_ROW('m2', { role: 'assistant' })];
    mockBatchOk(1);

    const res = await backfillChatMessages('user-1');

    // 查询形状: 默认 limit 1000
    const sel = sourceSelect('chat_messages');
    expect(sel!.limitVal).toBe(1000);
    expect(sel!.orderCalls).toEqual([['created_at', { ascending: false }]]);

    // 文本构造 (真实 buildChatMessageText)
    const texts = mocks.generateEmbeddingsBatch.mock.calls[0][0] as string[];
    expect(texts).toEqual(['[user]: 帮我看看这笔消费', '[assistant]: 帮我看看这笔消费']);

    // 插入形状
    const inserts = userEmbeddingInserts();
    expect(inserts).toHaveLength(2);
    expect(inserts[0].payload).toMatchObject({
      source_type: 'chat_message',
      source_id: 'm1',
    });
    expect(inserts[0].payload!.metadata).toMatchObject({ role: 'user' });

    expect(res).toMatchObject({ total: 2, embedded: 2, skipped: 0, failed: 0, tokensUsed: 20 });
  });

  it('chat 文本超 1000 字符 → content 截断加省略号 (截断在完整文本上, 含 [role] 前缀)', async () => {
    db.tableRows.chat_messages = [MESSAGE_ROW('m1', { content: '长'.repeat(1500) })];

    const res = await backfillChatMessages('user-1');

    const inserts = userEmbeddingInserts();
    expect(inserts).toHaveLength(1);
    const content = inserts[0].payload!.content as string;
    expect(content.length).toBe(1003); // slice(0,1000) + '...'
    // slice 作用在 '[user]: 长长长...' 完整文本上: 前 8 字符是前缀, 其后 992 个长
    expect(content.startsWith('[user]: ')).toBe(true);
    expect(content.endsWith('长'.repeat(992) + '...')).toBe(true);
    expect(res).toMatchObject({ total: 1, embedded: 1 });
  });
});

// ============================================================
// 4. embedSingleRecord
// ============================================================
describe('embedSingleRecord', () => {
  it('正常: 单条 embedding + 插入, 返回 true', async () => {
    const ok = await embedSingleRecord(
      'user-1',
      'impulse_event',
      'evt-9',
      'Platform: douyin | Title: 露营椅',
      { platform: 'douyin' },
    );

    expect(ok).toBe(true);
    expect(mocks.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(mocks.generateEmbedding).toHaveBeenCalledWith('Platform: douyin | Title: 露营椅');
    const inserts = userEmbeddingInserts();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      user_id: 'user-1',
      source_type: 'impulse_event',
      source_id: 'evt-9',
      embedding: VEC(9),
    });
    expect(inserts[0].payload!.metadata).toEqual({ platform: 'douyin' });
  });

  it('空内容 → false, 不触 embedding API 不插表', async () => {
    expect(await embedSingleRecord('user-1', 'chat_message', 'm1', '', {})).toBe(false);
    expect(await embedSingleRecord('user-1', 'chat_message', 'm1', '   ', {})).toBe(false);
    expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    expect(userEmbeddingInserts()).toHaveLength(0);
  });

  it('插入 23505 已存在 → false (幂等跳过), 无 warn', async () => {
    db.defaultInsertResult = { data: null, error: { code: '23505', message: 'duplicate' } };

    const ok = await embedSingleRecord('user-1', 'chat_message', 'm1', '内容', {});

    expect(ok).toBe(false); // exists ≠ inserted
    expect(mocks.loggerWarn).not.toHaveBeenCalled(); // 23505 是预期路径不告警
  });

  it('embedding API 抛错 → 永不抛出, false + warn 日志 (不阻塞主流程)', async () => {
    mocks.generateEmbedding.mockRejectedValue(new Error('embedding down'));

    const ok = await embedSingleRecord('user-1', 'chat_message', 'm1', '内容', {});

    expect(ok).toBe(false);
    expect(userEmbeddingInserts()).toHaveLength(0);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('Single embed failed'));
  });
});

// ============================================================
// 5. triggerLazyBackfillIfNeeded
// ============================================================
describe('triggerLazyBackfillIfNeeded', () => {
  it('count < 阈值 → 触发三源回填 + 释放锁, 调用序列正确', async () => {
    db.embeddingsCount = 0; // 0 < 5 阈值
    db.tableRows.impulse_events = [EVENT_ROW('e1')];
    db.tableRows.email_receipts = [RECEIPT_ROW('r1')];
    db.tableRows.chat_messages = [MESSAGE_ROW('m1')];

    await triggerLazyBackfillIfNeeded('user-1');

    // fire-and-forget 启动的回填 promise: 等微任务排空
    await new Promise((r) => setTimeout(r, 50));

    // 锁序列
    expect(mocks.acquireLock).toHaveBeenCalledWith('embed-backfill:user-1', 180_000, false);
    expect(mocks.releaseLock).toHaveBeenCalledWith('embed-backfill:user-1');

    // 三源表各查一次 + user_embeddings count 一次 + 三源各插入
    expect(sourceSelect('impulse_events')).toBeTruthy();
    expect(sourceSelect('email_receipts')).toBeTruthy();
    expect(sourceSelect('chat_messages')).toBeTruthy();
    expect(userEmbeddingInserts().length).toBe(3);
    expect(mocks.fireAndForgetSafely).toHaveBeenCalledTimes(1);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('Lazy backfill done'),
    );
  });

  it('锁被占 (已有回填在跑) → 跳过, 不查 count 不触发回填', async () => {
    mocks.acquireLock.mockResolvedValue(false);

    await triggerLazyBackfillIfNeeded('user-1');
    await new Promise((r) => setTimeout(r, 20));

    expect(mocks.releaseLock).not.toHaveBeenCalled(); // 未获锁不释放 (锁属他人)
    expect(db.calls.filter((c) => c.op === 'select')).toHaveLength(0);
    expect(userEmbeddingInserts()).toHaveLength(0);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(expect.stringContaining('already in progress'));
  });

  it('count >= 阈值 → 不触发回填; [源码bug#2] 早退路径不释放锁, 等 180s TTL 自爆', async () => {
    db.embeddingsCount = 5; // 5 >= 5

    await triggerLazyBackfillIfNeeded('user-1');
    await new Promise((r) => setTimeout(r, 20));

    expect(userEmbeddingInserts()).toHaveLength(0);
    // 🐛 源码 bug #2 (embed-backfill.ts:480-483): count >= 阈值早退 return 时未 releaseLock,
    //    锁占用直至 180s TTL 过期。期间该用户所有 chat 都拿不到锁 → 触发不了回填。
    //    .finally() 释放锁的注释意图是"让下次触发能立即重试", 早退路径违背该意图。
    //    此断言记录现状 (锁未释放), 修复后应翻转为 toHaveBeenCalledWith。
    expect(mocks.releaseLock).not.toHaveBeenCalled();
  });

  it('count 查询失败 → 早退零写回; [源码bug#2] 同样不释放锁', async () => {
    db.countError = { message: 'count timeout' };

    await triggerLazyBackfillIfNeeded('user-1');
    await new Promise((r) => setTimeout(r, 20));

    expect(userEmbeddingInserts()).toHaveLength(0);
    // 🐛 源码 bug #2 同款 (embed-backfill.ts:475-478): count 查询 error 早退也不 releaseLock
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('Count check failed'));
  });

  it('count 查询抛错 → releaseLock 后 rethrow, 被外层吞掉不抛出', async () => {
    // supabase count 查询 promise reject (非 error 对象返回)
    const supa = h.adminSupabase as { from: ReturnType<typeof vi.fn> };
    supa.from.mockImplementationOnce(() => {
      throw new Error('supabase client exploded');
    });

    await expect(triggerLazyBackfillIfNeeded('user-1')).resolves.toBeUndefined();
    expect(mocks.releaseLock).toHaveBeenCalledWith('embed-backfill:user-1');
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Trigger check failed'),
    );
  });

  it('锁获取抛错 (fail-open 外) → 外层吞掉, 不抛出', async () => {
    mocks.acquireLock.mockRejectedValue(new Error('lock db down'));

    await expect(triggerLazyBackfillIfNeeded('user-1')).resolves.toBeUndefined();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Trigger check failed'),
    );
  });

  it('admin client 缺失 → 静默返回, 不触锁', async () => {
    h.adminSupabase = null;

    await triggerLazyBackfillIfNeeded('user-1');

    expect(mocks.acquireLock).not.toHaveBeenCalled();
    expect(userEmbeddingInserts()).toHaveLength(0);
  });
});
