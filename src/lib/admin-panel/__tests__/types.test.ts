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

  it('LettaOverview: agentCount 与 mcpServers 契约', () => {
    const o: import('../types').LettaOverview = {
      agents: [{ id: 'a1', name: 'n', model: 'm' }],
      agentCount: 1,
      mcpServers: [{ id: 's1', name: 'srv', server_url: 'http://x', server_type: 'stdio' }],
    };
    expect(o.agentCount).toBe(o.agents.length);
    expect(o.mcpServers[0].server_url).toMatch(/^http/);
  });

  it('AgentPoolStatus: 必键 available/poolSize + 索引签名容忍额外键', () => {
    const pool = {
      available: 3,
      poolSize: 5,
      customExtra: 'x',
    } satisfies import('../types').AgentPoolStatus;
    expect(pool.poolSize - pool.available).toBe(2);
    expect((pool as Record<string, unknown>).customExtra).toBe('x');
  });

  it('UserBatchAction: action 白名单四值 + set_plan 带 plan', () => {
    const ban: import('../types').UserBatchAction = { action: 'ban', userIds: ['u1'], bannedUntil: '2030-01-01', reason: 'spam' };
    const plan: import('../types').UserBatchAction = { action: 'set_plan', userIds: ['u2'], plan: 'premium' };
    const unban: import('../types').UserBatchAction = { action: 'unban', userIds: ['u3'] };
    const reset: import('../types').UserBatchAction = { action: 'reset_onboarding', userIds: ['u4'] };
    expect([ban.action, plan.action, unban.action, reset.action]).toEqual(['ban', 'set_plan', 'unban', 'reset_onboarding']);
    expect(plan.plan).toBe('premium');
    expect(ban.reason).toBe('spam');
  });

  it('AuditLog: P0 审计契约 (actor/route/success/metadata)', () => {
    const log: import('../types').AuditLog = {
      id: 1,
      created_at: '2026-10-01T00:00:00Z',
      route: '/api/admin/users',
      method: 'POST',
      actor: 'admin',
      action: 'ban',
      success: true,
      status_code: 200,
      metadata: { userId: 'u1' },
    };
    expect(log.route).toContain('/api/admin/');
    expect(typeof log.success).toBe('boolean');
    expect(log.metadata).toBeTypeOf('object');
  });
});
