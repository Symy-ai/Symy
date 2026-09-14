import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/letta-mcp-manager", () => ({
  getLettaClient: vi.fn(),
  getMCPTools: vi.fn(),
  lettaAPI: vi.fn(),
  getOrCreateSharedMCPServer: vi.fn(),
}));
vi.mock("@/lib/letta-hands-mcp-manager", () => ({
  getOrCreateHandsMCPServer: vi.fn(),
}));

import {
  getAllSymyMCPTools,
  SYMY_TOOL_RULES_BLOCK,
} from "@/lib/letta-agent-tools";
import {
  getMCPTools,
  getOrCreateSharedMCPServer,
} from "@/lib/letta-mcp-manager";
import { getOrCreateHandsMCPServer } from "@/lib/letta-hands-mcp-manager";

describe("Letta agent tool synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateSharedMCPServer).mockResolvedValue("shared-id");
    vi.mocked(getOrCreateHandsMCPServer).mockResolvedValue("hands-id");
  });

  it("merges and deduplicates tools from both MCP servers", async () => {
    vi.mocked(getMCPTools)
      .mockResolvedValueOnce([{ id: "one", name: "symy_search" }])
      .mockResolvedValueOnce([
        { id: "one", name: "symy_search" },
        { id: "two", name: "symy_cart" },
      ]);

    await expect(getAllSymyMCPTools()).resolves.toEqual([
      { id: "one", name: "symy_search" },
      { id: "two", name: "symy_cart" },
    ]);
    expect(getMCPTools).toHaveBeenCalledWith("shared-id");
    expect(getMCPTools).toHaveBeenCalledWith("hands-id");
  });

  it("continues when one server fails", async () => {
    vi.mocked(getMCPTools)
      .mockRejectedValueOnce(new Error("shared unavailable"))
      .mockResolvedValueOnce([{ id: "hands-tool", name: "symy_chat" }]);

    await expect(getAllSymyMCPTools()).resolves.toEqual([
      { id: "hands-tool", name: "symy_chat" },
    ]);
  });

  it("keeps the shared tool rules block under 40 lines and versioned", () => {
    expect(SYMY_TOOL_RULES_BLOCK.split("\n").length).toBeLessThanOrEqual(40);
    // 🐘 人设转型 (2026-09-05): V4 = V3 绿色规则 + 移除过时的镜子 PERSONA OVERRIDE 前言
    expect(SYMY_TOOL_RULES_BLOCK).toContain("SYMY_TOOL_RULES_V4");
    expect(SYMY_TOOL_RULES_BLOCK).not.toContain("SYMY_TOOL_RULES_V3");
    expect(SYMY_TOOL_RULES_BLOCK).not.toContain("SYMY_TOOL_RULES_V2");
  });

  it("V4 drops the stale mirror persona override (mirror persona is gone)", () => {
    expect(SYMY_TOOL_RULES_BLOCK).not.toContain("The mirror persona");
    expect(SYMY_TOOL_RULES_BLOCK).toContain("little elephant companion");
  });

  it("V3 adds green rules: greener alternatives, reuse over purchase, honor framing, no carbon numbers", () => {
    expect(SYMY_TOOL_RULES_BLOCK).toContain("GREEN RULES");
    // 非绿品类结果 → 主动搜绿色替代
    expect(SYMY_TOOL_RULES_BLOCK).toContain("greener alternatives");
    // 二手/租赁走复用建议，不调购买工具
    expect(SYMY_TOOL_RULES_BLOCK).toContain("Secondhand / rental");
    expect(SYMY_TOOL_RULES_BLOCK).toContain("do NOT call purchase tools");
    // 荣誉框架不是羞耻框架；拦截截图是勋章
    expect(SYMY_TOOL_RULES_BLOCK).toContain("Honor framing, never shame");
    expect(SYMY_TOOL_RULES_BLOCK).toContain("badge the user can screenshot");
    // 禁止编造碳足迹数值
    expect(SYMY_TOOL_RULES_BLOCK).toContain("NEVER invent specific carbon-footprint numbers");
  });
});
