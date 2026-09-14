---
name: api-routes
description: API路由速查/关键文件路径/LLM三级降级链路/SSE事件类型/RPC重试/数据库表速查
type: reference
---

# API 路由速查 + 关键文件路径 (2026-06-11 更新)

---

## API 路由

### 通用
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api | GET | 健康检查 → `{"message":"Hello, world!"}` | 否 |

### 聊天
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/chat | POST | AI 对话（SSE 流式: stream=true → streamToAgent() + 🛡️ Challenge感知补偿）| 是 (BUG-243: 未认证返回401) |
| /api/chat/history | GET | 加载历史消息（游标分页, PAGE_SIZE=6）| 是 |
| /api/chat/history | POST | 保存单条消息 | 是 |
| /api/chat/history | DELETE | 删除单条 / 清空全部 | 是 |

### 邮箱连接与扫描
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/email/imap-connect | POST | IMAP 直连 + 首次扫描 | 是 |
| /api/email/resync | POST | 用已存 IMAP 凭据重新同步 | 是 |
| /api/email/scan | POST | Gmail API 扫描收件箱 | 是 |
| /api/email/status | GET | 邮箱连接状态 + 收据数量 | 是 |
| /api/email/disconnect | DELETE | 断开邮箱连接 | 是 |
| /api/email/receipts | GET | 获取收据列表（支持 status 筛选）| 是 |
| /api/email/receipts | PATCH | 更新收据状态 | 是 |
| /api/email/seed-test | POST | 插入测试收据（Admin Auth）| 是 + Admin |
| /api/email/callback | * | Gmail OAuth 回调 | 否 |
| /api/email/connect | POST | Gmail OAuth 连接 | 是 |

### Buddy 伴侣状态
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/buddy/state | GET | 获取 Buddy 状态 | 是 |
| /api/buddy/state | PUT | 更新/创建 Buddy 状态（数值 clamp）| 是 |
| /api/buddy/health-events | GET | 获取健康事件列表 | 是 |
| /api/buddy/health-events | POST | 创建健康事件 | 是 |
| /api/buddy/dream-funds | GET | 获取所有梦想基金（独立表） | 是 |
| /api/buddy/dream-funds | POST | 创建梦想基金 | 是 |
| /api/buddy/dream-funds | PATCH | 更新梦想基金 | 是 |
| /api/buddy/dream-funds | DELETE | 删除梦想基金 | 是 |

### MCP 工具系统
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/mcp | GET | 获取可用 MCP 工具列表 | 否 |
| /api/mcp | POST | 执行 MCP 工具调用 | 是 |
| /api/mcp/server | * | 标准 MCP 协议端点 (JSON-RPC 2.0) | Bearer + X-MCP-Secret |
| /api/mcp/health | GET | MCP 健康检查 | 否 |

MCP 工具: add_tokens, add_vitality, complete_challenge, add_badge, add_dream_fund_progress, record_impulse

### Letta Agent 管理
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/letta/agent | GET | 查询 Agent 状态 | 是 |
| /api/letta/agent | POST | 确保 Agent 存在 (ensure/status/create) | 是 |

### Admin 管理
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/admin/letta | GET/POST | Letta Agent 管理 (20+ action，含 update_all_user_prompts 批量推送 prompt) | Admin API Key |
| /api/admin/migrate | POST | 一次性迁移 | Admin API Key |
| /api/admin/test-model | GET | 测试自定义模型 | Admin API Key |
| /api/admin/embeddings | GET/POST | RAG 向量库管理 (stats / user_stats / backfill_user / backfill_all) | Admin API Key |
| /api/admin/embeddings/test | GET | Embedding API 连通性测试 (?action=list 列模型) | Admin API Key |
| /api/admin/cultivation | GET/POST | 修身阶段管理 (stats / profile / assess / assess_all) | Admin API Key |

### 审计
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/audit/ai | GET | 用户查自己 AI 行为审计日志 / admin 查任意用户 | 是 / Admin |
| /api/audit/ai | POST | admin 标记审查状态 (review_status) | Admin API Key |

### OpenAI 兼容 LLM 代理
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/v1/chat/completions | POST | 代理 → agnes-2.0-flash (agnes-ai.com) | api-key / Bearer |
| /api/v1/models | GET | 返回 gpt-4.1-mini | api-key / Bearer |
| /api/v1/deployments | GET | Azure 格式模型发现 | api-key / Bearer |
| /api/v1/openai/deployments | GET | Azure 标准路径 | api-key / Bearer |
| /api/v1/openai/chat/completions | POST | Azure 标准路径 Chat 代理 | api-key / Bearer |

### 用户设置
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/user/onboarding | GET/PUT | 导引状态 | 是 |

### 🦋 蝴蝶效应人生剧情 — 登录模式
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/butterfly/session | POST | 创建剧情会话（传入消费决策）+ 生成大纲 | 是 |
| /api/butterfly/session | GET | 获取当前活跃会话 | 是 |
| /api/butterfly/story | POST | 生成/继续剧情（SSE流式） | 是 |
| /api/butterfly/choice | POST | 提交分岔路口选择 | 是 |
| /api/butterfly/sessions | GET | 列出历史会话 | 是 |
| /api/butterfly/illustration | POST | 生成/重新生成章节插图（V8: OpenAI gpt-image-1 + SVG兜底） | 是 |
| /api/butterfly/preload-branch | POST | 预加载分支选择章节（不持久化，55s超时 BUG-245） | 是 |

### 🦋 蝴蝶效应 Demo 模式（无需认证）
| 路由 | 方法 | 功能 | 认证 |
|------|------|------|------|
| /api/butterfly/demo-session | POST | 创建 Demo 会话 | 否 |
| /api/butterfly/demo-session | GET | 获取 Demo 会话 | 否 |
| /api/butterfly/demo-story | POST | Demo 故事流式（SSE） | 否 |
| /api/butterfly/demo-choice | POST | Demo 提交选择 | 否 |
| /api/butterfly/illustration-demo | POST | Demo 生成插图（当前只返回SVG） | 否 |

---

## Letta per-user Agent 扩展性限制（2026-06-30 记录，架构分析 §5.8）

当前模型：每个新用户注册后创建独立 Letta Agent（createAgentForUser）。Symy 当前 4 个用户 = 4 个 Agent，完全可接受。但 1000+ 用户时会崩溃：

- **成本**：每个 Agent 是独立 LLM session，按 active Agent 数计费。1000 用户 × $X/agent/month 不可忽略
- **Prompt 更新复杂度**：每次改 system prompt 都要调 updateAllUserAgentPrompts，1000 用户 = 1000 次 API 调用
- **MCP server 配置爆炸**：方案 A（per-user MCP server）会产生 1000 个 MCP server config
- **冷启动延迟**：Letta sleep-time compute 是 per-agent 的，无法共享

**长期方案（100+ 用户时考虑）**：改为共享 Agent + per-user memory blocks 模式。一个全局 Agent 服务所有用户，用户 ID 通过 message context 传入，Agent 在 memory_blocks 中维护 per-user state。⚠️ 风险：LLM 在多用户上下文切换时可能混淆，需要 POC 验证。

**当前阶段（4 用户）不需要做这个改造**，但在用户数增长到 50+ 时启动 POC 评估。

## 关键文件路径

### 页面
- `src/app/page.tsx` — 主页面 (Tab 切换 + isDemoRef/activeTabRef/eventsRef)
- `src/app/layout.tsx` — 根布局 (AuthProvider, Symy 元数据)
- `src/app/auth/login/page.tsx` — 登录页
- `src/app/auth/signup/page.tsx` — 注册页
- `src/app/auth/callback/route.ts` — Supabase Auth 回调 (含 Agent 即时创建)
- `src/proxy.ts` — ⚠️ Next.js 16 proxy (不要创建 middleware.ts!)

### 前端组件
- `src/components/chat-tab.tsx` — Chat 主页 (SSE stream)
- `src/components/buddy-tab.tsx` — Buddy 伴侣状态页
- `src/components/chat-bubble.tsx` — 消息气泡
- `src/components/home-tab.tsx` — Insights 消费洞察页
- `src/components/monitor-tab.tsx` — 邮件监控详情浮层（Overlay, 通过 Insights "Check Orders" 打开）
- `src/components/family-tab.tsx` — 家庭成员冲动消费信息浮层（Overlay, 通过 Insights "Family Members" 打开, 写死3成员数据）
- `src/components/profile-tab.tsx` — 个人设置页
- `src/components/auth/auth-provider.tsx` — 认证 Provider
- `src/components/auth-prompt-modal.tsx` — 注册拦截弹窗
- `src/components/onboarding-guide.tsx` — 新手导引
- `src/components/error-boundary.tsx` — 错误边界

### 🦋 蝴蝶效应功能 (src/features/butterfly/)
- `components/butterfly-tab.tsx` — 主Tab组件（根据isDemo切换demoPlayer/normalPlayer）
- `components/story-viewer.tsx` — 故事展示（旧版，流式文本+章节色调+打字机光标）
- `components/choice-card.tsx` — 分岔路口选择卡片
- `components/timeline-visual.tsx` — 剧情时间线可视化
- `components/dialogue-box.tsx` — 对话/剧情文字显示组件
- `hooks/use-butterfly-session.ts` — 登录模式 SSE 会话管理 Hook（V17: 含进度恢复+流式）
- `hooks/use-butterfly-demo-session.ts` — Demo SSE 会话 Hook（旧版，demo-player接管核心逻辑）
- `hooks/use-butterfly-demo-player.ts` — Demo 播放器 Hook（V15: 纯客户端状态机）
- `hooks/use-butterfly-normal-player.ts` — 登录模式播放器 Hook（V17: 进度恢复+流式播放）
- `types/index.ts` — 完整类型定义
- `lib/story-engine.ts` — 剧情引擎（LLM提示词+大纲生成+流式讲述+选择生成）
- `lib/illustration-engine.ts` — 插图引擎（V10: OpenAI gpt-image-1 + SVG兜底）
- `lib/svg-illustration-engine.ts` — SVG程序化插图
- `lib/client-illustration-engine.ts` — 客户端插图引擎
- `lib/demo-content.ts` — Demo预写故事
- `lib/demo-session-store.ts` — Demo内存会话存储（⚠️ 有类型签名bug）
- `lib/demo-store.ts` — Demo存储
- `lib/db-mappers.ts` — 数据库行映射

### API 路由文件
- `src/app/api/chat/route.ts` — AI 对话 (25s timeout, SSE stream)
- `src/app/api/chat/history/route.ts` — 聊天历史 CRUD
- `src/app/api/email/*` — 邮箱相关 (imap-connect, resync, scan, status, disconnect, receipts, seed-test, callback, connect)
- `src/app/api/buddy/state/route.ts` — Buddy 状态
- `src/app/api/buddy/health-events/route.ts` — 健康事件
- `src/app/api/mcp/route.ts` — MCP 工具
- `src/app/api/mcp/server/route.ts` — MCP 协议端点
- `src/app/api/letta/agent/route.ts` — Per-User Agent
- `src/app/api/admin/letta/route.ts` — Admin 管理 (20+ action)
- `src/app/api/v1/chat/completions/route.ts` — LLM 代理
- `src/app/api/v1/models/route.ts` — 模型列表
- `src/app/api/v1/deployments/route.ts` — Azure Deployments
- `src/app/api/v1/openai/*` — Azure 标准路径
- `src/app/api/user/onboarding/route.ts` — 导引状态

### 核心库
- `src/lib/buddy-defaults.ts` — 默认值+公式（单一来源）
- `src/lib/buddy-sync.ts` — Buddy 状态同步 (Dexie)
- `src/lib/health-impact.ts` — 健康事件 (原子 RPC)
- `src/lib/mcp-tools.ts` — MCP 工具执行引擎
- `src/lib/letta.ts` — Letta Agent 客户端 (SSE)
- `src/lib/letta-agent-manager.ts` — Agent 生命周期
- `src/lib/mcp-letta-tools.ts` — Letta Custom Tool fallback
- `src/lib/intent-detection.ts` — 🛡️ Challenge 感知意图检测（V2重写：challengeContext感知+确定性检测+中英双语+无明确信号不补偿）
- `src/lib/impulse-detector.ts` — 冲动评分引擎
- `src/lib/email/receipt-parser.ts` — 收据解析器 (7+ 平台, date-fns 日期计算)
- `src/lib/utils.ts` — cn() + formatPlatformName() + calculateDaysStreak() (date-fns)
- `src/lib/supabase.ts` — 仅类型定义 (EmailConnection, EmailReceipt)，运行时对象已删除
- `src/lib/demo-data.ts` — Demo 数据层
- `src/lib/logger.ts` — 结构化日志
- `src/lib/admin-auth.ts` — Admin 鉴权
- `src/lib/ai-audit.ts` — AI 行为审计日志 (logAIBehavior + detectConstitutionViolation)
- `src/lib/embeddings.ts` — RAG 嵌入生成 (智谱 embedding-3, 1024 维, 64 条/批)
- `src/lib/rag.ts` — RAG 检索 (retrieveUserContext + formatContextForPrompt)
- `src/lib/embed-backfill.ts` — RAG 懒加载回填 + 实时嵌入 (embedSingleRecord)
- `src/lib/cultivation.ts` — 修身阶段评估 (assessSeverityTier + assessCultivationStage + getProfile + reassessProfile + getUserCultivationStage + triggerReassessIfNeeded)
- `src/proxy.ts` — Next.js 16 proxy

### 数据库迁移
- `supabase/migrations/001_init.sql` ~ `022_user_intervention_profile.sql`
- ✅ 001~022 全部已执行
- 019 ai_audit_logs (AI 行为审计)
- 020 user_embeddings (RAG 向量库 1536 维，已被 021 替换)
- 021 user_embeddings_zhipu_1024 (RAG 向量库 1024 维，智谱 embedding-3，HNSW 兼容)
- 022 user_intervention_profile (修身阶段评估：severity_tier + cultivation_stage 双维度 + 滚动 7/30 天指标)

---

## LLM 三级降级链路

```
POST /api/chat (SSE 流式)
  ├─ Level 1: Letta Agent (openai-proxy/gpt-4.1-mini → agnes-2.0-flash via /api/v1)
  │           ↑ 系统提示词含 constitution_lock + counselor_skills（doc/AI_Prompt.md）
  │           ↑ 4 个已注册用户 Agent 已通过 update_all_user_prompts 推送新 prompt
  │           ↑ cultivation_stage + <user_history> + <message> 通过 user message Context prefix 注入:
  │             [Context: user_id: UUID | cultivation_stage: zhi_zhi]
  │             <user_history>...</user_history>
  │             <message>actual user message</message>
  ├─ Level 2: OpenAI Gateway (含 RAG + cultivation_stage 注入 system prompt)
  └─ Level 3: z-ai-web-dev-sdk (兜底，含 RAG + cultivation_stage)
```

## RAG 检索链路（Letta + fallback 两路径都已接入 ✅ 2026-06-25）

```
用户消息 → triggerLazyBackfillIfNeeded (异步, 不等待)
         → retrieveUserContext(userId, msg, topK=5)
           ├─ generateEmbedding(msg) → 智谱 embedding-3 (1024 维)
           └─ pgvector HNSW cosine search → top-5 user_embeddings
         → formatContextForPrompt → <user_history>
         → 注入:
           ├─ fallback 路径: buildSymySystemPrompt 注入 system prompt
           └─ Letta 路径: userContentWithStage 加 <user_history> + <message>
             [Context: user_id: UUID | cultivation_stage: zhi_zhi]
             <user_history>...</user_history>
             <message>actual user message</message>
```

- 永不阻塞主流程 — RAG 失败时 userHistory 为空，两路径继续无 RAG 流程
- 懒加载触发条件：用户 user_embeddings 数 < 5 时异步批量回填历史
- ✅ 2026-06-25 升级：Letta 路径也接入 RAG（之前只有 fallback 路径）

## 修身阶段评估链路（Letta + fallback 两路径都接入）

```
用户消息 → triggerReassessIfNeeded (异步, 1h 缓存, 不等待)
         → getUserCultivationStage(userId)
           ├─ getProfile → 不存在则 createDefaultProfile (新用户默认 severe + zhi_yu)
           └─ 返回 cultivation_stage (zhi_yu/zhi_zhi/cheng_yi/zheng_xin)
         → 注入:
           ├─ fallback 路径: buildSymySystemPrompt(impulseContext, userHistory, cultivationStage)
           └─ Letta 路径: user message 加 Context prefix
             [Context: user_id: UUID | cultivation_stage: zhi_zhi] <actual message>
```

- 双维度评级: severity_tier (severe/moderate/light, 西方定强度) + cultivation_stage (东方定风格)
- severity 自动计算: score = impulseCount*4 + amount/10 + avgScore*0.3 (severe>=40, moderate>=20, light<20)
- cultivation 升降级: 30 天指标 + Challenge 通过率（详见 [[critical]] §共生 AI 治理铁律）
- 1 小时缓存: triggerReassessIfNeeded 检查 last_reassessed_at，1h 内跳过
- 永不阻塞主流程: 加载失败返回默认 zhi_yu
- admin API: /api/admin/cultivation (stats / profile / assess / assess_all)

## 冲动评分规则 (6 规则, 阈值 60)

| 规则 | 条件 | 加分 |
|------|------|------|
| late_night | 22:00-06:00 | +30 |
| 2x_amount | ≥ 2x 均值 | +20 |
| rapid_orders | 30min 内多次 | +25 |
| flash_sale | 限时关键词 | +15 |
| impulse_cat | 冲动品类 | +10 |
| livestream | 直播间 | +20 |

## SSE 事件类型
token, reasoning, tool_call, tool_result, done, error

## RPC 重试机制 (BUG-110)
RPC 失败后标记 rpcAvailable=false → 10min 后重置重试

## 数据库表结构速查

### profiles
id (uuid PK), email, display_name, avatar_url, plan, avg_amount, timezone, onboarding_completed, letta_agent_id

### buddy_state
user_id (uuid PK), vitality (0-100, default 72), tokens (156), health, level, xp, streak, dream_funds (jsonb), badges (jsonb), total_saved, challenges_completed, last_drain_at, last_healing_kit_at (timestamptz, nullable)

### dream_funds (独立表, 023 迁移)
- UUID PK, user_id, fund_id, name, target, current, emoji, sort_order
- RLS: 用户只能 select 自己
- buddy_state.dream_funds JSONB 作为缓存（每次 CRUD 后异步同步）
- buddy_state GET 优先从独立表读取 dreamFunds（source of truth），JSONB 作为 fallback
- API: /api/buddy/dream-funds (GET/POST/PATCH/DELETE)
- 优雅降级: 表不存在时 buddy-sync 通过 JSONB 兜底

### chat_messages
id, user_id, role (user/assistant), content, reasoning, created_at

### email_connections
id, user_id, email_address, provider, access_token, refresh_token, status, last_sync_at

### email_receipts
id, user_id, connection_id, message_id, subject, platform, amount, impulse_score, status

### health_events
id, user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata (jsonb)

### 🦋 butterfly_sessions
id, user_id, decision_type, decision_description, amount, platform, context, outline (jsonb), current_chapter, chapters (jsonb), choices (jsonb), status, butterfly_effect (text), final_tone (hopeful/neutral/dark/twist), created_at, updated_at
