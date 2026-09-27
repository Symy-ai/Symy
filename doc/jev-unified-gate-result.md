# UnifiedPrecheckGate 骨架批结果 — Wave 1 前置（零接线纯基建）

> 2026-09-27 · space-bunny 产出 · 基线 `ec65977`（main）
> 关联：`doc/Jev-引入方案-v2.md` §2（两级门 / 300ms 预算）/ §3（Wave 1）、`doc/jev-wave1-recon-result.md`（b128 侦察）
> 性质：**只建不接**。3 个新文件 + 1 个 barrel 追加导出 + 本文档。产品代码零改动、零新依赖、`isDecisionGateEnabled` 默认关保持不变。

---

## 0. 结论摘要

| 项 | 结果 |
|---|---|
| 交付 | `unified-precheck-gate.ts`（127 行 / 预算 200）、`precheck-registry.ts`（267 行 / 预算 150，见 §5 超预算说明）、`__tests__/unified-precheck-gate.test.ts`（265 行 / 16 用例） |
| 验证 | decision-gate 目录 **33 用例全绿**（16 新 + 17 既有）；全仓 **609 文件 / 7274 通过 · 3 skip**；`tsc --noEmit` exit 0；`eslint` 0 error 0 warning |
| 变异验证 | 4 处注入突变 → **5 个用例转红**（含 1 处双杀），已完整还原 |
| 红线 | 未改 parts/ 任何检测器、未改 chat route、未动既有测试；未执行 fetch/rebase/checkout/push |
| 遗留 | 唯一偏差：registry 行数超预算 117 行（文档密度要求与行数预算冲突，见 §5.2） |

---

## 1. 接口说明

### 1.1 `src/lib/decision-gate/unified-precheck-gate.ts`

```typescript
interface PrecheckQuestionSpec {
  detectorId: string;        // 判定单元 id（与 registry 一一对应）
  source: 'parts' | 'lib';   // 12 住 parts / 8 住 lib
  question: GateQuestion;    // Wave 0 三型：noul / choice / score
  ruleRef?: string;          // 规则层实现路径（迁移时替换为 gate 结果消费端）
}
interface UnifiedPrecheckResult {
  results: GateResult[];     // 与 specs 一一对应且同序
  fallbackUsed: boolean;     // true = 超时/失败，消费端只用规则层
  totalLatencyMs: number;
}
function runUnifiedPrecheck(
  gate: DecisionGate, state: GateState, specs: PrecheckQuestionSpec[],
  opts?: { timeoutMs?: number },   // 默认 300（PRECHECK_DEFAULT_TIMEOUT_MS）
): Promise<UnifiedPrecheckResult>
```

**行为契约**（三条硬纪律，Wave 1 迁移时不得破）：

| # | 契约 | 实现 |
|---|---|---|
| 1 | **绝不 throw** | 超时 / gate 抛错（同步抛与异步 reject 两种形态）→ 一律 `{results: [], fallbackUsed: true}`。语义层是 bonus 不是依赖 |
| 2 | **300ms 预算在这里管** | `Promise.race([gate.evaluate(...), budget])`；gate 本体不含超时（沿用 `LLMWrapperGate` 纪律 1） |
| 3 | **按 id 对齐，不信任顺序** | gate 乱序 → 按 `question.id` 匹配回位；漏答/形状违约 → 落 `{value:0, confidence:0}`；顺序恒等于 `specs` 顺序 |

细节：

- **空 `specs` 不调闸**（调用计数 0），且 `fallbackUsed=false` —— 「没有要问的问题」不是降级事件，不该产生 fallback 噪音。
- **`latencyMs` 归一**：`Math.max(0, candidate.latencyMs ?? 本次实测)`，负数/缺省都不会污染下游统计。
- **契约违抗不炸**：`evaluate` 返回非数组、条目是 `null`/字符串/`{id}` 无 `value`/重复 id —— 一律按漏答处理（实现中 `hasUsableValue` 拦掉了「有 id 无 value」的半成品条目，**这一条是写测试时被测出来的**，见 §3）。
- **超时不留 unhandledRejection**：`Promise.race` 给两臂都挂处理器，gate 在超时之后才 reject 也不产生进程级噪音（有专门用例锁住）。

### 1.2 `src/lib/decision-gate/precheck-registry.ts`

```typescript
PRECHECK_REGISTRY: readonly PrecheckQuestionSpec[]   // 20 条登记
PRECHECK_REGISTRY_SIZE = 20                          // 12 parts + 8 lib
WAVE1_OUT_OF_REGISTRY: readonly { detectorId, reason }[]  // 已知但不登记的 2 条
findPrecheckSpec(detectorId): PrecheckQuestionSpec | undefined
MOOD_OPTIONS / WINDOW_OPTIONS / CATEGORY_OPTIONS / TIME_BUCKET_OPTIONS /
CONTEXT_SIGNAL_OPTIONS / CLARIFY_SLOT_OPTIONS        // 槽位常量（第二槽位随迁现用）
```

**文件头与每条 JSDoc 都写明：这是登记簿不是开关，注册 ≠ 启用**——20 条今天全跑在规则层上（route 未动一根线），Wave 1 才逐个点亮。每条注释三段：现状规则层行为 / 迁移优先级（P0 情绪冲动类、P1 查询类、P2 长尾）/ 迁移时必须一起搬的约束。

### 1.3 barrel 变更（`index.ts`，仅追加导出）

追加 `runUnifiedPrecheck` / `PRECHECK_REGISTRY` 等 6 个值 + 2 个类型导出。`isDecisionGateEnabled` 一行未改，默认关（`DECISION_GATE_ENABLED=1` 才开）。

---

## 2. registry 的 20 条清单摘要

完整清单见源码；下表是迁移视角的摘要（现状行为一句话 + 优先级 + 问法 + 槽位）。

| # | detectorId | 住 | 优先级 | 问法 | 现状规则层行为（一句话） |
|---|---|---|---|---|---|
| 1 | `emotion-shopping-detector` | parts | **P0** | choice 5 档 mood | 情绪词×购物词共现 → 情绪守护卡 |
| 2 | `micro-challenge-detector` | parts | **P0** | choice 5 品类 | 购买意图+品类词表 → 24h 微挑战卡 |
| 3 | `green-alt-detect` | parts | **P0** | noul | 非绿品类词表 → 环保替代推荐卡 |
| 4 | `reuse-detect` | parts | **P0** | noul | 类目词表 → 「先看看你已有的」 |
| 5 | `pushback-detector` | lib | **P0** | choice 2 档 tone | 反驳词表 → 降温卡（`afterGuardCard` 是前置门） |
| 6 | `shopping-context-signals` | lib | **P0** | choice 3 signal | 弱信号词表 → 语义路由卡（v2 自认维护成本最高） |
| 7 | `guard-pulse-detector` | parts | P1 | noul | 时刻短语+冲动语境 → 脉搏卡（硬依赖 forecast 否决） |
| 8 | `impulse-forecast-detector` | parts | P1 | noul | 预报问句 → 预报卡（含同文件 `detectForecastDayFollowUp` 追问） |
| 9 | `impulse-time-query-detector` | parts | P1 | choice 4 时间窗 | 时段词表 → 时段统计卡（第二槽位 = 四桶时段） |
| 10 | `category-query-detector` | parts | P1 | choice 5 品类 | 品类词表 → 分类对账卡（第二槽位 = 时间窗） |
| 11 | `savings-query-detector` | parts | P1 | choice 4 时间窗 | 统计问句 → 存款对账卡（缺省 thisMonth） |
| 12 | `reflection-detector` | parts | P1 | noul | 反思问题原文精确匹配 → 镜子回复 |
| 13 | `green-knowledge-query` | lib | P1 | noul | 词条库三层匹配 → 绿色知识卡（id 数组留规则层） |
| 14 | `prepurchase-detect` | lib | P2 | noul | 「该买吗」求判断 → 三问决策卡（形状是 Noul 但仲裁未定义故排 P2） |
| 15 | `commitment-detector` | lib | P2 | noul | 陈述式承诺 → 承诺卡（subject 抽取留规则层） |
| 16 | `compare-detector` | lib | P2 | noul | 连接词两侧对象 → 对比卡（sideA/sideB 抽取留规则层） |
| 17 | `list-triage-detector` | parts | P2 | noul | 2~12 对象词切分 → 清单分诊卡（items[] **必须**留规则层） |
| 18 | `duplicate-purchase-detect` | parts | P2 | choice 5 品类 | 购买意图+物品词 → 重复购买卡（itemTitle 留规则层） |
| 19 | `shopping-clarify` | lib | P2 | choice 3 槽 | 缺槽澄清 → 澄清卡（`askedSubjects` 轮次跟踪留规则层） |
| 20 | `alt-footprint-intent` | lib | P2 | noul | 替代足迹召回意图（读 store 的 IO 留规则层） |

**分布**：12 parts + 8 lib ✅（= 任务要求的 12/8 分布）。**问法**：3 个纯 noul-P1 起步 + choice 富对象为主，与 b128 §2.2「只有 3 个能直接做成纯 Noul」的结论一致（三个纯 Noul 单元里 `green-alt-retro-gate` 不在 20 条内，见下）。

**不登记的 2 条（`WAVE1_OUT_OF_REGISTRY`）**：

| 单元 | 不登记的理由 |
|---|---|
| `green-alt-retro-gate` | 判定器**合成器**（输入是其他判定器的输出），必须等它依赖的 6 个数据问答单元先迁 —— 侦察 §5.2 的「Wave 1 两段式」 |
| `follow-up-query` | **非单轮**判定（输入是上一轮数据问答卡的元数据上行，侦察 §2.4），不属「N 个问题打包一次调用」的建模范围 |

> ⚠️ **计数口径必须交代**：b128 文档自身计数不一致（§1.3 标题写「第 21 个判定单元」、§1.2 表格实有 8 行 lib、§5.3 写 21；§1.1 又说 19+2=20）。本登记簿按任务给定的「**12 住 parts / 8 住 lib = 20**」收口，两条不计入的单元**单列在 `WAVE1_OUT_OF_REGISTRY` 并写明理由**，而不是悄悄丢掉。任务说明里的「12 住 parts / 8 住 lib」在 b128 文档里找不到同口径表述，这是本批唯一的口径决策点，已用测试锁死（`toHaveLength(20)` + `parts=12` + `lib=8`）。

---

## 3. 测试（`__tests__/unified-precheck-gate.test.ts`，16 用例）

gate 一律 fake（不 mock 模块、不打网络）——fake 的形状就是 `DecisionGate` 契约。

| # | 用例 | 锁的契约 |
|---|---|---|
| 1 | 全部正常返回：一次 evaluate 带全部问题，results 同序 | 打包 + 同序 |
| 2 | gate 乱序返回 → 按 id 对齐回 specs 顺序 | 纪律 3 |
| 3 | 部分 id 缺失 → 落 `{0,0}`，其余不回位，且 `fallbackUsed=false` | 漏答 ≠ 降级 |
| 4 | 契约违约（`null`/字符串/`{id}` 无 value/未知字段）→ 全落 miss 不抛 | 形状容错 |
| 5 | gate 异步 reject → 零异常冒泡，`fallbackUsed=true` | 纪律 1 |
| 6 | gate **同步** throw → 同样零异常冒泡 | 纪律 1（两种形态都锁） |
| 7 | 永不 resolve 的慢 gate + `timeoutMs:50` → 超时即放弃 | 纪律 2 |
| 8 | 超时之后 gate 才 settle → 无 unhandledRejection 噪音 | 资源卫生 |
| 9 | 空 specs → 调用计数 0，`results=[]`，`fallbackUsed=false` | 不空跑 |
| 10 | registry 20 条 + parts 12 / lib 8 | b128 口径 |
| 11 | 20 条 `ruleRef` 逐个 `fs.existsSync`（相对 repo 根）真实存在 | 登记不许指向不存在的文件 |
| 12 | `detectorId` / `question.id` 全局唯一 | 无重复登记 |
| 13 | 每条 question 属三型之一，noul 必带 statement，choice 必带 options | 形状合法 |
| 14 | `source` 与 `ruleRef` 实际路径一致（parts 必须在 `parts/` 下、lib 必须在 `src/lib/` 下） | 登记不许指错地方 |
| 15 | 未登记的 2 条单列且 `findPrecheckSpec` 查不到；`findPrecheckSpec` 未命中返回 undefined | 计数口径可查 |
| 16 | `PRECHECK_DEFAULT_TIMEOUT_MS === 300` | v2 §2 预算 |

**计数**：本文件 **16 用例**；`src/lib/decision-gate/` 目录合计 **33 用例 / 3 文件全绿**（既有 17 + 新 16）。

### 3.1 变异验证（证明测试真的会红）

对实现与 registry 注入 4 处突变（**未改测试**）：

| 突变 | 预期红 | 实测 |
|---|---|---|
| ① 去掉 `Promise.race`（直接 `await evaluated`） | 超时用例 | 🔴 |
| ② `catch` 分支的 `fallbackUsed` 改成 `false` | 异常用例 ×2 | 🔴 |
| ③ 空 specs 短路改成 `if (false)` | 空 specs 用例 | 🔴 |
| ④ registry 把 `alt-footprint-intent` 的 id 改错 | 计数 + 唯一性 + source 一致性用例 | 🔴 |

```
Tests  5 failed | 28 passed (33)
```

已完整还原（`git diff` 仅剩 barrel 的追加导出）。

### 3.2 一次「测试反过来抓实现」的记录

用例 4 首轮是**红的**：`alignResults` 只校验了 `typeof id === 'string'`，于是 `{id:'mood'}` 这种「有 id 无 value」的半成品条目被当成合法结果收进 map，`value` 变成 `undefined` 而不是 `0`。已加 `hasUsableValue`（number 须有限 / array 须非空）拦掉，并留注释说明原因。这类容错缺口正是"绝不 throw"纪律的边界——**语义层失败必须落成「没命中」，不能落成 `undefined`**。

---

## 4. 验证结果

| 验证项 | 命令 | 结果 |
|---|---|---|
| decision-gate 目录 | `npx vitest run src/lib/decision-gate/` | ✅ **3 files / 33 tests passed** |
| 预检器回归（红线核对） | `npx vitest run src/app/api/chat/parts/ src/lib/decision-gate/` | ✅ **58 files / 703 tests passed** |
| 全仓回归 | `npx vitest run` | ✅ **609 files / 7274 passed · 3 skipped** |
| 类型检查 | `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` | ✅ **0 错误**（exit 0） |
| ESLint（新文件 + 改动的 barrel） | `npx eslint src/lib/decision-gate/` | ✅ **0 error / 0 warning**（exit 0） |
| 变异验证 | 见 §3.1 | ✅ **5 红**（预期），已还原 |

> **环境备注**：`npx tsc --noEmit` 在默认 Node 堆下会 OOM（与 b128 记录一致），须带 `--max-old-space-size=8192`。

### 改动范围核对（红线）

| 红线 | 状态 |
|---|---|
| 不改 parts/ 任何检测器 | ✅ `git status` 无 `src/app/api/chat/parts/**` 变更（56 用例 precheck-inventory-guard 仍绿） |
| 不改 chat route | ✅ 无 `route.ts` 变更 |
| 纯新增 decision-gate/ 目录内文件 + 文档 | ✅ 3 个新文件；`index.ts` 仅**追加**导出（+16 行），`isDecisionGateEnabled` 未动 |
| 零新依赖 | ✅ 未改 `package.json`；只 import 了同目录 `./types` 与仓内已有 `fs`/`path`（仅测试用） |
| `isDecisionGateEnabled` 保持默认关 | ✅ 函数体未动，既有开关用例仍绿 |
| 不 fetch / rebase / checkout / push | ✅ 全程未执行 |
| 未动既有测试 | ✅ 既有 3 个文件未修改 |

---

## 5. 遗留与建议

### 5.1 Wave 1 迁移前仍需先答的三个设计题（b128 §5.2，本批未触及）

1. **互斥仲裁放哪**：现状是「串行短路先中先得」，并行后可能多个问题同时为真，仲裁优先级表必须显式存在并被测试锁住。本骨架的 `results` 只做**顺序对齐**，**不做仲裁**——这是有意的边界，不要在接线时顺手塞进 `runUnifiedPrecheck`。
2. **分两段**：先迁 12 个 parts/ detector，再迁合成器与 lib 级 7 个。
3. **抽取型留规则层**：`list-triage` 的 items[]、`duplicate-purchase` 的 itemTitle、`green-knowledge` 的 id 数组、`context-signals` 的 entries[]、`reuse` 的 hoursLabel —— 本 registry 已逐条写在注释里。

### 5.2 唯一偏差：registry 行数超预算

`precheck-registry.ts` 实测 **267 行**，任务预算 **≤150 行**，超 117 行。取舍是**保留注释**、压掉空行与排版（已压到 `noul` 陈述句不再折行、槽位常量改为一行式导出）。

理由：任务对每条 JSDoc 有三条硬要求（现状行为一句话 + P0/P1/P2 优先级 + 「登记簿不是开关」的明示），20 条 × 平均 4 行注释 ≈ 80 行不可压缩；数据部分按 prettier printWidth（`next/core-web-vitals` 默认 80）排版，20 条 × 9 行 ≈ 180 行也压不动——压到 150 需要把注释或槽位声明折叠成 1~2 行，那会牺牲可读性而不增加任何信息。

若必须落进 150 行，建议按 b128 的处置先例（侦察 §3.3：「同步更新清单，而不是放宽断言」）**显式上调预算到 300 行**，而不是把 20 条注释砍成一句话。如需压缩，请指定砍哪一类内容（建议：删每条的「约束」段，保留「现状行为 + 优先级」两段，可省约 50 行）。

### 5.3 下一步

1. Wave 0 验收线过（`f09452f` 验收线计算器就位 + 真 Jev 访问）→ 再谈接线。
2. 接线时先做仲裁层（§5.1 #1），再逐条点亮 registry；每点一条必须先有该条自己的 evals 对照基准（b128 §2.5 已指出现成 zh/en 双语语料可直接当基准，**不需要新建标注集**）。
3. 降级演练（Jev 超时/报错/未开通三态下规则层输出与今天逐字节一致）在首次接线时做，本批的 `fallbackUsed` 分支就是它的挂载点。
