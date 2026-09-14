# Admin API ↔ 后台页面映射表

> 后台管理系统调用的所有 admin API 及对应页面

## 一、API 总览

| API 路由 | 方法 | 认证 header | 后台页面 |
|----------|------|------------|----------|
| `/api/admin/letta` | GET | Authorization: Bearer | Dashboard, Letta |
| `/api/admin/letta` | POST (body.action) | Authorization: Bearer | Letta (26 actions) |
| `/api/admin/cultivation` | GET (?action=) | Authorization: Bearer | Dashboard, Cultivation |
| `/api/admin/cultivation` | POST (?action=) | Authorization: Bearer | Cultivation |
| `/api/admin/embeddings` | GET (?action=) | Authorization: Bearer | Dashboard, Embeddings |
| `/api/admin/embeddings` | POST (?action=) | Authorization: Bearer | Embeddings |
| `/api/admin/embeddings/test` | GET | Authorization: Bearer | Embeddings |
| `/api/admin/audit` | GET (?action=stats) | Authorization: Bearer | Dashboard, Audit |
| `/api/admin/audit` | GET (?page=&limit=&route=&actor=) | Authorization: Bearer | Audit |
| `/api/admin/agent-pool` | GET | x-admin-api-key | Dashboard, Agent Pool |
| `/api/admin/agent-pool` | POST (?setPoolSize) | x-admin-api-key | Agent Pool |
| `/api/admin/create-weekly-challenges` | POST (body.weekOffset) | x-admin-api-key | Challenges |

## 二、Letta 26 Actions 详表

| action | 分组 | 参数 | 危险 |
|--------|------|------|------|
| update_system_prompt | Prompt | 无 | |
| update_all_user_prompts | Prompt | 无 | |
| update_memory_block | Memory | agent_id, label, value | |
| create_memory_block | Memory | agent_id, label, value?, limit? | |
| list_mcp_servers | MCP | 无 | |
| register_mcp_server | MCP | server_name? | |
| refresh_mcp_server | MCP | server_id | |
| attach_mcp_tools | MCP | server_id, agent_id | |
| update_mcp_server_url | MCP | 无（强制 symy.ai） | |
| recompile | 生命周期 | 无 | |
| sync_all | 生命周期 | 无 | |
| list_user_agents | 生命周期 | 无 | |
| create_user_agent | 生命周期 | user_id, user_email? | |
| migrate_to_per_user | 生命周期 | 无 | |
| create_test_agent | 生命周期 | model?, embedding?, provider_id?, model_name? | |
| delete_agent | 生命周期 | agent_id | ⚠️ |
| reset_agent_messages | 生命周期 | agent_id?, add_default_initial_messages? | ⚠️ |
| list_models | 模型 | 无 | |
| update_agent_model | 模型 | agent_id, model | |
| update_all_user_models | 模型 | model | |
| update_provider_base_url | 模型 | provider_id?/provider_name?, base_url, api_key | |
| update_all_agent_endpoints | 模型 | endpoint? | |
| enable_sleeptime | Sleeptime | 无 | |
| enable_sleeptime_single | Sleeptime | agent_id | |
| test_agent_message | 调试 | agent_id, message? | |
| get_agent_detail | 调试 | agent_id | |

## 三、认证机制差异

### Bearer Token（多数 API）
```
Authorization: Bearer <ADMIN_API_KEY>
```
- `/api/admin/letta` / cultivation / embeddings / audit 用此方式
- 由 `verifyAdminAuth()` 统一校验（`src/lib/admin-auth.ts`）
- 前端 `adminFetch()` 自动附加

### x-admin-api-key（Agent Pool / Challenges）
```
x-admin-api-key: <ADMIN_API_KEY>
```
- `/api/admin/agent-pool` / create-weekly-challenges 用此方式
- 这两个 route 直接读 `req.headers.get('x-admin-api-key')`
- 前端 `agentPoolFetch()` / `challengesFetch()` 单独封装

> 两种方式校验同一个 `ADMIN_API_KEY` 环境变量，仅 header 名不同。

## 四、待开发 API（后台已占位）

| 规划 API | 对应页面 | 状态 |
|----------|----------|------|
| `/api/admin/users` (list/detail/ban/plan) | 用户管理 | 待开发 |
| `/api/admin/settings` (env/health/migrations) | 系统设置 | 待开发 |

后台页面已创建占位 UI，点击弹出「待开发」提示。后端实现后对接即可。
