import { describe, expect, it } from 'vitest';

import type {
  AdminAuthState,
  ApiResponse,
  DashboardOverview,
} from '../types';

/**
 * admin-panel/types.ts (271行) — 后台管理类型 (与主站隔离, 第十六用)。
 *
 * 锁定:
 * - AdminAuthState 四键 (认证态+双操作)
 * - ApiResponse<T> 四键泛型
 * - DashboardOverview 五域 (agents/pool/audit/cultivation/embedding)
 */
describe('admin-panel types 第十六用', () => {
  it('AdminAuthState 四键 satisfies', () => {
    const auth = {
      isAuthenticated: true,
      apiKey: 'sk-admin',
      login: (_k: string) => {},
      logout: () => {},
    } satisfies AdminAuthState;
    expect(Object.keys(auth)).toHaveLength(4);
  });

  it('ApiResponse<T> 四键泛型 (数据/错误互斥语义)', () => {
    const ok: ApiResponse<{ total: 5 }> = { ok: true, status: 200, data: { total: 5 }, error: null };
    const bad: ApiResponse = { ok: false, status: 500, data: null, error: 'db down' };
    expect(ok.data?.total).toBe(5);
    expect(bad.error).toBe('db down');
    expect(bad.data).toBeNull();
  });

  it('DashboardOverview 五域 satisfies (pool/audit/cultivation 全可 null)', () => {
    const overview = {
      agents: [{ id: 'a1', name: '小象', model: 'gpt' }],
      agentCount: 1,
      mcpServers: [],
      poolStatus: null,
      auditStats: { total: 0 },
      cultivationStats: null,
      embeddingStats: null,
    } satisfies DashboardOverview;
    expect(overview.agents).toHaveLength(1);
    expect(overview.poolStatus).toBeNull(); // 容器未起时 null 态合法
  });
});
