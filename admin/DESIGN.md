# Symy AI 后台管理系统 — 设计方案

> 版本: v1.0 · 2026-07-15
> 状态: 设计完成，进入实现
> 作者: Symy AI 开发者

---

## 一、设计目标（第一性原理）

后台管理系统的本质：**让管理员通过图形界面安全地操作服务器端管理能力，替代 curl/Postman 命令行**。

核心需求拆解：

| 需求 | 解决方式 |
|------|----------|
| 安全认证 | 复用现有 `ADMIN_API_KEY` 机制，key 存 sessionStorage（关闭即失效） |
| 功能覆盖 | 对接全部现有 `/api/admin/*` 路由（Letta 26 actions / Cultivation / Embeddings / Audit / Agent Pool / Weekly Challenges） |
| 操作反馈 | 每个操作有请求参数 + 响应结果 + loading/error 状态展示 |
| 防误操作 | 危险操作（delete/assess_all/backfill_all）二次确认弹窗 |
| 可观测 | 审计日志、Agent Pool 状态、向量库统计可视化 |
| 未实现功能 | 点击弹出"待开发"提示，不新建 API |

---

## 二、目录结构

```
admin/                              # 项目根目录（文档）
├── DESIGN.md                       # 本设计方案
├── API-MAPPING.md                  # admin API ↔ 后台页面映射表
├── USAGE.md                        # 使用说明
└── CHANGELOG.md                    # 后台系统变更日志

src/app/admin/                      # Next.js 后台路由（独立 /admin 路由树）
├── layout.tsx                      # 后台根布局（AdminAuthProvider 包裹 + 守卫）
├── page.tsx                        # Dashboard 仪表盘首页
├── login/
│   └── page.tsx                    # 登录页（输入 ADMIN_API_KEY）
├── letta/
│   └── page.tsx                    # Letta Agent 管理（26 actions）
├── cultivation/
│   └── page.tsx                    # 修身阶段管理
├── embeddings/
│   └── page.tsx                    # RAG 向量库管理
├── audit/
│   └── page.tsx                    # 审计日志查询
├── agent-pool/
│   └── page.tsx                    # Letta Agent Pool 管理
├── challenges/
│   └── page.tsx                    # 每周社区挑战管理
├── users/
│   └── page.tsx                    # 用户管理（待开发）
└── settings/
    └── page.tsx                    # 系统设置（待开发）

src/lib/admin-panel/                # 后台共享逻辑（独立 lib，避免与主站耦合）
├── auth-context.tsx                # AdminAuthProvider（key 管理 + 登录守卫）
├── api-client.ts                   # adminFetch() 封装（自动带 Bearer header）
├── nav-config.ts                   # 侧边栏导航配置
└── types.ts                        # 后台类型定义
```

---

## 三、认证机制

### 3.1 流程
1. 管理员访问 `/admin` → AdminAuthProvider 检查 sessionStorage 无 key → 重定向 `/admin/login`
2. 在 `/admin/login` 输入 ADMIN_API_KEY → 存入 `sessionStorage['symy_admin_key']` → 跳转 `/admin`
3. 后续所有请求经 `adminFetch()` 自动带 `Authorization: Bearer <key>` header
4. 登出 → 清除 sessionStorage → 跳转登录页

### 3.2 安全考量
- ⛔ **不硬编码 key**：key 由管理员手动输入，仅存 sessionStorage
- ⛔ **不用 localStorage**：sessionStorage 关闭标签页即清除，降低泄露风险
- ⛔ **不暴露 service_role key**：所有操作走 `/api/admin/*`（服务端鉴权）
- ✅ **401 自动登出**：api-client 收到 401 自动清除 key + 跳转登录页
- ✅ **key 不进 URL**：只用 header 传递

### 3.3 与主站隔离
- `/admin` 路由树独立 layout，不加载主站的 AuthProvider / i18n / Buddy 状态
- AdminAuthProvider 仅在 `/admin/*` 生效，不影响主站

---

## 四、布局与导航

### 4.1 布局结构
```
┌─────────────────────────────────────────────────┐
│ 顶栏: [Logo] Symy Admin    [env] [admin@xxx] [登出] │
├──────────┬──────────────────────────────────────┤
│          │                                       │
│ 侧边栏    │           主内容区                    │
│ (深色)    │       (浅色, p-6, 响应式)             │
│          │                                       │
│ Dashboard │                                       │
│ Letta     │                                       │
│ Cultivation│                                      │
│ Embeddings│                                       │
│ Audit     │                                       │
│ Agent Pool│                                       │
│ Challenges│                                       │
│ ────────  │                                       │
│ Users     │                                       │
│ Settings  │                                       │
│          │                                       │
├──────────┴──────────────────────────────────────┤
│ Footer (sticky bottom)                           │
└─────────────────────────────────────────────────┘
```

### 4.2 响应式
- 桌面（≥lg）：固定左侧栏 240px + 主内容区
- 平板（md）：可折叠侧边栏（汉堡按钮）
- 移动（<md）：侧边栏变 Drawer（Sheet 组件）

### 4.3 配色
- 侧边栏：`bg-zinc-900 text-zinc-100`（深色，与主站区分）
- 主内容区：`bg-background`（跟随主题）
- 强调色：`text-emerald-600`（成功）/ `text-rose-600`（危险）/ `text-amber-600`（警告）
- ⛔ 不用 indigo/blue

---

## 五、功能模块详设

### 5.1 Dashboard 仪表盘 (`/admin`)

**数据来源**（全部调现有 API）：
- Agent 总数 + MCP servers → `GET /api/admin/letta`
- Agent Pool 状态 → `GET /api/admin/agent-pool`
- 审计日志统计 → `GET /api/admin/audit?action=stats`
- Cultivation 统计 → `GET /api/admin/cultivation?action=stats`
- Embeddings 统计 → `GET /api/admin/embeddings?action=stats`

**展示**：
- 5 个概览卡片（Agent 数 / Pool 可用数 / 今日审计数 / Cultivation 分布 / Embedding 数）
- 快捷操作入口（创建每周挑战 / 批量评估 / 批量回填）
- 系统健康指示灯

### 5.2 Letta Agent 管理 (`/admin/letta`) — 最核心模块

**概览区**：
- Agent 列表表格（id / name / model）—— 来自 `GET /api/admin/letta`
- MCP Servers 列表（id / name / server_url / type）

**26 个 action 操作面板**（按功能分组，Tab 切换）：

| 分组 | Actions |
|------|---------|
| 📝 Prompt 管理 | update_system_prompt, update_all_user_prompts |
| 🧠 Memory Block | update_memory_block, create_memory_block |
| 🔌 MCP | list_mcp_servers, register_mcp_server, refresh_mcp_server, attach_mcp_tools, update_mcp_server_url |
| 🔄 Agent 生命周期 | recompile, sync_all, create_user_agent, migrate_to_per_user, create_test_agent, delete_agent ⚠️, reset_agent_messages ⚠️ |
| 🤖 模型管理 | list_models, update_agent_model, update_all_user_models, update_provider_base_url, update_all_agent_endpoints |
| 💤 Sleeptime | enable_sleeptime, enable_sleeptime_single |
| 🔍 调试 | test_agent_message, get_agent_detail, list_user_agents |

**每个 action 的交互**：
- 表单展示所需参数（从 actions/ 源码提取）
- "执行"按钮 → 调 `POST /api/admin/letta`（body: `{action, ...params}`）
- loading 状态 + 成功/错误结果展示（JSON 折叠）
- 危险操作（delete/reset）二次确认弹窗

### 5.3 修身阶段管理 (`/admin/cultivation`)

| 操作 | API | UI |
|------|-----|----|
| 全平台统计 | `GET ?action=stats` | 统计卡片（各 cultivation_stage / severity_tier 用户数）|
| 单用户画像 | `GET ?action=profile&user_id=` | 输入 user_id → 展示完整画像 |
| 手动评估 | `POST ?action=assess&user_id=` | 输入 user_id → 执行 → 显示新画像 |
| 批量评估 | `POST ?action=assess_all` | ⚠️ 二次确认 → 执行 → 显示处理数 |

### 5.4 RAG 向量库 (`/admin/embeddings`)

| 操作 | API | UI |
|------|-----|----|
| 统计 | `GET ?action=stats` | 概览卡片 |
| 单用户统计 | `GET ?action=user_stats&user_id=` | 输入 user_id → 表格 |
| 回填单用户 | `POST ?action=backfill_user&user_id=` | 输入 user_id → 进度结果 |
| 回填全部 | `POST ?action=backfill_all` | ⚠️ 二次确认 → 结果 |
| API 连通测试 | `GET /api/admin/embeddings/test` | 按钮 → 模型列表 |

### 5.5 审计日志 (`/admin/audit`)

- **统计区**：`GET ?action=stats` → 按 action 分组的柱状概览
- **日志表格**：`GET ?page=&limit=&route=&actor=`
  - 列：时间 / Route / Actor / Action / Success / 详情按钮
  - 分页器
  - 过滤器（route 输入 + actor 输入 + 筛选按钮）
  - 详情按钮 → 展开行显示完整 metadata JSON

### 5.6 Agent Pool (`/admin/agent-pool`)

- **状态卡片**：`GET /api/admin/agent-pool` → available/total/pool_size
- **操作**：
  - 手动 refill → `POST /api/admin/agent-pool`（无 body）
  - 设置 pool_size → `POST /api/admin/agent-pool` body `{setPoolSize: N}`

### 5.7 每周挑战 (`/admin/challenges`)

- 创建挑战表单：weekOffset 数字输入（-4 ~ 4，默认 0）+ 说明
- "创建"按钮 → `POST /api/admin/create-weekly-challenges` body `{weekOffset}`
- 结果展示：创建的挑战列表

### 5.8 用户管理 (`/admin/users`) — 待开发

- 页面展示"待开发"占位卡片
- 规划功能：用户列表 / 搜索 / 详情 / 封禁 / 调整 plan
- 点击任何操作 → Toast"该功能待开发"

### 5.9 系统设置 (`/admin/settings`) — 待开发

- 页面展示"待开发"占位卡片
- 规划功能：环境变量查看 / 配置开关 / 健康检查
- 点击任何操作 → Toast"该功能待开发"

---

## 六、技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 框架 | Next.js 16 App Router | 复用主站 |
| UI | shadcn/ui + Tailwind CSS 4 | 复用现有组件 |
| 状态 | React Context + useState | AdminAuthProvider 管理 key |
| 数据获取 | 原生 fetch + adminFetch 封装 | 不引入 TanStack Query（避免 QueryClientProvider 冲突） |
| 图标 | lucide-react | 复用 |
| 类型 | TypeScript strict | 全量类型 |

---

## 七、安全清单

- [x] ADMIN_API_KEY 仅存 sessionStorage，不硬编码
- [x] 所有请求经服务端 `/api/admin/*`（已有 timing-safe 比较 + 审计日志）
- [x] 不引入 service_role key 到客户端
- [x] 401 自动登出 + 跳转登录页
- [x] 危险操作二次确认（AlertDialog）
- [x] 不破坏主站 `/` 路由（独立 layout）
- [x] 不修改现有 admin API（仅消费）
- [x] key 不进 URL / 不进日志

---

## 八、实现顺序

1. ✅ 设计文档（本文件）
2. 共享层：`src/lib/admin-panel/`（auth-context / api-client / nav-config / types）
3. 登录页 + 布局 + Dashboard
4. Letta 管理（最核心，26 actions）
5. Cultivation / Embeddings / Audit
6. Agent Pool / Challenges
7. Users / Settings（待开发占位）
8. 对抗式审查 + lint
9. agent-browser 自测
10. commit + push
11. 创建定时任务 + 更新 worklog

---

## 九、与主站的关系

- **独立路由树**：`/admin/*` 不影响 `/`（主站）
- **独立 layout**：不加载主站 AuthProvider / i18n provider / Buddy 状态
- **共享 UI 组件**：复用 `src/components/ui/*`（shadcn 组件，无副作用）
- **共享 lib**：仅复用 `src/lib/utils.ts`（cn 函数）
- **不修改主站任何文件**（除 layout.tsx 可能需要排除 /admin 路径，待验证）

---

## 十、验收标准

- [ ] `/admin/login` 能输入 key 并登录
- [ ] 未登录访问 `/admin/*` 重定向到登录页
- [ ] Dashboard 展示 5 个概览卡片（数据来自真实 API）
- [ ] Letta 页 26 个 action 全部可操作（已实现的返回结果，未实现的弹"待开发"）
- [ ] Cultivation / Embeddings / Audit / Agent Pool / Challenges 各页功能正常
- [ ] Users / Settings 点击弹"待开发"
- [ ] 登出功能正常
- [ ] 401 自动登出
- [ ] 危险操作二次确认
- [ ] 响应式（mobile 侧边栏变 Drawer）
- [ ] lint 通过
- [ ] agent-browser 自测全流程通过
