# b137: chat route.ts 短路块地图（coordinator 亲手侦察，bunny 三连败后代做）

> 2026-09-29 · night-main @ ebdfdd3 · 目标文件 `src/app/api/chat/route.ts`（1116 行）
> 方法：grep 注释锚点（route 内所有功能块都有 emoji+batch 编号头注释）+ 4 处 NextResponse.json return 定位

## 分段清单（23 个功能块）

| 行号 | 块 | 类型 | 说明 |
|---|---|---|---|
| 64-110 | 入口三查 | 校验 | zod validation → userId/clientIp → rateLimit（各自 return）|
| 112-176 | user/auth 上下文 | 预检 | supabase user 加载 + cookie 合并工具 |
| 178-192 | 🧺 batch25-b shopping-facts | fire-forget | waitToork 后台提取，零 await 进关键路径 |
| 195-252 | 🌱 batch68-a 采纳后回答轮 | **短路** | pending 上行 → canned 承认+收束 |
| 253-281 | 🌱 batch68-a 复盘追问轮 | **短路** | pending 追问（链序红线 source-order 锁定）|
| 282-320 | 🔧 P0-1 反思问题 | **短路** | canned reply 引导自答 |
| 321-346 | 🐘 batch48-b 反驳降温 | **短路** | afterGuardCard+反驳意图 → 冷静卡 |
| 347-370 | 🐘 batch65-a 重复购买预检 | **短路** | 决策卡 |
| 371-396 | 🐘 batch50-a 买前三问 | **短路** | 三问决策卡 |
| 397-422 | 🐘 batch53-a 绿色承诺 | **短路** | 承诺登记卡 |
| 423-449 | 🐘 batch56-a 对比裁决 | **短路** | A/B 裁决卡 |
| 450-477 | 🐘 batch57-a 清单分诊 | **短路** | 批量清单卡 |
| 478-520 | 🐘 batch59-c 追问跟随 | **短路** | 数据问答短追问重算 |
| 521-553 | 🐘 batch58-c 分类问句 | **短路** | 品类对账卡 |
| 554-585 | 🐘 batch58-c 时段问句 | **短路** | 冲动分桶卡 |
| 586-629 | 🐘 batch62-c 冲动预报 | **短路** | 7 天预报卡 |
| 630-666 | 🐘 batch68-c 小时脉搏 | **短路** | 28 天小时聚合卡 |
| 667-735 | 🐘 batch57-c 问账 | **短路** | 月度对账卡 |
| 736-764 | 🐘 batch60-c 情绪守护 | **短路** | 共情三选项卡 |
| 765-833 | 🐘 batch61-b 弱信号路由 | **短路** | 词表命中→语义路由到既有能力 |
| 834-858 | turn-context 装载 | 预检 | 已拆 parts/letta-turn-context.ts（batch26-c 先例）|
| 859-913 | per-user agent | 预检 | agentId 查询（不惰性创建）|
| 914-1116 | Letta 流式组装+错误处理 | 核心 | SSE 组装/降级链/mergeCookies |

## NextResponse.json 出口（4 处）

| 行 | 场景 |
|---|---|
| 725 | refund 503 |
| 911 | agentId null → 503（AI 初始化中）|
| 1093 | GET 兜底 401 |
| 1096 | 顶层 catch 503 |

## 拆解机会

1. **canned 短路链 15 块（195-833 行，~640 行）模式高度同构**：每块 = detector 调用 → if 命中 → mergeCookies(NextResponse.json({reply, xxxCard})) → return。可提取 `shortCircuitJson(reply, cardPayload)` helper（~每块省 2-3 行 × 15 = 40 行）+ 每块可下沉 `parts/canned/` 独立文件（batch26-c 先例已验证纯机械搬移安全）。
2. **下沉优先级**（按块独立性）：57-c 问账（聚合 lib 依赖清晰）> 58-c 双问句 > 62-c/68-c > 60-c/61-b（依赖上下文多，最后动）。
3. **风险**：链序由 source-order 测试锁定——下沉时**必须保持 route.ts 内调用顺序**（块本体进 parts/，route 留一行调用）。这是零行为变化的硬约束。
4. **不建议**：一次全拆。建议每批 2-3 块，每批全量绿再下一批（同 b138 批次纪律）。

## 验证基线

- 既有 source-order 测试（route 相关）是链序守卫
- 每批：tsc + eslint + vitest run src/app/api/chat
