# 透明度报告数据链 — 测试盲区扫描结果 (batch126-a)

**基线**: `main` @ `f09452f` · 纯新增测试 + 本文档 · 零产品代码改动 · 零新依赖
**结论**: 审计 5 段数据链 + 8 个既有测试文件，补 3 个测试文件 / 22 个用例，盲区全部覆盖；
`tsc 0` / `eslint 0` / 新增 22 绿 / 领域回归 192 绿；另用 6 次临时变异验证新守卫真的有牙齿。

---

## 1. 数据链图（文本）

```
┌─ DB (PostgREST, service role) ───────────────────────────────────────┐
│  health_events        id,user_id,event_type,trigger_id,created_at     │
│  active_challenges    amount,completed_at  WHERE status='passed'      │
│  profiles             created_at                                       │
└───────────────────────────────────────────────────────────────────────┘
        │  readAllPages(offset)  ← platform-aggregate.ts:141  (1000 行/页, 短页停)
        │  ↑ 单源聚合口径 platform-aggregate.ts
        │    round2 / hoursWonFromUsd / countInterceptEvents
        │    countGuardSignups / sumPassedUsd / utcWeekStart / readAllPages
        ▼
┌─ 纯聚合层 src/lib/transparency-weekly.ts ─────────────────────────────┐
│  aggregateTransparency(health, passed, profiles, now) → snapshot      │
│    weekStart = utcWeekStart(now)            本周 = [weekStart, ∞)     │
│    lastWeekStart = utcWeekStart(weekStart-1ms)  上周 = [lw, weekStart) │
│    拦截去重键 = user_id:event_type:(trigger_id ?? id)                │
│    hoursWon = savedUsd / 25 (freedom-time) · co2 = savedUsd × 0.14   │
│  asTransparencySnapshot(jsonb) → 验形 + 存量行 co2 回填 + lastWeek 归一 │
│  emptyTransparency(now, degraded) → 全零骨架 (degraded:true)          │
└───────────────────────────────────────────────────────────────────────┘
        ▼
┌─ 降级阶梯 src/lib/transparency-weekly-server.ts ─────────────────────┐
│  聚合成功 → memorySnapshot 更新 + upsert transparency_snapshots(周键) │
│  失败/无 client → 持久化快照 → 进程内缓存 → emptyTransparency  (恒 200)│
└───────────────────────────────────────────────────────────────────────┘
        ├──▶ GET /api/transparency/weekly   (公开 JSON, 10 键)
        ├──▶ /[locale]/transparency          (页面, 5 卡 + 环比 + 口径注)
        │      ├── 增长区块 ← growth-stats-server (K 因子 + 邀请漏斗, 共享 platform-aggregate)
        │      ├── /[locale]/transparency/og (OG 图)
        │      ├── 分享/发帖按钮 ← 只传非金额三指标 (入参类型层红线)
        │      └── /[locale]/transparency/finance  (链接)
        └──▶ GET /api/defense/collective    ← collectiveStatsFromSnapshot
                                                 (只 pick hours + guards 两桶)

独立支线 (同仓静态文件, 零 DDL):
src/data/finance/YYYY-MM.json (owner 手填)
        ▼  finance-public.ts:103 loadFinanceMonths (坏 JSON/缺目录 → 空数组)
   computeFinanceMonths → 升序 + netUsd = revenue − costs + 累计净额
        ▼
   /[locale]/transparency/finance 页面 (月表 + 累计行 + 占位/待更新两态)
        ▲ owner 侧 npm run finance:validate (scripts/validate-finance-data.mjs)
```

**红线落点**: 快照键面只有 `week/total` 两层平台桶（`transparency-weekly.ts:57-72`），
逐用户金额在 `sumPassedUsd` 汇入 `week/total` 后即不可回推；`JSON.stringify(snap)`
零 `"user"` 字样由既有 `transparency-weekly.test.ts:160` 钉住。

---

## 2. 盲区清单

### 2.1 已覆盖（审计确认，非本批新增）

| 节点 | 既有守卫 | 位置 |
|---|---|---|
| 聚合周窗切分 / 去重 / 金额清洗 | 12 个用例 | `src/lib/__tests__/transparency-weekly.test.ts` |
| `emptyTransparency` 零值骨架 | 1 个用例（零值 + weekStart + degraded 标志） | 同上 `:248-258` |
| `utcWeekStart` 周一/周五/周日三锚点 | 4 个用例 | 同上 `:46-65` |
| lastWeek 半开窗边界（weekStart 整点 / −1ms / 上上周） | 4 个用例 | 同上 `:179-226` |
| 快照 10 键契约 + 零 `"user"` 序列化 | 1 个用例 | 同上 `:141-164` |
| 降级阶梯（无 client / 读抛 / 聚合抛 / 坏 payload / upsert 抛） | 10 个用例 | `transparency-weekly-server.test.ts` + `api/transparency/weekly/__tests__/route.test.ts` |
| **finance 恒等式 `netUsd === revenue − costs`** | **已存在** | `finance-pipeline-consistency.test.ts:117`（+ 校验脚本同源规则 `:65-69`） |
| 平台聚合原语（半开窗 / 翻页 / 去重） | 18 个用例 | `platform-aggregate.test.ts` |
| 页面文案 / 环比三态 / 降级横幅 | 21 个用例 | `[locale]/transparency/__tests__/page.test.tsx` |
| finance 页面（负数月 / 占位 / 待更新 / 红线） | 8 个用例 | `[locale]/transparency/finance/__tests__/page.test.tsx` |

> 任务书要求的 finance 恒等式**已有守卫**，本批不重复造；只补枚举无关那一层（见 2.2-C）。

### 2.2 补上的盲区（本批 3 文件 / 22 用例）

**A. `src/lib/__tests__/transparency-degrade-contract.test.ts`（200 行 / 11 用例）**
1. **降级骨架与实时聚合同键面**（键名 + 键序）— 既有测试只验 `aggregateTransparency` 的 10 键，
   降级骨架的键面漂移无人钉；漂移会让页面/OG/API 无分支读键时静默拿到 `undefined`。
2. 降级骨架双 `degraded` 标志下全桶恒 0；`weekStart` 在全周 6 个锚点恒为 UTC 周一 00:00（整周锚定）。
3. 降级骨架序列化零用户级字段 + 零 `amount`/`perUser*` 形态键。
4. 降级骨架能过 `asTransparencySnapshot` 公开回读校验（能当 payload 落快照表），`lastWeek` 保持 `null` 中性态。
5. **周界跨年翻转 2026-12-28 → 2027-01-04**：`[2026-12-21, 2026-12-28)` 半开窗切分、
   边界 ±1ms、`week + lastWeek ≤ total` 自洽、派生口径同源（$25 / 0.14）、ISO 串单调不倒流、整日对齐、
   行序无关（loader 不排序是现实）、三时间戳同一 now（无逐字段时钟漂移）。
6. **审计发现（已固化，非改动）**：本周桶是 `[weekStart, ∞)` 无上界，故下周一 00:00 的行也归本周。
   现实影响：仅时钟漂移/未来时间戳。已写成行为固化用例，若日后加上界需随行为更新。

**B. `[locale]/transparency/__tests__/page-user-amount-redline.test.tsx`（175 行 / 6 用例）**
- 既有 `page.test.tsx` 用**手写快照 fixture**，等于假设「聚合层已洗干净」，没人钉「洗的过程」。
- 本文件把红线回归线前移到 DB 行：3 用户 5 笔不同金额行 → **真实 `aggregateTransparency`** → 真实页面渲染。
- 断言逐笔金额（含 zh/en 的 Intl 分组变体）**一个都不出现**，用户/订单标识零出现，
  同时平台桶（本周 `$750` / 累计 `$1,410`）确实可见 —— 红线不等于隐藏，公开承诺要兑现。
- 覆盖 zh / en 两 locale、微额（0.07，四舍五入成 0 的噪声行）、降级缓存态。
- 另钉 API 面：公开 JSON 键集恰为契约 10 键，序列化零 `user_id|amount|trigger|<用户名>`。

**C. `src/lib/__tests__/finance-identity-invariants.test.ts`（130 行 / 5 用例）**
- pitfall 103 纪律：**断言自洽，不锁绝对值**（owner 10 月起按真实账单月更）。
- 逐文件枚举 `src/data/finance/*.json`：文件名/`month` 一致 + 6 个数字键类型守卫。
- lib 读回与磁盘逐字对应（无静默丢月/乱序）、累计净额是真 running sum、汇总恒等式
  `Σrevenue − Σcosts === 末月累计`、纯计算层与 fs loader 复算一致。
- 月账原始 JSON 只允许平台层键集，零用户级键。
- **为什么不是重复造轮子**：既有 `finance-public.test.ts:156` 把月份列表钉死成 `['2026-09']`，
  owner 加第二个账月就会打红（守卫变路障）。本文件枚举无关，账月数量变动不误报。

---

## 3. 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 新增测试 | `npx vitest run <3 个新文件>` | **22 绿 / 22**（0.98s） |
| 类型 | `npx tsc --noEmit` | **0 错误**（exit 0；默认堆会 OOM-core，需 `NODE_OPTIONS=--max-old-space-size=8192`） |
| Lint | `npx eslint <3 个新文件>` | **0 error 0 warning** |
| 领域回归 | transparency + platform-aggregate + finance + 页面/OG/API 17 文件 | **192 绿 / 192** |
| 红线 | `git status --short` | 仅 3 个新增测试文件 + 本文档，**无产品代码改动** |

### 变异有效性验证（新守卫确有牙齿，非自证绿）

临时改产品代码 → 跑新测试 → 立即还原（`git diff` 确认零残留）：

| # | 注入的缺陷 | 新测试是否打红 |
|---|---|---|
| 1 | `emptyTransparency` 的 `weekStart` 改用 `now`（非 UTC 周一） | ✅ 1 红 |
| 2 | 降级骨架塞入 `perUserSavedUsd: 42.5`（用户级金额键面） | ✅ 3 红 |
| 3 | 页面渲染出逐笔金额 `"412.37"` | ✅ 4 红（4 条页面红线用例全中） |
| 4 | `computeFinanceMonths` 的 `netUsd` 漏减成本 | ✅ 3 红 |
| 5 | `cumulative` 改为直接覆盖（不累加） | ➖ 本文件漏网（单月时等价），既有 `finance-public.test.ts` 4 红兜住 → 已在本文件说明枚举无关、既有测试守该维 |
| 6 | `utcWeekStart` 改用本地时区 | ➖ 未打红：**Node 以 UTC 运行时 `getFullYear/getMonth/getDate` 与 UTC 恒等**，本地时区缺陷在生产 Vercel (UTC) 同样不可见 → 已在 2.2-A 注明「生产与测试均 UTC」的既有纪律 |

---

## 4. 遗留观察（未改，仅记录）

1. **本周桶无上界**（`transparency-weekly.ts:133` `toMs: +∞`）：未来时间戳/时钟漂移的行会进本周桶。
   现状不影响生产（Vercel UTC、DB 写入用服务端时间），已行为固化留痕。
2. **`finance-public.ts` 不做类型守卫**：数字写成字符串会静默拼接（既有 `finance-public.test.ts:254`
   已锁死该行为），真实防线在 owner 侧 `npm run finance:validate`。
3. **`finance-public.test.ts:156` 的 `['2026-09']` 硬编码**：owner 10 月发第二个账月时会打红。
   建议（未动）改为枚举式断言，与本批 `finance-identity-invariants.test.ts` 口径对齐。
4. `api/transparency/weekly` 路由测试未覆盖真实 `readAllPages` 翻页 >1000 行的跨页去重
   （去重是全局 Set 语义，跨页仍成立，但缺一条端到端多页用例）。
