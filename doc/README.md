# Symy 产品文档

> AI 诱导消费防御助手（反诱导消费 AI 共生养成应用）— 共生 AI 财务伴侣

> **v2 定位（2026-06-24）**：主体从"用户自己"（旧定位反冲动消费）转为"商家算法"（新定位反诱导消费）。技术标识符如 `impulse_score`、`impulse_events`、`ImpulseEvent`、`impulse-detector.ts` 等保留不动以避免 DB 迁移与代码 break，仅用户可见文案与营销叙事同步更新。

---

## 文档目录

| 文档 | 文件 | 说明 |
|------|------|------|
| **产品概述** | [product-overview.md](./product-overview.md) | 产品定位、目标用户、核心功能、共生系统设计、版本路线图 |
| **功能规格** | [feature-spec.md](./feature-spec.md) | 每个功能模块的详细需求、交互流程、验收标准 |
| **技术架构** | [tech-architecture.md](./tech-architecture.md) | 技术栈、系统架构、目录结构、数据库设计、设计决策 |
| **API 接口** | [api-reference.md](./api-reference.md) | 全部 API 路由的请求/响应规格 |
| **UI/UX 设计** | [ui-design.md](./ui-design.md) | 界面布局、交互规范、色彩系统、动效说明 |

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
