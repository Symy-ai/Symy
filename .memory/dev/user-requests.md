---
name: user-requests
description: 待办Backlog/历史任务记录/用户关键约束
type: backlog
---

# 用户核心诉求 (2026-06-15 v21 更新)

## 待办 Backlog（从原 project-context 迁入）

1. **APK 更新** — 加入 Butterfly Tab + v0.4.0 + Challenge V2 + Family Members
2. **CF Pages 重新部署** — 新功能需重部署（国内直连 https://we-me.pages.dev）
3. **P2 性能优化** — React.memo / useMemo / loadMoreMessages 稳定化（亦见 [[feature-graph]] 已知限制）
4. **MCP user_id 授权校验** — 当前纯 secret 认证，建议加 mcp:{userId}:{secret}
5. **Logo 优化** — ymy 腿部字母融入不够（用户说"先用"）
6. **✅ Letta 生产环境 base_url** (2026-06-17 已完成) — My_deepseek provider base_url 已从 dev 切换到 main，代码 fallback 全改 main Preview，admin/letta 路由 provider_type 修正为 openai。⚠️ Letta 平台后台 Provider 配置仍需手动同步（详见 [[critical]] §10/§13）
7. **⚠️ AI偶尔泄露内部推理** — Letta Agent streaming 有时把 chain-of-thought 当正文输出
8. **Family Members 接入真实数据** — 当前写死3成员，需家庭组 API + 数据库表

> 📌 **共生 AI 落地工作计划**见 `doc/work-plan/symbiotic-ai-roadmap.md`（含 Phase 0/1/2 + 4 决策点 + 道经对齐表）
>
> **Phase 0 Day 1 进度**（详见 [[feature-graph]]）：
> - ✅ 系统提示词锁定（constitution_lock）— 4 个已注册用户 Agent 已推送
> - ✅ AI 行为审计日志（migration 019 已执行）
> - ✅ RAG 检索（migration 021 已执行 + 385 条历史已向量化）
> - ✅ AI 心理咨询师能力升级（counselor_skills 3 大隐式能力 + 归咎商家话术 + 朋友风格）
> - ✅ Week 2 数据层（migration 022 已执行 + 21 用户已 assess_all 初始化）
> - ✅ Letta 路径接入 RAG（2026-06-25，双路径都有 RAG）
> - ⏳ 用户数据可导出 API（/api/user/export）
> - ⏳ 新数据写入时实时嵌入（impulse_events / chat_messages / email_receipts insert 时调 embedSingleRecord）



## 当前任务

### 🎯 v2.2 措辞通顺性优化 — ✅ 已完成 (2026-06-25)

**用户请求**: "所有语句都符合日常表达并且通顺了么？" + "不要再写'冲动'！冲动是指责用户的，要用'被诱导'之类的，指责商家的词" + "英文的改了么？"

**背景**: v2.1 将所有"冲动消费"改为"被诱导消费"(中文) / "Inducement/Induced"(英文)，但存在通顺性问题：
- 中文"被诱导消费"作为名词短语时"被"字冗余且拗口（"诱导消费"已隐含被动义）
- 英文"Inducement"生僻不自然，日常英语几乎不用
- 个别表达语义不通（"诱导承认"→"承认诱导"、"未被诱导消费"→"识破诱导"）

**已完成**:
- ✅ 中文 i18n (`zh.json`) 名词短语去"被"：44处"被诱导消费"→"诱导消费"（如：诱导消费警报、诱导消费防御、诱导消费模式）
- ✅ 中文保留"被"在真正被动动词：被商家诱导、被撩拨的消费欲
- ✅ 中文语义修正："诱导承认"→"承认诱导"、"连续7天未被诱导消费"→"连续7天识破诱导"
- ✅ 中文额外修复："说服我消费"→"说服我值得买"、"试试输入"→"输入试试"
- ✅ 英文 i18n (`en.json`) 40+处："Inducement"→"Manipulation"、"Induced purchase"→"Manipulated purchase"、"Algorithmic Inducement Defense"→"Algorithmic Manipulation Defense"
- ✅ 英文动词短语："algorithmically induced"→"algorithmically pushed"、"our induced desires"→"the desires pushed on us"
- ✅ `.memory/` 更新：critical.md v2.1→v2.2 / project-context.md 同步 / user-requests.md 记录 / git-state.md 更新 HEAD / feature-graph.md 追加

**关键约束**:
- ⛔ 永不回到 v1 "反冲动消费"框架（详见 [[critical]] §定位铁律）
- ⛔ 永不归责用户 — AI 必须把商家算法定位为操纵者（manipulator）
- 详见 [[critical]] §定位铁律 + [[project-context]] §基本信息

### 🎯 v2.1 营销定位 UI 规范化 — ✅ 已完成 (2026-06-24)

**用户请求**: "把app里面的文字也改掉（冲动消费改成被诱导消费，中英文都改）然后，查看记忆主文件：https://github.com/Spark-Huang/WeAreAllMe/blob/main/.memory/MEMORY.md 认真按照规范更新记忆。"

**背景**: v2 定位已在 commit `1c84eaf` 调整（反冲动消费 → 反诱导消费），但 UI 文案仍混用"诱导消费"（无"被"字）/ "被诱导消费"。用户要求统一为"被诱导消费"，强调用户是被商家算法诱导的受害者。

**已完成**:
- ✅ `src/i18n/messages/zh.json` — 30+ 处 "诱导消费" → "被诱导消费"（统一被动语态）
- ✅ `src/i18n/messages/en.json` — "Impulsive category" → "Induced category"
- ✅ `src/lib/demo-data.ts` — demo chat 消息 impulse → induced (5 处)
- ✅ `src/lib/letta-agent-manager.ts` — Agent persona 明确"merchant is inducer, user is victim"
- ✅ `src/app/api/mcp/server/route.ts` — MCP 系统提示词 v2 化
- ✅ `src/app/api/chat/route.ts` — Chat 系统提示词 v2 化（5 处）
- ✅ `src/lib/mcp-letta-tools.ts` — record_impulse 工具描述 v2 化（5 处）
- ✅ `src/lib/mcp-tools.ts` — record_impulse 工具描述 + args + 返回消息 v2 化（3 处）
- ✅ `src/lib/intent-detection.ts` — regex 兼容新旧措辞（`冲动消费|被诱导消费|诱导消费`），向后兼容
- ✅ `src/app/api/butterfly/illustration-demo/route.ts` — 'an impulse purchase' → 'an induced purchase'
- ✅ src/ 全部代码注释 冲动 → 被诱导 / impulse → induced（globals.css / family-tab / chat-tab / health-impact / letta / utils / use-buddy-state / story-engine / buddy-defaults / database.types / impulse-detector / mcp-tools）
- ✅ `.memory/` 更新：critical.md 新增"定位铁律"章节 / project-context.md 补充 v2.1 规范 / user-requests.md 记录本会话 / git-state.md 更新 HEAD

**保留不动**（避免 DB 迁移与代码 break）:
- 技术标识符：`impulse_score` / `ImpulseEvent` / `impulse_events` 表 / `record_impulse` MCP 工具名 / `impulse-detector.ts` 文件名 / `impulse_shield` 徽章 ID / `IMPULSE_THRESHOLD` / `impulseContext` / i18n key 名
- 历史文档：worklog.md / 路演文稿 v6-v8 / `public/pitch/index.html.bak` / archive

**关键约束**:
- ⛔ 永不回到 v1 "反冲动消费"框架（详见 [[critical]] §定位铁律）
- ⛔ 永不归责用户 — AI 必须把商家算法定位为诱导者
- 详见 [[critical]] §定位铁律 + [[project-context]] §基本信息

### 🔑 Google OAuth 登录 — ✅ 已完成 (2026-06-15)

**已完成**:
- ✅ login/signup 页面添加 "Continue with Google" 按钮
- ✅ 代码推送到 dev + main + release
- ✅ Google Cloud Console 配置（复用 Gmail 扫描的 OAuth 凭证）
- ✅ Supabase Dashboard Google Provider 启用
- ✅ Supabase URL Configuration 修复（添加 Vercel 域名到 Redirect URLs）
- ✅ 用户实测通过

**踩坑**: OAuth 回调后跳到 we-me.pages.dev（老网址）→ 原因是 Supabase URL Configuration 缺少 Vercel 域名 → 修复后正常

### 📝 奇绩创谈 (MiraclePlus) 创业营申请 — ✅ 材料已完成 (2026-06-13)

**已完成的申请材料**:
- ✅ 一句话概括
- ✅ 项目描述
- ✅ 技术描述
- ✅ 项目特别之处
- ✅ 用户/场景/问题（三阶段版本）
- ✅ 竞品分析（起步+终局）
- ✅ Why Now时机分析
- ✅ 30秒口述
- ✅ BP文档生成 (`download/Symy_AI_商业计划书.docx`)

**核心商业模型定稿** (本次沟通确认):
- 四层渐进体系：Buddy(情感陪伴/共生伴侣)→Chat(认知揭示/CBT)→Future Gacha(未来盲盒/视角层)→Challenge(理性闯关/行为层)
- 三阶段商业路径：省钱(起步)→省心(进阶)→省力(终局)
- 诱导拦截模型：情绪触发识别→真实需求评估→三档干预(值得买/可延后/谨慎购买)（v2 定位下"冲动拦截"已更名为"诱导拦截"，技术实现 `impulse-detector.ts` 保留不动）
- CBT路径(清华心理学团队)：自动思维识别→认知歪曲检验→替代思维生成
- 数据飞轮：独家诱导拦截数据→更好AI→更高拦截率→更多数据→更多用户
- 梦想基金：与银行合作储蓄，被拦截的诱导消费金额转入
- 无论输赢都爽：赢=理性确认，输=钱进梦想基金
- 消费决策四层(终局框架)：欲望触发→决策判断→选择比较→执行下单，Symy占"决策判断"
- 商业化：起步(订阅+$7-10/月+梦想基金分润)→进阶(CPS佣金+AI代买)→终局(决策入口税+Symbio Card)
- 时间贴现偏误：Future Gacha解决"以后的好处不具体"问题

**待做**: 审查 product-overview.md 和 feature-spec.md，如有偏差则更新

### 🔍 全面回归测试 + Bug修复 + 线上自测 — ✅ 三轮已完成 (2026-06-11)

**用户请求**: "你去做全面的回归测试，然后修复发现的bug，同时要认真自测，别搞出什么新bug。不要节约token，竭尽全力帮我做好这个任务。你做完成后要自测，你在 https://we-me-mvp-git-dev-spark-huang-s-projects.vercel.app/ 用测试账号去自测，所有的bug都解决并自测通过后再发我核实。我没手动停止你的情况下，你都不要停止！"

**已完成**:
- ✅ 第一轮回归测试(2026-06-09)：55+ 用例全部通过 + 代码审查47问题
- ✅ BUG-229~240 全部修复（P0安全+P1功能+P2质量）
- ✅ V31~V35 Future Gacha bug修复（跳章/跳完成页/完成页不显示/结果页不显示/综合修复）
- ✅ 第二轮回归测试(2026-06-10)：线上验证通过
- ✅ 第三轮回归测试(2026-06-11)：代码审查+线上测试+BUG-242~250修复
- ✅ BUG-242~250 全部修复（P0安全+P1功能+P2视觉）
- ✅ Light Mode 对比度全面修复
- ✅ UI改名: Butterfly Effect → Future Gacha (投资人要求)
- ✅ Tab顺序调整: Buddy↔Chat互换 (投资人要求)
- ✅ Family Members 功能上线
- ✅ BUG-1~250 全部修复，dev HEAD: ad06e7e

**⚠️ 仍需关注**（后续会话可继续）:
- Future Gacha 登录模式完整流程端到端测试
- 日间模式UI全面测试
- P2 性能优化（React.memo / useMemo）
- Buddy State 乐观锁
- Serverless 内存去重

**关键约束**:
- 代码必须推到 `dev` 分支（不是 main！）
- 测试环境: https://we-me-mvp-git-dev-spark-huang-s-projects.vercel.app/
- 测试账号: huangcl25@mails.tsinghua.edu.cn / weme2026test
- **"不要节约token，竭尽全力帮我做好...没手动停止你的情况下，都不要停止！"**

### 📊 路演PPT v9 VC合伙人视角审查 — ✅ 已完成 (2026-06-07)

用户要求：以20亿美金基金合伙人视角，逐页审查8页PPT，让完全不懂阳明心学的投资人秒懂。
核心原则：哲学黑话→投资人语言、每个主张有因果链、三问必答（留存/壁垒/商业模式）、兑现"东方作弊码"、3秒理解原则。

v9核心变更：
1. ✅ 彻底干掉"东方作弊码"（封面/闭环页→"4层机制"）
2. ✅ Slide 3加"为什么是4层"逻辑（4条件缺1→失败+Mint/YNAB失败证据）
3. ✅ Slide 2加99%数据来源（Mint关停/YNAB留存<5%）
4. ✅ Slide 4反馈环显式化（行为→状态→情感→修正+行为心理学背书）
5. ✅ Slide 6加present bias学术支撑（时间贴现偏误）
6. ✅ Slide 5数据壁垒具体化（积累+个性化洞察）
7. ✅ Slide 7获得感替代爽（传统App=剥夺感，Symy=获得感）
8. ✅ Slide 8重构为4道留存防线（愿意留→知道为什么留→有理由持续留→想主动留）
9. ✅ 已推送到dev分支 (dff3e94)

已完成：
1. ✅ 文字修正："输了？更爽！" → "输了？也爽！"
2. ✅ **v8 VC视角优化** — 干掉哲学黑话+因果链+Duolingo类比+壁垒说明+兑现作弊码
3. ✅ 已推送到dev分支 (11e7de3)

交付文件：
- `doc/Symy_AI_路演文稿_v9.md` — v9文稿
- `doc/Symy_AI_路演PPT_v9.pptx` — v9 PPTX
- `doc/Symy_AI_路演PPT讲稿_v9.docx` — v9讲稿
- `download/symy_ppt/slide1-8.html` — v9 HTML幻灯片

**待执行**: 用户要求以顶级VC合伙人视角再次逐页审查，进一步优化

### 用户关键指示
- "要把投资人想象成外行" — 不假设任何背景知识
- 需要模拟投资人视角审视PPT
- 下次启动时需要用投资人角色来改PPT

## 历史已完成任务

### 🧹 014 代码精简 — ✅ 已完成 (2026-06-06)
两轮精简共减少 8312 行代码 + 41 个文件 + 40 个 npm 依赖

### 🛡️ Challenge V2 — ✅ 已完成 (2026-06-06)
弹窗+导航+横幅+自动发送+AI判断+MCP调用+补偿层

### 🦋 蝴蝶效应 — ✅ 全部完成 (2026-06-06)
Demo模式不调AI、V17进度持久化+流式生成、V12图片全修复

### 🎤 Vibeathon路演PPT v7 — ✅ 已完成 (2026-06-06)
8页PPT + 讲稿docx + 推送dev

## 关键约束

- Demo 模式不调 AI 生成图片，使用预设 CDN URL
- 登录模式使用 SSE 流式生成 + AI 生图
- **"没到Vercel dev环境自测通过的，都不算已经完成任务"** — 适用于产品功能，PPT不适用
- **"补偿稳定么？会不会比AI不调用更加不靠谱？"** — 假阳性比假阴性更糟糕
- `download/` 被 `.gitignore` 排除 → 需复制到 `doc/` 才能被git追踪
