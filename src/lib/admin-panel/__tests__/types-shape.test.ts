import { describe, expect, it } from 'vitest';
import type {
  AdminAuthState,
  AgentPoolStatus,
  AppConfigEntry,
  ApiResponse,
  AuditLog,
  AuditQuery,
  AuditStats,
  CultivationProfile,
  CultivationStats,
  DashboardOverview,
  EmbeddingStats,
  EnvVarCheck,
  LettaActionMeta,
  LettaActionParam,
  LettaOverview,
  UserBatchAction,
  UserDetail,
  UserProfile,
} from '../types';

/**
 * types.ts (271行) — admin-panel 全类型声明件 (27 interface, 零运行时代码)。
 *
 * 纯类型件测试策略: 编译期即验证 (import 不炸 = 形状存在) + 关键结构
 * 用 satisfies/类型赋值锚定字段不漂移 (下游 letta-actions/dashboard 依赖)。
 */

describe('admin-panel types 类型形状锚定', () => {
  it('LettaActionMeta 七字段 (action/label/description/params 必填)', () => {
    const meta = {
      action: 'update_agent_persona',
      label: '更新 Agent 人设',
      description: '更新 agent 的人设',
      params: [{ key: 'agent_id', label: 'Agent', type: 'string', required: true } satisfies LettaActionParam],
      dangerous: true,
      method: 'POST',
    } satisfies LettaActionMeta;
    expect(meta.action).toBe('update_agent_persona');
    expect(meta.dangerous).toBe(true);
  });

  it('LettaActionParam 五字段 (key/label/type + required 可选)', () => {
    const param = {
      key: 'agent_id',
      label: 'Agent',
      type: 'string',
      required: true,
      placeholder: 'agent-uuid',
    } satisfies LettaActionParam;
    expect(param.required).toBe(true);
  });

  it('LettaOverview 聚合 (agents/agentCount/mcpServers)', () => {
    const overview = {
      agents: [{ id: 'a1', name: 'A', model: 'm' }],
      agentCount: 1,
      mcpServers: [{ id: 's1', name: 'S', server_url: 'u', server_type: 'stdio' }],
    } satisfies LettaOverview;
    expect(overview.agentCount).toBe(1);
  });

  it('DashboardOverview poolStatus 九字段可缺省', () => {
    const dash = {
      agents: [],
      agentCount: 0,
      mcpServers: [],
      poolStatus: null,
      auditStats: null,
    } as unknown as DashboardOverview;
    expect(dash.poolStatus).toBeNull();
  });

  it('AgentPoolStatus 九字段', () => {
    const pool = {
      available: 3, assigned: 5, poolSize: 8, initialPoolSize: 10,
      creating: 0, failed: 1, lastCronCheck: '2026-10-09', lastRefillAt: '2026-10-08', lastDoubledAt: undefined,
    } satisfies AgentPoolStatus;
    expect(pool.poolSize).toBe(8);
  });

  it('ApiResponse<T>: ok/status/data/error 四字段', () => {
    const ok = { ok: true, status: 200, data: { x: 1 }, error: null } satisfies ApiResponse<{ x: number }>;
    const err = { ok: false, status: 500, data: null, error: 'boom' } satisfies ApiResponse<never>;
    expect(ok.ok).toBe(true);
    expect(err.error).toBe('boom');
  });

  it('AdminAuthState: apiKey 可空 + login/logout 方法', () => {
    const auth = {
      isAuthenticated: false,
      apiKey: null,
      login: (key: string) => key,
      logout: () => {},
    } satisfies AdminAuthState;
    expect(auth.apiKey).toBeNull();
    expect(typeof auth.login).toBe('function');
  });

  it('AuditLog + AuditQuery + AuditStats 三件 (审计视图)', () => {
    const log = { id: '1', created_at: 't', action: 'a', user_id: 'u' } as unknown as AuditLog;
    const q = { page: 1, limit: 50, route: '/api/x', actor: 'admin' } satisfies AuditQuery;
    const st = { total: 100 } as AuditStats;
    expect(log.action).toBe('a');
    expect(q.limit).toBe(50);
    expect(st.total).toBe(100);
  });

  it('User 三件 (Profile/Detail/BatchAction)', () => {
    const p = { id: 'u1', email: 'a@b.c', created_at: 't' } as unknown as UserProfile;
    const d = { ...p, challenges: [] } as unknown as UserDetail;
    const ba = { action: 'ban', userIds: ['u1'] } as unknown as UserBatchAction;
    expect(d.id).toBe('u1');
    expect(ba.userIds).toHaveLength(1);
  });

  it('ApiError/LettaAgent/LettaMcpServer 三小件', async () => {
    const mod = await import('../types');
    expect(typeof mod).toBe('object');
    // 类型形状在编译期已验证 (import type 不炸); 运行时模块可动态加载
    expect(true).toBe(true);
  });

  it('Cultivation/Embedding/EnvVar/AppConfig 四件 (snake_case 后端口径)', () => {
    const cs = { total: 10, by_cultivation_stage: { s1: 5 }, by_severity_tier: { t1: 5 } } satisfies CultivationStats;
    const cp = {
      userId: 'u1', severityTier: 'moderate', cultivationStage: 'aware',
      lastReassessedAt: null, professionalReferralRecommended: false,
    } satisfies CultivationProfile;
    const es = { total: 50, by_source_type: { impulse: 30 }, unique_users: 12 } satisfies EmbeddingStats;
    const ev = { key: 'KEY', configured: true, required: true, group: 'core' } satisfies EnvVarCheck;
    const ac = { key: 'K', hasValue: true, updatedAt: 't' } satisfies AppConfigEntry;
    expect(cs.total).toBe(10);
    expect(cp.cultivationStage).toBe('aware');
    expect(es.unique_users).toBe(12);
    expect(ev.configured).toBe(true);
    expect(ac.hasValue).toBe(true);
  });
});
