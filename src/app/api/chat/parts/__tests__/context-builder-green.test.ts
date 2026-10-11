/**
 * 绿色上下文读取测试 — getSymyGreenContext (请求级 greenPref 覆盖 / impulse_item 摘取)
 *
 * 🔧 R1065 收编: buildUserMessageWithContext 删除后, 其注入面测试 (symy_green_pref /
 * symy_impulse_item 注入 describe) 随删 — 注入行为已由 letta-turn-context 内联
 * symyFields 唯一活构建承接。本文件只保留活函数 getSymyGreenContext 的读取行为。
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

import { getSymyGreenContext } from "../context-builder";

type QueryResult = { data: unknown; error: unknown };

/** Supabase query builder mock — 只实现 getSymyGreenContext 用到的链式调用 */
type ChainStub = QueryResult & {
  select: () => ChainStub;
  eq: () => ChainStub;
  order: () => ChainStub;
  limit: () => Promise<QueryResult>;
};

function makeChain(result: QueryResult): ChainStub {
  const chain: ChainStub = {
    data: result.data,
    error: result.error,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function mockSupabaseTables(tables: Record<string, QueryResult>) {
  (createClient as unknown as Mock).mockImplementation(() => ({
    from: (table: string) =>
      tables[table] ?? makeChain({ data: [], error: null }),
  }));
}

describe("getSymyGreenContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYMY_SUPABASE_URL = "http://localhost:54321";
    process.env.SYMY_SUPABASE_KEY = "test-key";
  });

  it("profiles 探测已删(列不存在死代码) — 默认 on; requestPref 仍是权威开关", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [{ id: "u1", green_pref: "off" }], error: null }),
      impulse_events: makeChain({ data: [], error: null }),
    });
    // 🔧 dead-code removal: green_pref 列在 profiles 上不存在 — 旧断言 mock 的是假列(假绿),
    //    探测分支从未在生产命中。删除后 profiles 行不再影响 greenPref。
    expect(await getSymyGreenContext("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toEqual({
      greenPref: "on",
    });

    mockSupabaseTables({
      profiles: makeChain({ data: [{ id: "u1" }], error: null }),
      impulse_events: makeChain({ data: [], error: null }),
    });
    expect(await getSymyGreenContext("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toEqual({
      greenPref: "on",
    });
  });

  it("取最近一条非空 title 作为 impulse_item, 并过 sanitizer", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [{ id: "u1" }], error: null }),
      impulse_events: makeChain({
        data: [
          { title: null },
          { title: "lipstick\n$59" },
        ],
        error: null,
      }),
    });
    const result = await getSymyGreenContext("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(result.greenPref).toBe("on");
    expect(result.impulseItem).toBe("lipstick $59");
  });

  it("全无 title → impulseItem 省略", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [], error: null }),
      impulse_events: makeChain({ data: [{ title: null }], error: null }),
    });
    const result = await getSymyGreenContext("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(result).toEqual({ greenPref: "on" });
    expect(result.impulseItem).toBeUndefined();
  });

  it("userRef 非法 / 未配置 Supabase / 查询抛错 → 兜底 on, 不抛异常", async () => {
    expect(await getSymyGreenContext("not-a-uuid")).toEqual({ greenPref: "on" });
    expect(createClient).not.toHaveBeenCalled();

    delete process.env.SYMY_SUPABASE_URL;
    expect(await getSymyGreenContext("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toEqual({
      greenPref: "on",
    });

    process.env.SYMY_SUPABASE_URL = "http://localhost:54321";
    (createClient as unknown as Mock).mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await getSymyGreenContext("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toEqual({
      greenPref: "on",
    });
  });
});

describe("getSymyGreenContext — independent queries", () => {
  it("impulse_events 查询失败不阻塞, 兜底 on", async () => {
    // 🔧 R1065: 原 readFileSync 源码字符串断言 (断言死探测已删) 随孤儿函数删除改造 —
    //    行为断言替代形状断言: 查询抛错 → getSymyGreenContext 仍返回默认 on (best-effort 契约)。
    (createClient as unknown as Mock).mockImplementation(() => {
      throw new Error("supabase down");
    });
    const result = await getSymyGreenContext(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      "on",
    );
    expect(result).toEqual({ greenPref: "on" });
  });
});

describe("请求级 greenPref 覆盖 (localStorage 通道, body 优先于 profiles 探测)", () => {
  const USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYMY_SUPABASE_URL = "http://localhost:54321";
    process.env.SYMY_SUPABASE_KEY = "test-key";
  });

  it("请求级 off → off, 直接短路不查 DB", async () => {
    expect(await getSymyGreenContext(USER, "off")).toEqual({ greenPref: "off" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("请求级 on → 即使 profiles 行探测到 off 也保持 on (body 优先)", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [{ id: USER, green_pref: "off" }], error: null }),
      impulse_events: makeChain({ data: [], error: null }),
    });
    expect(await getSymyGreenContext(USER, "on")).toEqual({ greenPref: "on" });
  });

  it("请求级非法值 → 降级 profiles 探测路径 (缺省 on) 并 logger.warn", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [{ id: USER }], error: null }),
      impulse_events: makeChain({ data: [], error: null }),
    });
    expect(await getSymyGreenContext(USER, "yes")).toEqual({ greenPref: "on" });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("全部缺失 (无请求级开关、profiles 无行、impulse 无 title) → on", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [], error: null }),
      impulse_events: makeChain({ data: [], error: null }),
    });
    expect(await getSymyGreenContext(USER)).toEqual({ greenPref: "on" });
  });

  it("请求级 off 时即使 profiles 有脏 off 值, 结果仍是请求级 off", async () => {
    mockSupabaseTables({
      profiles: makeChain({ data: [{ id: USER, green_pref: false }], error: null }),
      impulse_events: makeChain({ data: [], error: null }),
    });
    expect(await getSymyGreenContext(USER, "off")).toEqual({ greenPref: "off" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
