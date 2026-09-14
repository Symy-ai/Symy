import "server-only";

import { lettaAPI } from "@/lib/letta-mcp-manager";
import { logger } from "@/lib/logger";

const HANDS_SERVER_NAME = "symy-hands";
const HANDS_SERVER_URL = normalizeHandsMCPUrl(
  process.env.SYMY_HANDS_URL || "https://hands.symy.ai/mcp/",
);
const HANDS_SECRET = process.env.SYMY_HANDS_SECRET || "";

function normalizeHandsMCPUrl(url: string): string {
  return url.endsWith("/mcp") ? `${url}/` : url;
}

export async function getOrCreateHandsMCPServer(): Promise<string | null> {
  try {
    const listResponse = await lettaAPI("/mcp-servers/");
    if (listResponse.ok) {
      const payload = await listResponse.json();
      const servers = Array.isArray(payload) ? payload : [];
      const existing = servers.find(
        (server: Record<string, unknown>) =>
          server.server_name === HANDS_SERVER_NAME ||
          server.name === HANDS_SERVER_NAME,
      );
      if (existing?.id) {
        logger.info(
          `[Letta Hands MCP] Found existing MCP server: ${existing.id}`,
        );
        return existing.id as string;
      }
    }

    if (!HANDS_SECRET) {
      logger.warn(
        "[Letta Hands MCP] SYMY_HANDS_SECRET not set, cannot create MCP server",
      );
      return null;
    }

    const response = await lettaAPI("/mcp-servers/", {
      method: "POST",
      body: JSON.stringify({
        server_name: HANDS_SERVER_NAME,
        config: {
          server_url: HANDS_SERVER_URL,
          mcp_server_type: "streamable_http",
          custom_headers: {
            Authorization: `Bearer ${HANDS_SECRET}`,
            "X-MCP-Secret": HANDS_SECRET,
          },
        },
      }),
    });

    if (!response.ok) return null;
    const created = (await response.json()) as { id?: string };
    if (created.id)
      logger.info(`[Letta Hands MCP] Created MCP server: ${created.id}`);
    return created.id || null;
  } catch (error) {
    // safe to ignore: registration retried on the next agent touch
    logger.error("[Letta Hands MCP] MCP server registration error:", error);
    return null;
  }
}
