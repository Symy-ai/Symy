---
name: feature-graph
description: 功能完成状态/项目里程碑/已知限制/蝴蝶效应版本迭代/仓库瘦身记录
type: feature
---

# 功能状态图 + 已知问题 + 近期提交

## 项目里程碑（演进概览，细节见 git log / worklog.md）
- Phase 1-3 ✅ 基础框架 + 认证(邮箱/密码/Magic Link) + 邮箱监控(IMAP/Gmail，8+平台解析)
- Phase 4-9 ✅ Bug 修复 + Letta Agent 集成 + 聊天持久化/分页 + IMAP 直连 + Demo 模式路由守卫
- Phase 10 ✅ 代码质量审计（strict mode, -145 包/-37 组件, logger 模块）
- Phase 11 ✅ Vibeathon 清华路演 (2026-05-29)
- Phase 12-15 ✅ 蝴蝶效应 v0.4.0 → V8 图片修复 → V15 Galgame 重构 → V17 持久化+流式
- Phase 16-17 ✅ Challenge Mode V1→V2 + Healing Kit 每日限制 (BUG-219/220)
- Phase 18 ✅ 014 代码精简（-8312 行 / -41 文件 / -40 依赖）
- 后续 ✅ BUG-221~320 六轮回归 + Light Mode 全局主题 + Google OAuth (2026-06-15) + 仓库瘦身 (2026-06-17)
- Phase 19 ✅ Symy Lab 治理文档（道经/总则/共生AI 商业模式 + 先贤天团三轮评议）
- Phase 20 ✅ i18n 国际化（next-intl，en/zh 双语 ~650 key，2026-06-24）
- Phase 21 ✅ 共生 AI Day 1 落地（2026-06-24）— 系统提示词锁定 + AI 行为审计 + RAG 检索
- Phase 22 ✅ 营销定位 v1→v2→v2.1（2026-06-24）— 反冲动消费 → 反诱导消费 → UI 全量"被诱导消费"规范化
- Phase 23 ✅ 措辞通顺性优化 v2.2（2026-06-25）— 中文去"被" + 英文 Inducement→Manipulation
- Phase 24 ✅ 梦想基金可自定义（2026-06-25）— 创建/编辑/删除任意基金（最多10个），移除硬编码 ID 白名单 df-1/df-2，MCP 工具支持 auto 选基金，删除确认弹窗 + aria-label + 触屏可见编辑按钮
- Phase 24.5 ✅ 梦想基金独立表持久化（2026-06-26）— dream_funds 独立表 + CRUD API + 本地优先异步同步 + MCP 双写 + buddy_state GET 独立表 source of truth 修复
- Phase 25 ✅ AI 心理咨询师能力升级（2026-06-25）— 3 大隐式能力 + 归咎商家 + 朋友风格
- Phase 26 ✅ Week 2 修身阶段数据层（2026-06-25）— migration 022 + cultivation.ts + chat route 阶段注入 + 21 用户 assess_all 初始化
- Phase 27 ✅ Letta 路径接入 RAG（2026-06-25）— 双路径都有 RAG，AI 召回用户历史上下文

## 功能完成状态

### 认证功能 ✅
- 邮箱+密码注册/登录 + Magic Link + **Google OAuth** (2026-06-15)
- Auth Provider + Demo模式路由守卫
- Sign Out 三层保障
- ✅ Demo-First: 未登录用户可浏览所有页面，功能点击时弹出注册弹窗
- ✅ Google OAuth 登录: login/signup 页面 "Continue with Google" 按钮 (supabase.auth.signInWithOAuth)
- ⚠️ Google Cloud Console 配置: 同一套 OAuth 凭证同时用于 Auth 登录 + Gmail 扫描
- ⚠️ Supabase URL Configuration: Site URL + Redirect URLs 必须包含 Vercel 域名

### Demo-First UX 架构 ✅ (2026-05-23)
- 用户打开App → 新手导引（6步）→ Demo浏览 → 功能按钮触发注册弹窗
- isDemo = `!user && !loading`
- Auth Prompt Modal: 8种功能特定文案
- Demo 数据层完整

### Callback 稳定化 ✅ (2026-05-25)
- ✅ BUG-115/119/120: ref 模式 + React.Fragment key
- **零 hydration 错误**

### 邮箱收据扫描 ✅
- IMAP 直连 (ImapFlow) + Gmail API
- receipt-parser.ts — 支持 7+ 电商平台

### Chat 对话 ✅
- Letta Agent per-user → LLM Gateway → z-ai-sdk 三级降级
- 🚀 SSE 流式 + Sleep-Time Compute, TTFB 2-3s

### Buddy 持久化 ✅
- Dexie.js (IndexedDB) + Supabase 双写
- Local-First: React state → Dexie → Debounced 2s → Supabase
- 🔧 第三阶段 §5.4 (2026-06-30): 从 adaptive polling 迁移到 Supabase Realtime
  - subscribeToRealtimeUpdates 用 supabase.channel().on('postgres_changes').subscribe()
  - migration 005 已 enable Realtime for buddy_state
  - 60s polling fallback (防 Realtime 断连)
  - 跨设备同步延迟从 5-15s 降到 <1s
  - enterTurboPolling 保留 API 兼容, 内部 no-op

### Per-User Letta Agent 系统 ✅
- Eager creation at auth callback
- 6 MCP tools + MANDATORY prompt
- 🚀 openai-proxy/gpt-4.1-mini → deepseek-v3.2

### MCP 工具系统 ✅
- 6 工具: add_tokens, add_vitality, complete_challenge, add_badge, add_dream_fund_progress, record_impulse
- 原子 RPC + RPC 重试

### 健康系统 ✅
- ✅ BUG-71/94/186/204/205/213/218/219 全部修复
- 原子 RPC + id-based dream fund matching + anon 权限撤销 + stale closure 修复 + Healing Kit每日限制

### 代码质量审计 ✅ (2026-05-26)
- strict mode, 145 packages 删除, 37 dead 组件删除, logger 模块

### 014 代码精简 ✅ (2026-06-06)
- 两轮合计净减少 **8312 行代码** + **41 个文件** + **40 个 npm 依赖**
- 删除全部46个 shadcn/ui 组件文件 + 整个 `src/components/ui/` 目录
- supabase.ts 从 385 行精简到 46 行（仅保留 2 个类型接口）
- 移除 36 个未使用 npm 依赖：uuid, 22个@radix-ui/*, class-variance-authority, sonner, recharts, next-themes, zod, cmdk 等
- date-fns 替代 utils.ts 和 receipt-parser.ts 中的手动日期计算
- 删除废弃的 llm-client.ts (199行) 和 db.ts (13行)
- 蝴蝶效应代码未做任何修改
- Vercel dev 自测通过 (9/9)

### Vibeathon 路演 ✅ (2026-05-29)
- 路演PPT完成 + 演示成功
- 文档一致性修复完成

### 其他 ✅
- 品牌更名, Admin API 鉴权, UI Neon Glassmorphism, 新手导引, 按钮响应性, 冷启动优化

### 🌱 共生 AI Day 1 落地 ✅ (2026-06-24)

道经代码化 — 让 AI 真正与用户利益一致，而非大厂 AI 那样以盈利为目的诱导消费。

完整工作计划见 `doc/work-plan/symbiotic-ai-roadmap.md`（Phase 0/1/2 + 4 决策点 + 道经对齐表）。

#### 1. 系统提示词锁定（constitution_lock）✅
- doc/AI_Prompt.md 新增 `<constitution_lock>` 段，5 条 HARD RULES 道用四·减法代码化
- 修改门槛：Foundation 理事会 2/3 + 人民反对<20% + 30天冷却 + 第二次投票
- src/app/api/chat/route.ts buildSymySystemPrompt 同步加 constitution lock 摘要（fallback 路径）
- ✅ 已通过 admin/letta?action=update_all_user_prompts 推送到所有 4 个已注册用户的 Letta Agent

#### 2. AI 行为审计日志 ✅
- migration 019 (ai_audit_logs 表) + src/lib/ai-audit.ts + /api/audit/ai
- 5 种 action / 3 级 risk / 3 种 review_status
- detectConstitutionViolation 启发式正则自动检测违反 → 自动升级 high 风险
- 3 处埋点：Letta 流式 / Letta 非流式 / Fallback LLM
- ✅ migration 019 已执行

#### 3. RAG 检索系统 ✅
- migration 021 (user_embeddings 表 vector(1024) + HNSW 索引 + retrieve_user_context RPC)
- src/lib/embeddings.ts — 智谱 embedding-3，1024 维，64 条/批
- src/lib/rag.ts — retrieveUserContext + formatContextForPrompt
- src/lib/embed-backfill.ts — 懒加载回填 + 实时嵌入
- /api/admin/embeddings — stats / user_stats / backfill_user / backfill_all
- /api/admin/embeddings/test — API 连通性测试 + 列模型
- chat route 接入：fallback LLM 路径调用前检索 top-5 → 注入 `<user_history>` 到 system prompt
- ✅ migration 021 已执行
- ✅ backfill_all 完成：385 条历史数据全部向量化（28 impulse + 2 receipt + 355 chat）
- ⚠️ Letta 路径暂未接入 RAG（Agent 自有 memory_blocks，待后续观察决定）

#### 4. AI 心理咨询师能力升级 ✅ (2026-06-25)
- doc/AI_Prompt.md 升级：base_instructions + core_principles 加 BLAME THE MERCHANT
- 新增 `<counselor_skills>` 段（3 大隐式能力）：
  - Skill 1: 情绪识别（6 大情绪：孤独/焦虑/无力/无聊/自我怀疑/报复）
  - Skill 2: 认知歪曲识别（6 大歪曲：非黑即白/过度概括/灾难化/情绪推理/应该陈述/个人化）
  - Skill 3: 阶段切换（致知/诚意/正心，AI 自行根据对话判断）
  - 归咎商家话术库（6 大商家诱导：FOMO/锚定/社会认同/身份焦虑/情感绑架/算法推送）
- 升级 `<reply_style>`：朋友风格 NOT 治疗师 / 2-4 句精简 / 中英文匹配 / 禁用治疗师话术
- ✅ 4 个已注册用户 Agent 已通过 update_all_user_prompts 推送新 prompt
- ✅ fallback LLM 路径同步具备 3 大能力（buildSymySystemPrompt）
- ✅ 线上自测 3 场景通过：冲动后/自我怀疑/FOMO

#### 5. Week 2 修身阶段数据层 ✅ (2026-06-25)
- migration 022（user_intervention_profile 表）— 双维度评级 + 滚动指标 + 阶段历史 + 转介机制
- src/lib/cultivation.ts — 完整评估逻辑（severity 自动计算 + cultivation 升降级 + 1h 缓存）
- chat route 双路径接入：fallback 通过 system prompt + Letta 通过 Context prefix
- admin API /api/admin/cultivation（stats / profile / assess / assess_all）
- ✅ migration 022 已执行
- ✅ assess_all 完成：21 个用户全部初始化 + 评估成功，0 失败
- ✅ cultivation stage 注入验证：AI Reasoning 明确识别 zhi_zhi 阶段
- ✅ 线上自测 3 场景通过 + 5 Tab 回归测试通过，0 错误 0 警告

#### 6. Letta 路径接入 RAG ✅ (2026-06-25)
- 之前 Letta 路径只有 cultivation_stage 注入，没有 RAG
- 现在双路径都有 RAG：fallback (system prompt) + Letta (Context prefix)
- userContentWithStage 格式升级：
  ```
  [Context: user_id: UUID | cultivation_stage: zhi_zhi]
  <user_history>...</user_history>
  <message>actual user message</message>
  ```
- ✅ 线上自测 3 场景通过：
  - "我还想买无线充电器" → AI 召回 Gacha $45 故事 + $39 Challenge
  - "我又想买耳机" → AI 召回今天 TikTok $159 + Amazon 耳机对话
  - "今天心情不太好，有点孤独" → 情绪识别 + 非消费替代方案（不乱召回消费历史）
- ✅ Challenge 测试：AI 召回刚才"孤独"情绪 + 智能关联购物动机
- ✅ 5 Tab 回归测试通过，0 错误 0 警告

#### Day 1 待执行（剩余）
- ⏳ 用户数据可导出 API（/api/user/export）— 数据主权 Day 1 雏形
- ⏳ 新数据写入时实时嵌入（impulse_events / chat_messages / email_receipts insert 时调 embedSingleRecord）

#### 4 个 Phase 1 决策点（待用户拍板）
- A 微调目标函数：(a) 用户累计节约金额 [建议] / (b) Buddy 健康度 / (c) 留存率
- B 训练数据基座：(a) Qwen [建议] / (b) Llama / (c) DeepSeek / (d) 多基座并行
- C Day 1 RAG 优先：✅ 已采纳（本 Phase 0 已实施）
- D 用户拥有模型：(d) 全部 [建议] — 虚拟股+API+权重三权分立

### 👨‍👩‍👧‍👦 Family Members 家庭消费监控 ✅ (2026-06-09)
- Insights 页 Check Orders 下方添加 "Family Members" 入口按钮
- 写死 3 个家庭成员数据（John/Spouse, Emma/Daughter, Michael/Son）
- 每个成员显示：被诱导消费数量 + 健康等级 + 趋势（v2 定位下"冲动消费"应理解为"被算法诱导的消费"）
- 展开查看：诱导风险条 + 本周统计(花费/被诱导次数/已节约) + 近期被诱导事件列表
- 顶部汇总：成员数 / 被诱导总数 / 已节约总额（动态 reduce 计算）
- 与 Monitor 同样的 Overlay 浮层模式（← Back 返回 Insights）
- 隐私保护声明 + 邀请成员按钮（Coming Soon）
- 数据为写死，后续可接入真实家庭组 API

## 🎰 Future Gacha 人生剧情系统 — 迭代记录

⚠️ **重要**: 2026-06-09 投资人要求 UI 改名 "Butterfly Effect" → "Future Gacha"，仅改用户可见文字（标题/按钮/描述/emoji🦋→🎰），代码逻辑/API路由/变量名/组件名不变。Tab 标签显示 "Gacha"。

### v0.4.0: 初版 ✅ (2026-05-30)
- 基本三步流程：大纲生成 → SSE流式讲述 → 分岔选择
- story-viewer.tsx + choice-card.tsx + timeline-visual.tsx
- 图片生成：最初只有 SVG 程序化插图

### v0.4.1 / V15: Galgame 视觉小说风格重构 ✅ (2026-06-05)
- **Demo模式**：重构为纯客户端状态机 (use-butterfly-demo-player.ts)
  - 每个场景：全屏背景图（预设CDN URL）+ 底部台词框（打字机效果）+ 手动点击推进
  - Demo模式绝不调用AI生成图片
  - 5章 × 3场景 = 15个场景全部正确显示
- **登录模式**：也重构为 Galgame 风格 (use-butterfly-normal-player.ts)
- DemoScenePlayer 组件：共用场景播放器

### 🛡️ Challenge Mode V2 ✅ (2026-06-06)
- Buddy Tab 弹窗输入物品名+金额
- 跳转Chat tab + 自动发送结构化挑战提示词（强制要求AI精确输出"Challenge PASSED!"或"Challenge FAILED!"）
- cyan色挑战横幅显示物品名+金额+等级
- AI根据提示词判断挑战成败
- AI调用MCP工具(complete_challenge/add_dream_fund_progress/record_impulse)记录结果
- BUG-218修复: isLoadingHistoryRef 替代 stale closure
- **BUG-220/Challenge V2修复**: 补偿机制重写
  - 旧方案问题：纯英文正则、假阳性、默认假设通过(给白嫖奖励)
  - 新方案：challengeContext独立传递 + 只检测AI明确PASSED/FAILED + 中英双语 + 无明确信号不补偿
  - Vercel dev 自测通过

### V17: 登录模式进度持久化 + 流式生成 ✅ (2026-06-06)
- **进度持久化**: loadActiveSession() mount时从后端恢复 + restoration effect 转换为player状态
- **流式生成**: chapter_start 立即播放 + chapter_text 实时更新 + isStreamingChapter 状态控制
- DemoScenePlayer 支持 isStreaming prop：跳过打字机效果 + 显示"Writing..." + 禁止点击推进
- 切换 tab (Chat/Buddy/Insights ↔ Butterfly) 不再丢失进度

### V12: 图片尺寸统一 + 蝴蝶排除指令 ✅ (2026-06-06)
- 尺寸统一为 768x1344（竖屏），节约 token，全屏铺满显示
- Prompt 添加显式排除蝴蝶指令：`NO butterflies, NO insect imagery, NO butterfly patterns`
- 场景级 prompt 直接基于 sceneText，章节级 prompt 基于 contentSnippet + extractVisualHintsFromContent

### ✅ 已完成的图片功能
- **尺寸统一 768x1344** — 竖屏缩略图尺寸，手机全屏铺满显示
- **Prompt 与剧情强关联** — 场景级用 sceneText，章节级用 contentSnippet + 视觉线索提取
- **不生成蝴蝶图案** — 显式排除指令 + extractSceneFromTitle 中 butterfly → 水波涟漪
- **直接AI生图接口** — generateIllustration → generateWithOpenAICompatible → OpenAI gpt-image-1

### V36+: XState 重写 + GLM-5.2 + Bug 修复（2026-06-28~29）✅
- **XState 重写**：use-butterfly-session.ts 从 1838 行重写为 185 行薄壳 + machine 三文件 2354 行（context 单一源，详见 [[butterfly-xstate-rewrite]]）
  - XState v5: setup/createMachine/assign/fromPromise/onDone/fromCallback/sendBack/enqueueActions/spawnChild
  - 关键修复：context from input / fromPromise onDone（非自定义事件）/ fromCallback sendBack（非 send）/ enqueueActions+spawnChild（非 action 函数内 spawn）
- **GLM-5.2 模型切换**：Letta Agent model handle = openai-proxy/glm-5.2，代理层 OVERRIDE_MODEL=glm-5.2，上游 UPSTREAM_LLM_BASE_URL=open.bigmodel.cn
- **normal-player transitionPhase**：33 处 setPhase → transitionPhase（方案 A，集中管理 phase 转换 + 日志）
- **N53 修复**：空章节内容（GLM-5.2 限流 429）时后端发 error 事件（而非空 chapter_end）
- **N58 修复**：Dream Fund 删除有进度时警告 + 从 totalSaved 扣除金额
- **N60 修复**：Insights "Symy — See me" tagline 可点击跳转 Chat
- **N61 修复**：Profile 页 3 个 Coming Soon 行点击弹 toast
- **Gacha 简化**：取消平台输入框，用户只需填描述 + 金额

## 标记为 "Coming Soon" 的功能（N61 修复后点击有 toast 反馈）
- Push Notifications — iOS 不支持监听其他 App 通知
- RPA Plugin — Android only
- Payment Methods

## 已知限制

1. ~~**Chat AI 冷启动慢**~~ — ✅ v0.3.1 SSE 流式已解决
2. **TEMU 邮件检测** — Gmail 垃圾过滤器（非代码 bug）
3. **Logo 未完美** — 用户说"先用"
4. **重复 MCP Server** — weme-mcp 和 symy-mcp（cosmetic）
5. **MCP user_id 信任边界** — 纯 secret 认证无授权校验
6. **Vercel 部署偶尔 stale** — 需推空 commit 触发重建
7. **P2 性能优化机会** — React.memo / useMemo 未使用
8. **Letta 生产环境 base_url** — 当前指向 dev 部署 URL
9. ~~**蝴蝶效应图片生成不工作**~~ — ✅ V8 已修复（OpenAI 兼容 API + SVG 兜底）
10. ~~**蝴蝶效应图片与剧情不匹配**~~ — ✅ V12 已修复（prompt与剧情强关联）
11. ~~**蝴蝶效应图片尺寸太大**~~ — ✅ V12 统一为 768x1344
12. ~~**Challenge AI不调MCP工具**~~ — ✅ V2 已修复（challengeContext感知+确定性检测+中英双语+强化prompt）
13. ~~**demo-session-store.ts 类型签名 bug**~~ — ✅ 已修复（2026-06-27 核实）：`createDemoSession(params: CreateSessionParams)` 已接受对象，与 `demo-session/route.ts` 调用一致。⚠️ 另发现 `demo-store.ts`（旧版，分参签名）为死代码（无任何 import），待后续清理
14. ~~**Serverless 内存去重无效（activeBackfills/activeScans Map 在 Vercel 多实例不共享）**~~ — ✅ **TECH-DEBT-A 已修**：`acquireLock` 分布式锁（migration 024 `distributed_locks` 表）替代内存 Map；butterfly/session backfill、email/scan、email/resync 均已接入；fail-open 容错。migration 024 已执行
15. ~~**Buddy State PUT 无乐观锁（并发更新丢失）**~~ — ✅ **TECH-DEBT-B 已修**：CAS `version` 列（migration 025 `buddy_state.version`）+ 后端 `.eq('version', v)` 不匹配返 409 + 客户端 `buddy-sync` 409 重试合并（server wins）；version 列缺失自动 fallback upsert。migration 025 已执行

## BUG-186 Dream Funds 修复记录 (2026-05-26)

### 根因
1. SQL 默认 `dream_funds = '[]'` → 空 JSONB 数组
2. RPC 函数 `jsonb_array_elements([])` 返回 0 行 → 静默失败
3. 客户端 `??` 对空数组无效

### 修复层
1. buddy-sync.ts: normalizeDreamFunds()
2. mcp-tools.ts: legacy path seed defaults
3. health-impact.ts: refund_boost seed defaults
4. buddy/state PUT: validateDreamFunds
5. migration 011: SQL 默认值 + 回填 + RPC 自动 seed

## BUG-204/205/213 安全修复记录

### BUG-204: anon 可执行 RPC 函数
- REVOKE EXECUTE FROM anon, 只 GRANT 给 authenticated 和 service_role

### BUG-205: refund_boost 始终给第一个梦想基金
- 改为 id-based matching (`elem->>'id' = target_fund_id`)
- 新增 p_dream_fund_id 参数

### BUG-213: 函数 overload 导致 BUG-205 无效
- PostgreSQL 有 10-param 和 11-param 两个版本
- 默认调用 10-param 版本 → BUG-205 修复无效
- migration 013: DROP 旧 10-param overload

## 2026-06-17 仓库瘦身 (commit `f0f013d`)

### 删除（共 651 文件，~140MB）
- `doc/PPT_make/tests/test_*.pptx` × 10
- `SymyAI_期末汇报.pptx`
- `pitch-qa-screenshots/` × 14
- `workspace/` × 287 (不再跟踪 + .gitignore)
- `skills/` × 339 (不再跟踪 + .gitignore 已含)

### 保留
- `doc/PPT_make/source_html/` (slide_01~18.html + global.css + images/)
- `doc/PPT_make/scripts/` + `tests/final_tests/` + `tests/random_topics/`
- 所有应用代码

### 当前树统计
- 文件数: 1422 → 509 (减少 64%)
- 当前树大小: 155 MB → 15.26 MB (减少 90%)
- ⚠️ 历史 objects 未清理，git clone 体积未变 (仍 324MB)，需 git filter-repo 重写才能根治

### .gitignore 更新
- 加 `workspace/`
- `skills/` 已存在
