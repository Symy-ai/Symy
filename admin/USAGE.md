# Symy Admin 使用说明

> 后台管理系统使用指南 · v1.0

## 一、访问入口

- **生产环境**：`https://symy.ai/admin`
- **预览环境**：`https://we-me-mvp-git-main-spark-huang-s-projects.vercel.app/admin`
- **本地开发**：`http://localhost:3000/admin`

> ⚠️ 后台仅限授权管理员使用。所有操作记录在审计日志。

## 二、登录

1. 访问 `/admin` → 自动重定向到 `/admin/login`
2. 输入 `ADMIN_API_KEY`（从 Vercel 环境变量或 `.memory/secrets.md` 获取）
3. 点击「登录后台」
4. 系统会调用 `/api/admin/audit?action=stats` 验证 key 有效性
5. 验证通过后跳转到 Dashboard

**安全机制**：
- Key 仅存于当前标签页的 `sessionStorage`（关闭标签页即清除）
- 不写入 `localStorage`，不进 URL，不进日志
- 401 响应自动登出并跳转登录页
- 退出登录按钮在侧边栏底部

## 三、功能模块

### 3.1 Dashboard 仪表盘 (`/admin`)
展示系统概览：
- **5 个概览卡片**：Letta Agent 数 / Agent Pool 状态 / 审计日志数 / 修身评估数 / RAG 向量数
- **系统健康**：5 个核心服务可用性指示
- **修身阶段分布**：cultivation_stage 柱状图
- **快捷操作**：6 个常用管理入口

数据来源：并行调用 5 个 admin API（`/api/admin/letta`、`/agent-pool`、`/audit?action=stats`、`/cultivation?action=stats`、`/embeddings?action=stats`），单个失败不影响其它。

### 3.2 Letta Agent 管理 (`/admin/letta`)
最核心模块，26 个 action 分 7 组：

| 分组 | Actions |
|------|---------|
| 📝 Prompt 管理 | update_system_prompt · update_all_user_prompts |
| 🧠 Memory Block | update_memory_block · create_memory_block |
| 🔌 MCP | list_mcp_servers · register_mcp_server · refresh_mcp_server · attach_mcp_tools · update_mcp_server_url |
| 🔄 Agent 生命周期 | recompile · sync_all · list_user_agents · create_user_agent · migrate_to_per_user · create_test_agent · delete_agent ⚠️ · reset_agent_messages ⚠️ |
| 🤖 模型管理 | list_models · update_agent_model · update_all_user_models · update_provider_base_url · update_all_agent_endpoints |
| 💤 Sleeptime | enable_sleeptime · enable_sleeptime_single |
| 🔍 调试 | test_agent_message · get_agent_detail |

- **概览区**：Agent 列表（前 20 个）+ MCP Servers 列表
- **操作面板**：每个 action 一个表单，自动渲染参数（string/number/boolean/textarea/json）
- **危险操作**（delete_agent / reset_agent_messages）：AlertDialog 二次确认
- **结果展示**：每个操作显示 loading → success/error + 可折叠的响应 JSON

### 3.3 修身阶段管理 (`/admin/cultivation`)
- **统计**：cultivation_stage（致知/知至/诚意/正心）+ severity_tier（严重/中度/轻度）双维度柱状图
- **单用户画像**：输入 user_id 查询 severity + cultivation_stage + 评估时间
- **手动评估**：输入 user_id 触发重新评估
- **批量评估**：⚠️ 二次确认，对所有用户重新评估（耗 DB）

### 3.4 RAG 向量库 (`/admin/embeddings`)
- **统计**：向量总数 + 按 source_type 分布
- **单用户操作**：输入 user_id → 查询统计 / 回填历史
- **批量回填**：⚠️ 二次确认，回填所有用户历史（耗 token）
- **API 测试**：Embedding API 连通性测试（返回可用模型列表）

### 3.5 审计日志 (`/admin/audit`)
- **统计**：累计记录数 + 按 action 分组
- **过滤查询**：route 精确匹配 + actor 精确匹配
- **日志表格**：时间 / Route / Actor / Action / 状态，支持分页（每页 20 条）
- **行展开**：点击行查看完整 metadata JSON

### 3.6 Agent Pool (`/admin/agent-pool`)
- **状态卡片**：available / total / pool_size
- **健康度**：available/pool_size 进度条（绿/黄/红）
- **手动 Refill**：触发 checkAndRefill
- **设置 Pool Size**：调整 pool_size 目标值

> 注意：此 API 用 `x-admin-api-key` header（非标准 Bearer），前端已封装。

### 3.7 每周挑战 (`/admin/challenges`)
- **创建挑战**：weekOffset 数字输入（-4 ~ 4）+ 快捷选择（上周/本周/下周）
- 0=本周，正数=未来，负数=过去
- 调用 `create_weekly_challenges` RPC + 自动 fallback

### 3.8 用户管理 (`/admin/users`) — 待开发
展示规划功能卡片（用户列表/详情/Plan 调整/封禁/GDPR），点击弹出「待开发」提示。需后端新增 `/api/admin/users` 系列接口。

### 3.9 系统设置 (`/admin/settings`) — 待开发
展示规划功能卡片（环境变量/Key 轮换/Migration/健康检查/Feature Flags/Cron），点击弹出「待开发」提示。

## 四、布局说明

- **桌面**：左侧固定侧边栏（240px）+ 主内容区
- **移动**：侧边栏变 Drawer（汉堡按钮触发）
- **顶栏**：当前页面标题 + ADMIN 徽标 + 主站/GitHub 链接
- **Footer**：sticky 底部，"仅限授权管理员使用 · 所有操作已审计"

## 五、退出登录

侧边栏底部「退出登录」按钮 → 清除 sessionStorage → 跳转登录页。

## 六、故障排查

| 问题 | 解决 |
|------|------|
| 登录提示「API Key 无效」 | 确认 key 与 Vercel `ADMIN_API_KEY` 环境变量一致 |
| 页面自动跳回登录 | 401 自动登出，key 可能被服务端拒绝 |
| Dashboard 卡片显示「未知」 | 对应 admin API 可能未配置环境变量（如 LETTA_API_KEY） |
| Letta 操作返回 500 | 检查 LETTA_API_KEY / MCP_API_SECRET 是否配置 |
| 审计日志为空 | admin_audit_logs 表可能为空（正常，有操作后才记录） |

## 七、安全须知

- ⛔ **不要在公共设备登录**（sessionStorage 关闭标签页才清除）
- ⛔ **不要分享 ADMIN_API_KEY**
- ✅ 所有写操作（delete/assess_all/backfill_all）都有二次确认
- ✅ 所有操作记录在 `admin_audit_logs` 表，可在审计日志页查询
- ✅ key 不进 URL、不进日志、不进 localStorage
