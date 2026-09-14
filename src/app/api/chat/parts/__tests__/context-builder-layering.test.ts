/**
 * A2 上下文缓存分层测试 — commerce-agents 上下文三层缓存排列移植 (Apache-2.0 模式借鉴)
 *
 * 不动 context-builder.test.ts 既有用例 (字段存在性/过滤已覆盖)。
 * 本文件只断言"序": 稳定字段在前缀头部, 易变字段在 user message 尾部 (紧贴 <message>)。
 */
import { describe, expect, it } from "vitest";
import type { CultivationStage } from "@/lib/cultivation";

import { buildUserMessageWithContext } from "../context-builder";

const base = {
  userId: undefined,
  cultivationStage: "zhi_yu" as CultivationStage,
  userContent: "hello",
};

const FULL = {
  ...base,
  locale: "zh",
  symyUserRef: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  symySessionRef: "11111111-2222-4333-8444-555555555555",
  symyCurrency: "CNY",
  symyCartTotalCents: 12500,
  symyImpulseItem: "机械键盘",
  challengeContext: {
    // sanitizer 只放行 UUID 形态的 challengeId (prompt-sanitizer.ts UUID_RE)
    challengeId: "c0a80101-7f2a-4c1e-9b3a-0d5e8a1b2c3d",
    itemName: "降噪耳机",
    amount: 100,
  },
  impulseContext: {
    platform: "taobao",
    amount: 99.9,
    reasons: ["countdown"],
  },
  userHistory: "<user_history>past</user_history>",
};

describe("A2 [Context:] 稳定/易变分层", () => {
  it("易变字段位于 RAG 历史之后、<message> 之前 (user message 尾部)", () => {
    const result = buildUserMessageWithContext(FULL);
    const historyAt = result.indexOf("<user_history>");
    const volatileAt = result.indexOf("symy_cart_total_cents:");
    const messageAt = result.indexOf("<message>");
    expect(historyAt).toBeGreaterThanOrEqual(0);
    expect(volatileAt).toBeGreaterThan(historyAt);
    expect(messageAt).toBeGreaterThan(volatileAt);
  });

  it("稳定字段位于易变字段之前 (头部稳定前缀)", () => {
    const result = buildUserMessageWithContext(FULL);
    const order = [
      "cultivation_stage:",
      "symy_user_ref:",
      "symy_session_ref:",
      "symy_lang:",
      "symy_currency:",
      "symy_green_pref:",
      "symy_cart_total_cents:",
      "symy_impulse_item:",
      "challenge:",
      "impulse:",
    ].map((field) => result.indexOf(field));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("字段集合不因分层而增减: challenge_id / 语言锁 / 用户正文都还在", () => {
    const result = buildUserMessageWithContext(FULL);
    expect(result).toContain("challenge_id: c0a80101-7f2a-4c1e-9b3a-0d5e8a1b2c3d");
    expect(result).toContain("[LANGUAGE LOCK:");
    expect(result).toContain("<message>hello</message>");
  });

  it("无任何易变字段时不再输出第二条 [Context:] 行", () => {
    const result = buildUserMessageWithContext(base);
    expect(result.match(/\[Context:/g)).toHaveLength(1);
  });

  it("有易变字段时两层各一条 [Context:] 行, 易变行无悬空前导分隔符", () => {
    const result = buildUserMessageWithContext({
      ...base,
      symyCartTotalCents: 500,
      challengeContext: { challengeId: "c0a80101-7f2a-4c1e-9b3a-0d5e8a1b2c3d", itemName: "包包", amount: 80 },
    });
    const contextLines = result.match(/\[Context:[^\n]*\]/g) ?? [];
    expect(contextLines).toHaveLength(2);
    expect(contextLines[1].startsWith("[Context: symy_cart_total_cents")).toBe(true);
  });
});
