import { describe, expect, it } from 'vitest';

import { resolveChatEndpoint } from '../chat-endpoint';

/**
 * chat-endpoint.ts (18行) — 端点选择 SSOT (P0 demo retry 死循环修复件)。
 *
 * 锁定:
 * - isDemo → 匿名端点 (daily 额度+userAgentId)
 * - 登录 → 登录端点 (user id 计费)
 * - 字面量类型: 两值之外不可能
 */
describe('resolveChatEndpoint SSOT', () => {
  it('isDemo → 匿名端点; 登录 → 登录端点', () => {
    expect(resolveChatEndpoint(true)).toBe('/api/chat/anonymous');
    expect(resolveChatEndpoint(false)).toBe('/api/chat');
  });

  it('返回值字面量联合 (两值之外编译不可能)', () => {
    const endpoint: ReturnType<typeof resolveChatEndpoint> = resolveChatEndpoint(false);
    expect(['/api/chat/anonymous', '/api/chat']).toContain(endpoint);
  });
});
