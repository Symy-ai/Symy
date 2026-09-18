/**
 * i18n 冒烟 (batch80-c): chat.mcpNotifications.* zh/en 双侧键完整
 *
 * 背景: 两个调用点均不传 defaultValue —
 *   - use-chat-actions.ts 非流式 toolCalls 通知分档 (plain/WithAmount 全系 key)
 *   - consume-ai-stream.ts handleToolEvent 的 toolName switch (plain key)
 * 缺键会直接把原始 key 渲染进通知。本测试枚举双侧词典该子树全量键做对称断言:
 * 任何一侧缺键 / 删整块都会红, 并固化键值为非空字符串。
 */
import { describe, expect, it } from 'vitest';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';

type McpBlock = Record<string, string>;
const zhChat = (zh as Record<string, unknown>).chat as Record<string, unknown>;
const enChat = (en as Record<string, unknown>).chat as Record<string, unknown>;
const zhBlock = zhChat.mcpNotifications as McpBlock;
const enBlock = enChat.mcpNotifications as McpBlock;

describe('i18n 冒烟: chat.mcpNotifications zh/en 键面一致 (无 defaultValue 兜底)', () => {
  it('双侧均存在 mcpNotifications 块且非空 (防整块误删静默通过)', () => {
    expect(zhBlock).toBeDefined();
    expect(enBlock).toBeDefined();
    expect(Object.keys(zhBlock).length).toBeGreaterThan(0);
    expect(Object.keys(enBlock).length).toBeGreaterThan(0);
  });

  it('zh 每个 key 在 en 存在, 且双侧值均为非空字符串', () => {
    for (const [key, zhValue] of Object.entries(zhBlock)) {
      expect(enBlock[key], `en 缺键 chat.mcpNotifications.${key}`).toBeDefined();
      expect(typeof zhValue, `zh.${key} 非字符串`).toBe('string');
      expect(zhValue.length, `zh.${key} 空文案`).toBeGreaterThan(0);
      expect(typeof enBlock[key], `en.${key} 非字符串`).toBe('string');
      expect((enBlock[key] as string).length, `en.${key} 空文案`).toBeGreaterThan(0);
    }
  });

  it('en 每个 key 在 zh 存在 (反向无漂移)', () => {
    for (const key of Object.keys(enBlock)) {
      expect(zhBlock[key], `zh 缺键 chat.mcpNotifications.${key}`).toBeDefined();
    }
  });
});
