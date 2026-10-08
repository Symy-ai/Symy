import { describe, expect, it } from 'vitest';

import {
  ALL_LETTA_ACTIONS,
  LETTA_ACTION_COUNT,
  LETTA_ACTION_GROUPS,
} from '../letta-actions';

/**
 * letta-actions.ts (269行) — Admin Letta 操作表单元信息登记簿。
 *
 * 维护约定（文件头注释）：新增/修改 action 时同步更新元信息。
 * 本测试锁的正是这条约定：meta 与 api/admin/letta/actions/*.ts 的双射。
 */

const apiFiles = [
  'attach_mcp_tools', 'create_memory_block', 'create_test_agent', 'create_user_agent',
  'delete_agent', 'enable_sleeptime', 'enable_sleeptime_single', 'get_agent_detail',
  'list_mcp_servers', 'list_models', 'list_user_agents', 'migrate_to_per_user',
  'recompile', 'refresh_mcp_server', 'register_mcp_server', 'reset_agent_messages',
  'sync_all', 'test_agent_message', 'update_agent_model', 'update_agent_persona',
  'update_all_agent_endpoints', 'update_all_user_models', 'update_all_user_prompts',
  'update_mcp_server_url', 'update_memory_block', 'update_provider_base_url',
  'update_system_prompt',
];

describe('letta-actions Admin 操作登记簿 (269行)', () => {
  it('八组分组齐全: Prompt/Memory/MCP/Agent生命周期/模型/Sleeptime/调试', () => {
    const groups = LETTA_ACTION_GROUPS.map((g) => g.group);
    expect(groups).toEqual([
      'Prompt 管理', 'Memory Block', 'MCP', 'Agent 生命周期', '模型管理', 'Sleeptime', '调试',
    ]);
    // 快照锁定组序（admin 页渲染顺序）
    expect(LETTA_ACTION_GROUPS).toHaveLength(7);
    for (const g of LETTA_ACTION_GROUPS) expect(g.icon).toBeTruthy();
  });

  it('ALL_LETTA_ACTIONS 与 API 路由文件一一对应 (维护约定锁)', () => {
    const metaActions = ALL_LETTA_ACTIONS.map((a) => a.action).sort();
    expect(metaActions).toEqual([...apiFiles].sort());
    // 27 个 action 文件 (含 update_agent_persona — 登记簿缺漏修复后齐)
    expect(LETTA_ACTION_COUNT).toBe(apiFiles.length);
  });

  it('action 标识全局唯一', () => {
    const actions = ALL_LETTA_ACTIONS.map((a) => a.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('每条元信息 label/description 非空 (表单渲染前提)', () => {
    for (const a of ALL_LETTA_ACTIONS) {
      expect(a.label.length, `${a.action} label`).toBeGreaterThan(0);
      expect(a.description.length, `${a.action} description`).toBeGreaterThan(0);
    }
  });

  it('危险操作仅 delete_agent 与 reset_agent_messages (二次确认名单)', () => {
    const dangerous = ALL_LETTA_ACTIONS.filter((a) => a.dangerous).map((a) => a.action);
    expect(dangerous.sort()).toEqual(['delete_agent', 'reset_agent_messages']);
  });

  it('required 参数有 label; params key 用 snake_case (API zod 对齐)', () => {
    for (const a of ALL_LETTA_ACTIONS) {
      for (const p of a.params) {
        expect(p.key, `${a.action}.${p.key}`).toMatch(/^[a-z_]+$/);
        expect(p.label.length, `${a.action}.${p.key} label`).toBeGreaterThan(0);
      }
    }
  });

  it('agent_id 必填参数出现在需要指定 agent 的操作', () => {
    const needAgent = [
      'update_memory_block', 'create_memory_block', 'delete_agent',
      'update_agent_model', 'test_agent_message', 'get_agent_detail',
    ];
    for (const action of needAgent) {
      const meta = ALL_LETTA_ACTIONS.find((a) => a.action === action);
      expect(meta, action).toBeTruthy();
      const p = meta!.params.find((x) => x.key === 'agent_id');
      expect(p, `${action} 缺 agent_id 参数`).toBeTruthy();
      expect(p!.required, `${action}.agent_id 须必填`).toBe(true);
    }
  });

  it('update_provider_base_url 参数含 api_key (敏感项不带 placeholder 回显)', () => {
    const meta = ALL_LETTA_ACTIONS.find((a) => a.action === 'update_provider_base_url')!;
    const keys = meta.params.map((p) => p.key);
    expect(keys).toContain('base_url');
    expect(keys).toContain('api_key');
    const apiKey = meta.params.find((p) => p.key === 'api_key')!;
    expect(apiKey.placeholder).toBeUndefined();
  });

  it('update_system_prompt 与 update_all_user_prompts 均零参数 (读 doc/AI_Prompt.md)', () => {
    for (const action of ['update_system_prompt', 'update_all_user_prompts']) {
      const meta = ALL_LETTA_ACTIONS.find((a) => a.action === action)!;
      expect(meta.params).toEqual([]);
    }
  });

  it('register_mcp_server 默认名 symy-mcp', () => {
    const meta = ALL_LETTA_ACTIONS.find((a) => a.action === 'register_mcp_server')!;
    expect(meta.params[0].defaultValue).toBe('symy-mcp');
  });

  it('enable_sleeptime 双操作: 批量与单 agent', () => {
    const batch = ALL_LETTA_ACTIONS.find((a) => a.action === 'enable_sleeptime')!;
    const single = ALL_LETTA_ACTIONS.find((a) => a.action === 'enable_sleeptime_single')!;
    expect(single.params.some((p) => p.key === 'agent_id')).toBe(true);
    expect(batch.params.some((p) => p.key === 'agent_id')).toBe(false);
  });
});
