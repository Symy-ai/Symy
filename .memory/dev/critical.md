# Symy AI — 项目关键规则

## 安全规则
- ⛔ service_role key / Secret Key 绝不暴露到 React/Vue 客户端组件（useState/useEffect 所在文件），仅限服务端 API Route 使用
- ⛔ 所有敏感信息（API key、密码等）存放在 Vercel 环境变量或 .env.local，不进 Git

## Git 工作流
- 日常开发永远在 main 分支！
- 没有明确要求，绝不切 release 分支
- commit message 使用 feat/fix/docs 前缀
- ⛔ 绝不 force push，遇 reject 先 `git pull --rebase`
- ⛔ commit author email 必须用 hcl.mygtt@gmail.com（Vercel 部署要求）
- ⛔ **沙盒 commit 铁律** (2026-07-11 教训): 详见 [[sandbox-commit-discipline]]
  - 禁止 `git add -A` 一把梭 — 必须逐个 add
  - 禁止提交沙盒垃圾文件 (db/, prisma/, use-toast.ts, lib/db.ts, next-env.d.ts, screenshots/, audit/)
  - 禁止 UUID commit message — 必须 `type(scope): subject` 格式
  - commit 前必须 `git pull --rebase` + `git status --short` 检查
  - commit 后必须 `git show HEAD --stat` 自检

## Migration 编号铁律 (2026-07-11 强制执行)
- ⛔ **新建 migration 前必须检查 `ls supabase/migrations/ | sort` 取最大编号 +1**
- ⛔ **绝不跳号**——093 被跳过就是因为没检查，导致用户困惑
- ⛔ **绝不同号**——006/051/052/054/055/056/057/066/090 都有重复文件，用户无法确定执行顺序
- ⛔ **纯前端 Round 不产生 migration 时，不占用 migration 编号**——下一个 migration 直接用下一个数字
- ✅ 正确流程: `ls supabase/migrations/ | sort | tail -1` → 取编号 N → 新文件用 N+1
- ✅ 当前最大编号: 095。下一个 migration 用 096

## Bug 历史
- BUG-115/120: 使用 ref 稳定 callback 引用（isDemoRef, activeTabRef）
- BUG-148: 组件卸载时清理 setTimeout
- BUG-153: timer 触发后从数组中移除
- BUG-193: 消费后清除 impulseContext
- BUG-246: 使用 resolvedTheme 判断当前实际主题
- BUG-276: 使用双主题类替代硬编码 hex 颜色
- BUG-310: 所有 hooks 声明在条件早期返回之前
- BUG-321 (RAG): agnes-ai 不支持 embedding → 换智谱 embedding-3
- BUG-322 (RAG): pgvector HNSW 限制 ≤2000 维 → 智谱调 API 传 dimensions=1024
- BUG-323 (RAG): 智谱批量 embedding 限制 64 条/批 → BATCH_SIZE=64
- BUG-324 (P0, 2026-06-26): AI 思考链泄露 + 内部规则暴露 → doc/AI_Prompt.md <reply_style> 加 OUTPUT DISCIPLINE 段（禁止 "Let me analyze..." / 禁止提及工具名/函数名/规则名 / 思考过程静默不输出）
- BUG-327 (N2, 2026-06-26): Gacha 故事卡死在 MAKE YOUR CHOICE 无按钮
- BUG-328 (N3, 2026-06-26): Insights "0 Events / 5 Interventions" 逻辑反 → 重新定义语义：Events=收据(含退款)+Challenge完成，Interventions=Challenge完成+退款完成，保证 Interventions<=Events
- BUG-329 (N8, 2026-06-26): Health Log 退款后变空白 → 去掉 2s debounce + AbortController 防竞态 + 首次 fetch 才显示 loading + fetch 失败保持旧数据 + null guard
- BUG-330 (N9, 2026-06-26): Gacha 章节切换 8-15s → 预加载延迟 2s→500ms + continueStory 等待预加载完成(最多8s)而非走 fallback 重新请求 + 去掉 50ms 人工延迟
- BUG-331 (P0, 2026-06-30): XState v5 root-level on target 缺前导点 → 主页崩溃 "This page couldn't load"
  - 根因: butterfly-machine.ts:378 `target: 'generating_outline'` 应为 `'.generating_outline'`（XState v5 绝对路径语法）
  - 错误自 2026-06-29 XState 重写合并 (commit 6391524) 起存在
  - c80e72e 等 3 次提交误判为 i18n 循环依赖, 实际根因在 XState
  - 修复: commit 70e16a2 单字符添加前导点
  - 教训: 开发流程缺乏浏览器层自测, 所有自测停留在 API curl 层面
  - 防回归: scripts/smoke-test.mjs 冒烟测试脚本已部署
- BUG-332 (P1, 2026-06-30): letta-agent-manager.ts userId 作用域 bug
  - 根因: getOrCreateSharedMCPServer() 内 `mcp:${userId}:${MCP_API_SECRET}` 引用未定义的 userId
  - bearer token 实际为 "mcp:undefined:SECRET", MCP server authenticate() 解析 userId="undefined" (字符串)
  - AI 调工具时触发 user_id mismatch 检查拒绝
  - 修复: commit 0d88289 改用纯 secret (方案 B), AI 在 arguments.user_id 传 UUID
  - 未来: 方案 A (per-user MCP server) 见架构分析报告 §4.2
- BUG-333 (P1, 2026-06-30): context prefix 三重重复构建
  - 根因: chat/route.ts 构建 [Context: ...] + letta.ts sendToAgent 又加一层 + letta.ts streamToAgent 再加一层
  - AI 收到双层 context 头部, 信息部分冲突, 浪费 token
  - 修复: commit 0d88289 移除 letta.ts 的二次构建, 直接用传入的 userMessage
  - 调用方约定: chat/route.ts 传入完整 context, story-engine.ts 传 raw prompt
- BUG-334 (P0, 2026-06-30, ✅ 已修复): i18n TDZ "Cannot access 'en' before initialization"
  - 现象: Chat tab 渲染时抛 ReferenceError, ErrorBoundary 捕获, Chat 功能损坏
  - XState P0 修复后才浮现 (之前被 XState 错误掩盖)
  - 根因: chat-tab.tsx:268 的 useEffect 依赖数组 [user?.id, activeChallenge] 同步求值时
    activeChallenge 仍在 TDZ (声明在 line 332, 但 useEffect 在 line 209)
  - 'en' 是 Turbopack minified 后的 activeChallenge 标识符 (非 i18n locale)
  - c80e72e / d4fa4bc 两次 i18n 修复方向误判 (根因不在 i18n provider)
  - 排查: 启用 productionBrowserSourceMaps → Playwright 捕获 error stack → source-map 包解码
  - 修复: commit ad4e2f5 将 activeChallenge/expiredChallenge 声明上移到所有 useEffect 之前
  - 教训: React hooks 依赖数组在组件体同步求值, 所有被引用的 state 必须在第一个 useEffect 之前声明

## i18n 规则
- 使用 next-intl（v4.13.0），客户端模式（不需要 URL /locale 前缀）
- `useI18n()` hook 来自 `@/i18n/provider`
- 翻译文件: `src/i18n/messages/en.json` + `zh.json`
- 浏览器语言自动检测（中文→zh，其他→en）
- 语言偏好持久化在 localStorage: `symy-locale`
- 语言切换入口: Profile → Settings → Language / 语言
- ErrorBoundary 是 Class 组件，不能用 hooks，保持英文
- 模块级数据用 key 存储模式（labelKey/titleKey/descKey/benefitKeys）

## 共生 AI 治理铁律
- **constitution_lock**（doc/AI_Prompt.md）— 5 条 HARD RULES 道用四·减法代码化，修改须 Foundation 理事会 2/3 + 人民反对<20% + 30天冷却 + 第二次投票
- **counselor_skills**（doc/AI_Prompt.md `<counselor_skills>` 段）— 3 大隐式能力 + 归咎商家话术库，用户无感知
  - Skill 1: 情绪识别（6 大情绪）
  - Skill 2: 认知歪曲识别（6 大歪曲）
  - Skill 3: 阶段切换（致知/诚意/正心，AI 自行判断）
  - 归咎商家策略：冲动消费归咎商家诱导（去污名化），永远不说"你意志力差"
  - 朋友风格：2-4 句精简，匹配用户语言，禁用治疗师话术
- **AI 行为审计**（migration 019 + /api/audit/ai）— 道用六·公开代码化，详情见 [[api-routes]] / [[feature-graph]]
- **RAG 检索**（migration 021 + src/lib/embeddings.ts/rag.ts/embed-backfill.ts）— 道体二·共生代码化，详情见 [[api-routes]] / [[feature-graph]]
- **修身阶段评估**（migration 022 + src/lib/cultivation.ts + /api/admin/cultivation）— 道体二·共生代码化
  - 双维度评级：severity_tier（severe/moderate/light，西方定强度）+ cultivation_stage（zhi_yu/zhi_zhi/cheng_yi/zheng_xin，东方定风格）
  - 二者独立评级，不强制对应
  - severity 自动计算（7 天指标：impulseCount*4 + amount/10 + avgScore*0.3）
  - cultivation 根据 30 天指标 + Challenge 通过率评估（含升降级机制）
  - 1 小时缓存（triggerReassessIfNeeded），避免每次聊天都查 DB
  - 永不阻塞主流程：加载失败返回默认 zhi_yu
  - chat route 注入：fallback 路径通过 system prompt + Letta 路径通过 user message Context prefix
- 3 项修改门槛同总则（详见 doc/symy-lab/constitution.md §五）

## 定位铁律（v2.2，2026-06-25 更新）
- ⛔ 任何用户可见文案（i18n / metadata / AI 系统提示词 / MCP 工具描述 / Demo 数据 / 路演 PPT）必须用 **反诱导消费** 框架，禁止回到 v1 的"反冲动消费"
  - **中文规则**（v2.2 修订）：
    - 名词短语用 **"诱导消费"**（如：诱导消费警报、诱导消费防御、诱导消费模式）—"诱导"已隐含被动义，"被"字冗余且拗口
    - 真正的被动动词保留 **"被"**（如：被商家诱导、被撩拨的消费欲）
    - 成就描述用主动语态 **"识破诱导"**（如：连续7天识破诱导），而非被动"未被诱导消费"
    - ⛔ 禁止"冲动消费"（归责用户）或裸"诱导消费"指代用户的被动受害（语境需清晰指向商家时可用）
  - **英文规则**（v2.2 修订）：
    - 用 **"manipulation / manipulated purchase / algorithmically pushed"** 系列（自然、常见、直接指向商家操纵）
    - ⛔ 禁止"impulse"（归责用户），也禁止"inducement"（生僻、不自然的英文）
    - AI 系统提示词必须明确："The manipulator is the merchant, not the user. Never shame the user."
  - **措辞迭代历史**：
    - v1（已弃用）："冲动消费" / "impulse" — 归责用户
    - v2（2026-06-24）："被诱导消费" / "inducement/induced" — 归责商家，但中文"被"字冗余、英文"inducement"生僻
    - v2.2（2026-06-25）：中文"诱导消费"（去"被"）+ 英文"manipulation"（更自然）
- ✅ 保留不动的技术标识符（避免 DB 迁移与代码 break）：
  - `impulse_score` / `ImpulseEvent` 类型 / `impulse_events` 表 / `record_impulse` MCP 工具名 / `impulse-detector.ts` 文件名 / `impulse_shield` 徽章 ID / `IMPULSE_THRESHOLD` 常量 / `impulseContext` 变量名
  - i18n key 名（`impulseAlert` / `impulseRecorded` / `impulseDetector` / `impulsiveCategory` 等）— 只改 value 不改 key
- ✅ `intent-detection.ts` 的 AI 回复匹配 regex 同时接受所有措辞（`冲动消费|被诱导消费|诱导消费` / `impulse|inducement|induced purchase|manipulation|manipulated`），保证 AI 用任何一种表述都能被补偿层识别
- 详情见 [[project-context]] §基本信息
