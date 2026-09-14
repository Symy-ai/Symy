/**
 * Letta Admin Action 元信息配置
 *
 * 从 src/app/api/admin/letta/actions/*.ts 的 zod schema 提取，
 * 用于在 /admin/letta 页面自动渲染操作表单。
 *
 * 维护约定：新增/修改 action 时，同步更新此处元信息。
 */

import type { LettaActionMeta } from './types';

export const LETTA_ACTION_GROUPS: { group: string; icon: string; actions: LettaActionMeta[] }[] = [
  {
    group: 'Prompt 管理',
    icon: '📝',
    actions: [
      {
        action: 'update_system_prompt',
        label: '更新系统提示词（全量）',
        description: '读取 doc/AI_Prompt.md，推送给所有 per-user agent',
        params: [],
      },
      {
        action: 'update_all_user_prompts',
        label: '批量更新用户 Prompt',
        description: '同 update_system_prompt，遍历所有用户 agent 更新 system prompt',
        params: [],
      },
    ],
  },
  {
    group: 'Memory Block',
    icon: '🧠',
    actions: [
      {
        action: 'update_memory_block',
        label: '更新记忆块',
        description: '更新指定 agent 的某个 memory block（label/value）',
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true, placeholder: 'UUID' },
          { key: 'label', label: 'Block Label', type: 'string', required: true, placeholder: 'human persona' },
          { key: 'value', label: 'Block Value', type: 'textarea', required: true, help: 'string/number/boolean，≤10000 字符' },
        ],
      },
      {
        action: 'create_memory_block',
        label: '创建记忆块',
        description: '创建新 memory block 并附加到指定 agent',
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true, placeholder: 'UUID' },
          { key: 'label', label: 'Block Label', type: 'string', required: true },
          { key: 'value', label: 'Block Value', type: 'textarea', help: '可空，默认空字符串' },
          { key: 'limit', label: 'Limit', type: 'number', help: '字符上限，默认 5000' },
        ],
      },
    ],
  },
  {
    group: 'MCP',
    icon: '🔌',
    actions: [
      {
        action: 'list_mcp_servers',
        label: '列出 MCP Servers',
        description: '查询所有已注册的 MCP server',
        params: [],
      },
      {
        action: 'register_mcp_server',
        label: '注册 MCP Server',
        description: '注册 Symy MCP server 到 Letta（默认名 symy-mcp）',
        params: [
          { key: 'server_name', label: 'Server Name', type: 'string', defaultValue: 'symy-mcp' },
        ],
      },
      {
        action: 'refresh_mcp_server',
        label: '刷新 MCP 工具',
        description: '刷新指定 MCP server 的工具列表',
        params: [
          { key: 'server_id', label: 'Server ID', type: 'string', required: true, placeholder: 'UUID' },
        ],
      },
      {
        action: 'attach_mcp_tools',
        label: '附加 MCP 工具到 Agent',
        description: '刷新 MCP server 工具并附加到指定 agent',
        params: [
          { key: 'server_id', label: 'Server ID', type: 'string', required: true },
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true },
        ],
      },
      {
        action: 'update_mcp_server_url',
        label: '更新 MCP Server URL（全局）',
        description: '强制把所有 MCP server 的 URL 更新为 https://symy.ai/api/mcp/server',
        params: [],
      },
    ],
  },
  {
    group: 'Agent 生命周期',
    icon: '🔄',
    actions: [
      {
        action: 'recompile',
        label: '重新编译全部 Agent',
        description: '遍历所有 per-user agent 执行 recompile',
        params: [],
      },
      {
        action: 'sync_all',
        label: '全量同步',
        description: '更新 prompt + MCP 工具 + recompile 所有 per-user agent',
        params: [],
      },
      {
        action: 'list_user_agents',
        label: '列出用户 Agent',
        description: '查询所有用户的 agent 映射（profiles.letta_agent_id）',
        params: [],
      },
      {
        action: 'create_user_agent',
        label: '为用户创建 Agent',
        description: '为指定 user_id 创建 agent（已存在则同步 prompt/MCP/recompile）',
        params: [
          { key: 'user_id', label: 'User ID', type: 'string', required: true, placeholder: 'UUID' },
          { key: 'user_email', label: 'User Email', type: 'string', help: '可选，用于 agent 命名' },
        ],
      },
      {
        action: 'migrate_to_per_user',
        label: '迁移到 Per-User（批量）',
        description: '为所有没有 agent 的用户创建 agent（每批 BATCH_SIZE 个，需多次调用）',
        params: [],
      },
      {
        action: 'create_test_agent',
        label: '创建测试 Agent',
        description: '创建一个独立测试 agent',
        params: [
          { key: 'model', label: 'Model', type: 'string', defaultValue: 'letta/auto' },
          { key: 'embedding', label: 'Embedding', type: 'string', defaultValue: 'openai/text-embedding-3-small' },
          { key: 'provider_id', label: 'Provider ID', type: 'string', help: '可选' },
          { key: 'model_name', label: 'Model Name', type: 'string', help: '可选' },
        ],
      },
      {
        action: 'delete_agent',
        label: '删除 Agent',
        description: '⚠️ 危险：删除指定 agent 并清除 profiles.letta_agent_id',
        dangerous: true,
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true, placeholder: 'UUID' },
        ],
      },
      {
        action: 'reset_agent_messages',
        label: '重置 Agent 消息历史',
        description: '⚠️ 清空 agent 对话历史（可指定单个，不指定则全部）',
        dangerous: true,
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', help: '可选，不填则全部 agent' },
          { key: 'add_default_initial_messages', label: '添加默认初始消息', type: 'boolean', defaultValue: false },
        ],
      },
    ],
  },
  {
    group: '模型管理',
    icon: '🤖',
    actions: [
      {
        action: 'list_models',
        label: '列出可用模型',
        description: '查询 Letta 已注册的模型 + 自定义 providers',
        params: [],
      },
      {
        action: 'update_agent_model',
        label: '更新单个 Agent 模型',
        description: '修改指定 agent 的 llm model',
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true },
          { key: 'model', label: 'Model', type: 'string', required: true, placeholder: 'openai-proxy/gpt-4.1-mini' },
        ],
      },
      {
        action: 'update_all_user_models',
        label: '批量更新用户模型',
        description: '更新所有 per-user agent 的模型（先注册模型到 Letta）',
        params: [
          { key: 'model', label: 'Model', type: 'string', required: true },
        ],
      },
      {
        action: 'update_provider_base_url',
        label: '更新 Provider Base URL',
        description: '修改 Letta provider 的 base_url 和 api_key',
        params: [
          { key: 'provider_id', label: 'Provider ID', type: 'string', help: '与 provider_name 二选一' },
          { key: 'provider_name', label: 'Provider Name', type: 'string', help: '与 provider_id 二选一' },
          { key: 'base_url', label: 'Base URL', type: 'string', required: true },
          { key: 'api_key', label: 'API Key', type: 'string', required: true },
        ],
      },
      {
        action: 'update_all_agent_endpoints',
        label: '更新全部 Agent Endpoint',
        description: '更新所有 agent 的 LLM endpoint（默认指向 /api/v1）',
        params: [
          { key: 'endpoint', label: 'Endpoint', type: 'string', help: '可选，默认 MCP_SERVER_URL/api/v1' },
        ],
      },
    ],
  },
  {
    group: 'Sleeptime',
    icon: '💤',
    actions: [
      {
        action: 'enable_sleeptime',
        label: '启用全部 Sleeptime',
        description: '为所有 per-user agent 启用 sleeptime compute',
        params: [],
      },
      {
        action: 'enable_sleeptime_single',
        label: '启用单个 Sleeptime',
        description: '为指定 agent 启用 sleeptime',
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true },
        ],
      },
    ],
  },
  {
    group: '调试',
    icon: '🔍',
    actions: [
      {
        action: 'test_agent_message',
        label: '测试 Agent 消息',
        description: '向指定 agent 发送测试消息，返回 AI 回复',
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true, placeholder: 'UUID' },
          { key: 'message', label: 'Message', type: 'textarea', defaultValue: 'Hello, what model are you?' },
        ],
      },
      {
        action: 'get_agent_detail',
        label: '查询 Agent 详情',
        description: '获取指定 agent 的完整配置（含 memory blocks / tools）',
        params: [
          { key: 'agent_id', label: 'Agent ID', type: 'string', required: true },
        ],
      },
    ],
  },
];

/** 所有 action 的扁平列表（便于查找） */
export const ALL_LETTA_ACTIONS: LettaActionMeta[] = LETTA_ACTION_GROUPS.flatMap(
  (g) => g.actions,
);

/** action 总数 */
export const LETTA_ACTION_COUNT = ALL_LETTA_ACTIONS.length;
