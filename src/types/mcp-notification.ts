/**
 * MCP Notification — shared type for AI tool call notifications
 *
 * 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): 旧代码 McpNotification 在 2 处定义,
 *    字段一致但分散在 use-mcp-notifications.ts 和 chat-messages.tsx。
 *    根因修复: 单一 source of truth。
 */

export interface McpNotification {
  /** Unique ID (used as React key) */
  id: string;
  /** Notification message text */
  message: string;
  /** Notification type — affects styling (reward=green, penalty=red, badge=gold) */
  type: 'reward' | 'penalty' | 'badge';
}
