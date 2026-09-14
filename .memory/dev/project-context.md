# Symy AI — 项目上下文

## 基本信息
- 项目: Symy AI — **反诱导消费** AI 伙伴（v2.2 措辞规范，2026-06-25 起）
  - v1（已弃用）: 反冲动消费 — 主体是用户（"是你管不住手"），含归责用户意味
  - v2: 反诱导消费 — 主体是商家算法（"是他们在用 A/B 测试、锚定定价、直播间 FOMO 击穿你"），用户是受害者
  - v2.1 UI 规范(2026-06-24): 中文一律"被诱导消费"，英文一律"inducement/induced" — 已迭代
  - v2.2 措辞优化(2026-06-25): 中文名词短语去"被"用"诱导消费"（更自然），英文用"manipulation/manipulated/pushed"（更常见），成就用"识破诱导"（主动语态）
  - 详见 [[critical]] §定位铁律
- 技术栈: Next.js 16 + React 19 + Tailwind CSS 4 + Supabase + Letta AI
- 仓库: https://github.com/Symy-ai/WeAreAllMe
- 部署: Vercel（自动部署，push main 即触发）
- 生产: https://symy.ai
- 项目路径: /home/z/my-project

## 架构
- App Router（Next.js 16）
- 客户端渲染为主（'use client' 组件）
- Supabase Auth + 数据库
- Letta AI Agent: agent-dc0166e3-dee4-41a0-bf32-b90276552007
- MCP Server: /api/mcp/server
- 主题: next-themes（默认 dark）
- i18n: next-intl v4.13.0（客户端模式，无 URL 前缀）

## i18n 集成（2026-06-24 添加）
- 配置: src/i18n/config.ts（Locale 类型、浏览器检测、localStorage 持久化）
- Provider: src/i18n/provider.tsx（I18nProviderWrapper, useI18n hook）
- 翻译文件: src/i18n/messages/en.json + zh.json（~650 个 key）
- 语言切换: Profile 设置页 → Language / 语言
- 自动检测: navigator.language → zh 或 en
- 模块级数据模式: labelKey/titleKey/descKey + t() 运行时解析

## 页面/组件
- src/app/page.tsx — 主页（4 Tab 导航：Buddy/Mirror/Gacha/Me）
  - 🐘 Buddy: 小象形象 + 游戏化数值 + Dream Funds + Health Log + 徽章 + SymyLedger
  - 🪞 Mirror: TodayReflection (弹出) + AI 对话 + 挑战入口
  - 🎁 Gacha: 蝴蝶效应人生剧情系统
  - 👤 Me: WeeklyReviewCard + BlindSpotMap + Premium + 邀请 + Settings(⚙️覆盖层)
- src/app/auth/login/page.tsx — 登录页
- src/app/auth/signup/page.tsx — 注册页
- src/components/buddy-tab.tsx — AI 伙伴（健康/挑战/徽章）
- src/components/chat-tab.tsx — 聊天（SSE 流式 + MCP, Mirror tab）
- src/components/profile-tab.tsx — 我的页（含 BlindSpotMap, WeeklyReviewCard, Premium, 邀请, Settings）
- src/features/butterfly/ — 蝴蝶效应扭蛋系统（Gacha tab）

## 共生 AI 治理（道经代码化）
- **constitution_lock**（doc/AI_Prompt.md）— 5 条 HARD RULES 道用四·减法代码化，详见 [[critical]] §共生 AI 治理铁律
- **counselor_skills**（doc/AI_Prompt.md `<counselor_skills>` 段）— 3 大隐式能力 + 归咎商家话术库，详见 [[critical]] §共生 AI 治理铁律
- **AI 行为审计**（migration 019 + /api/audit/ai）— 道用六·公开，详见 [[api-routes]] §审计
- **RAG 检索**（migration 021 + src/lib/embeddings.ts/rag.ts/embed-backfill.ts）— 道体二·共生，详见 [[api-routes]] §RAG 检索链路
- **修身阶段评估**（migration 022 + src/lib/cultivation.ts + /api/admin/cultivation）— 道体二·共生，详见 [[api-routes]] §修身阶段评估链路
  - 双维度评级: severity_tier（西方定强度）+ cultivation_stage（东方定风格）
  - chat route 双路径注入: fallback 通过 system prompt + Letta 通过 Context prefix
  - 21 个已注册用户已通过 assess_all 批量初始化 + 评估
- **工作计划**: doc/work-plan/symbiotic-ai-roadmap.md（Phase 0/1/2 + 4 决策点）
- **进度**: 详见 [[feature-graph]] §共生 AI Day 1 落地 + [[user-requests]] §Phase 0 Day 1 进度

## 测试状态
- TypeScript 编译: ✅ 通过（pre-existing TS errors in UI lib & butterfly hooks 非阻塞）
- Build: ✅ 通过（51 pages，含 /api/admin/cultivation）
- 手动测试: 需要在浏览器验证中英文切换
