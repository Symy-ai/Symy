# Symy 产品文档

> AI 诱导消费防御助手（反诱导消费 AI 共生养成应用）— 共生 AI 财务伴侣

> **v2 定位（2026-06-24）**：主体从"用户自己"（旧定位反冲动消费）转为"商家算法"（新定位反诱导消费）。技术标识符如 `impulse_score`、`impulse_events`、`ImpulseEvent`、`impulse-detector.ts` 等保留不动以避免 DB 迁移与代码 break，仅用户可见文案与营销叙事同步更新。

---

## 文档目录

<!-- 🔧 R1244: 目录表对齐现实 — product-overview/tech-architecture/ui-design 三文件不存在 (死链删除); 补齐现存核心文档 -->

| 文档 | 文件 | 说明 |
|------|------|------|
| **功能规格** | [feature-spec.md](./feature-spec.md) | 每个功能模块的详细需求、交互流程、验收标准 |
| **API 接口** | [api-reference.md](./api-reference.md) | 早期端点请求/响应规格 (⚠️ 仅覆盖 13/120 路由, 严重过时 — 处置决策待 owner, 见债务池 #33) |
| **错误决策表** | [error-policy.md](./error-policy.md) | 18 failure mode 的 fail-closed/fail-open 决策 (代码即守卫 no-warn-only-catch 的文档锚) |
| **产品铁律** | [PRODUCT-DOCTRINE.md](./PRODUCT-DOCTRINE.md) | 面子/里子、荣誉框架、执行标准三问 (owner 定案) |
| **AI 人格契约** | [AI_Prompt.md](./AI_Prompt.md) | AI 行为规范、语言锁、反伪造三禁 |
| **安全强制** | [SAFETY-ENFORCED.md](./SAFETY-ENFORCED.md) | 安全红线清单 |
| **Jev 决策门** | [Jev-引入方案-v2.md](./Jev-引入方案-v2.md) + 12 件 jev-*/green-annotation 文档 | Wave 0/1 战役五段链 (方案→侦察→计划→实施→结果) |
| **治理道体** | [symy-lab/](./symy-lab/) | 道经 (道体永不可改) + 总则 + 治理文档 |

---

## 快速概览

**项目名**: weareallme  
**版本**: 0.3.0  
**部署**: https://we-me-mvp-git-main-spark-huang-s-projects.vercel.app/  
**分支**: main（日常开发）/ release（生产）/ dev（已废弃）

### 技术栈

Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4 + shadcn/ui + Supabase + Letta AI + z-ai-web-dev-sdk

### 核心概念

**共生 AI 财务伴侣（Symy）**：AI 的生命值与用户的财务健康深度绑定。用户被诱导消费 → Symy 受损；理性消费 → Symy 茁壮成长。

### 页面结构

| 顺序 | Tab | 功能 |
|------|-----|------|
| 1 | **Chat** | 与 Symy AI 对话（主页面） |
| 2 | **Buddy** | Symy 状态页（形象 + 账本 + 梦想基金 + 徽章） |
| 3 | **Insights** | 消费洞察仪表盘 |
| 4 | **Profile** | 个人设置 + 邮箱连接 |
| — | **Monitor** | 邮件监控详情（从 Insights "View All" 打开） |
