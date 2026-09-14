import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/letta-mcp-manager", () => ({ lettaAPI: vi.fn() }));

import { getOrCreateHandsMCPServer } from "@/lib/letta-hands-mcp-manager";
import { lettaAPI } from "@/lib/letta-mcp-manager";

const jsonResponse = (value: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: () => Promise.resolve(value),
  text: () => Promise.resolve(JSON.stringify(value)),
});

describe("getOrCreateHandsMCPServer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SYMY_HANDS_SECRET = "hands-secret";
  });

  it("reuses the existing symy-hands server without creating it", async () => {
    vi.mocked(lettaAPI).mockResolvedValueOnce(
      jsonResponse([{ server_name: "symy-hands", id: "hands-id" }]) as Response,
    );

    await expect(getOrCreateHandsMCPServer()).resolves.toBe("hands-id");
    expect(lettaAPI).toHaveBeenCalledTimes(1);
    expect(lettaAPI).toHaveBeenCalledWith("/mcp-servers/");
  });

  it("registers the default MCP URL with a trailing slash", async () => {
    delete process.env.SYMY_HANDS_URL;
    const { getOrCreateHandsMCPServer: load } =
      await import("@/lib/letta-hands-mcp-manager");

    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(jsonResponse([]) as Response)
      .mockResolvedValueOnce(jsonResponse({ id: "hands-id" }) as Response);

    await expect(load()).resolves.toBe("hands-id");
    expect(lettaAPI).toHaveBeenLastCalledWith("/mcp-servers/", {
      method: "POST",
      body: JSON.stringify({
        server_name: "symy-hands",
        config: {
          server_url: "https://hands.symy.ai/mcp/",
          mcp_server_type: "streamable_http",
          custom_headers: {
            Authorization: "Bearer hands-secret",
            "X-MCP-Secret": "hands-secret",
          },
        },
      }),
    });
  });

  it("normalizes an environment MCP URL ending in /mcp", async () => {
    process.env.SYMY_HANDS_URL = "https://custom.example.com/mcp";
    const { getOrCreateHandsMCPServer: load } =
      await import("@/lib/letta-hands-mcp-manager");

    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(jsonResponse([]) as Response)
      .mockResolvedValueOnce(jsonResponse({ id: "custom-id" }) as Response);

    await expect(load()).resolves.toBe("custom-id");
    const requestBody = String(vi.mocked(lettaAPI).mock.lastCall?.[1]?.body);
    expect(JSON.parse(requestBody)).toMatchObject({
      config: { server_url: "https://custom.example.com/mcp/" },
    });
  });
});
