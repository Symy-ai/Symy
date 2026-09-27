# 场景 D 绿色标注集生成结果（Wave 0 行动清单 #3 前置）

> 执行：2026-09-27 · 基线 `b0db6a6` · 结论 **✅ 通过**（有 2 项已修缺陷 + 1 项遗留缺陷待下一轮）
> 数据文件 `doc/green-annotation-seed.json` · 生成器 `scripts/gen-green-annotation-seed.ts` · 标注流程 `doc/green-annotation-workflow.md`

---

## 1. 条数统计

| 指标 | 目标 | 实际 | 状态 |
|---|---|---|---|
| 总条数 | ≥ 220（任务书） | **220** | ✅ |
| 总条数 | ≥ 200（Wave 0 验收线） | **220** | ✅ |
| zh 配额 | ≥ 100 | **110** | ✅ |
| en 配额 | ≥ 100 | **110** | ✅ |
| 唯一标题 | = 总条数 | **220 / 220** | ✅ 无重复 |
| id 连号 | ann-0001 起 | 220 条连号 | ✅ |
| `humanLabel` 已填 | **0**（红线：不虚构） | **0**（JSON 里连键都没有） | ✅ |

生成器按 `100 × GREEN_ANNOTATION_SEED_OVERSHOOT(1.1) = 110/侧` 铺量，留 10% 缓冲给下一轮真实搜索样本替换。

---

## 2. 来源分布

| 来源 | 条数 | 占比 |
|---|---|---|
| 真实夹具 `seed-fixture` | 56 | 25.5% |
| 词表合成 `synthetic-from-lexicon` | 164 | 74.5% |

分语言：zh 真实 19 / 合成 91 · en 真实 37 / 合成 73

**夹具抽取出处明细**（`notes` 字段可回溯）：

| 条数 | 出处 |
|---|---|
| 15 | `src/lib/__tests__/green-level.test.ts` |
| 10 | `src/lib/demo-data.ts#DEMO_GREEN_ITEMS` |
| 8 | `src/lib/__tests__/green-rules.test.ts` |
| 8 | `src/lib/demo-data.ts#DEMO_IMPULSE_ITEMS` |
| 7 | `src/lib/__tests__/green-label-traceability-guard.test.ts` |
| 5 | `src/lib/__tests__/green-uncertified-tone-guard.test.ts` |
| 3 | `src/lib/__tests__/green-first-rank.test.ts` |

> 抽取方式：正则扫测试源码里的卡字面量（`{ title: '…', category: '…' }`）+
> `for (const title of [ … ])` 成组断言 + `demo-data.ts` 的 green/impulse 真实条目。
> `green-first-rank.test.ts` 的 3 条**带 `queryContext`**（`'环保材质水杯'`），
> 意图加成参与 `ruleLabel` 计算（`Reusable stainless cup` 55 分 → 65 分跨过徽章线，medium → high）——符合管道真实行为。

---

## 3. 词表命中的三档分布（`ruleLabel`，冻结基准）

| 档位 | 总量 | 占比 | zh | en |
|---|---|---|---|---|
| `high` | 142 | 64.5% | 74 | 68 |
| `medium` | 6 | 2.7% | 3 | 3 |
| `low` | **0** | 0% | 0 | 0 |
| `unknown` | 72 | 32.7% | 33 | 39 |

按来源交叉：

| 档位 | 真实夹具 | 词表合成 |
|---|---|---|
| `high` | 28 | 114 |
| `medium` | 6 | 0 |
| `unknown` | 25 | 46 |

**`low` 恒为 0 是设计使然，不是 bug**：`green-level.ts` 只有 high/medium/unknown 三档，
`low` 是语义层（DecisionGate `SCORE` 量表）专用档。生成器显式把三档管线映射成四档
（`level === 'low' ? 'unknown' : level`），**基准里不会出现管线产不出的档位**。
标注员仍可对合成/弱证据标题打 `low` —— 那正是语义层相对词表增量的信号来源。

`medium` 仅 6 条且**全部来自真实夹具**（`耐用雨伞`、`替换装洗手液`、`便携水杯`、
`Durable steel water bottle`、`Refillable ink pen`、`Refillable Shampoo & Body Wash Set`）——
`durable` / `reusable` 单 flag 命中 55 分，压在徽章线 60 之下。

---

## 4. 验证记录

| 检查 | 命令 | 结果 |
|---|---|---|
| 脚本运行 | `npx tsx scripts/gen-green-annotation-seed.ts` | ✅ 退出 0，条数/locale/来源/三档全部打印 |
| 类型检查 | `NODE_OPTIONS='--max-old-space-size=4096' npx tsc --noEmit` | ✅ **0 错** |
| Lint | `npx eslint src/lib/decision-gate/annotation-schema.ts scripts/gen-green-annotation-seed.ts` | ✅ **0 告警 0 错** |
| 架构守卫 | `npx vitest run src/lib/__tests__/architecture-guards.test.ts` | ✅ 137 passed（新增 `src/lib/decision-gate/` 未触发循环依赖/文件数守卫） |
| 相关回归 | `npx vitest run src/lib/decision-gate src/lib/__tests__/green-` | ✅ **41 files / 895 tests passed** |
| 幂等性 | 连跑 3 次 | ✅ 输出逐字节一致 |
| 数据完整性 | 自检脚本 | ✅ 220 唯一标题 / id 连号 / locale 与标题文种一致 / 零 `humanLabel` 键 |

**环境说明**：`tsx` **不在 package.json 的 devDeps 里**（任务书假设有误）。
实测它是 `payload` 的传递依赖，`node_modules/.bin/tsx` v4.22.4 存在，`npx tsx` 直接可用
→ **未新增任何 npm 依赖**，也无需降级成 `.mjs`。
⚠️ 隐患：该二进制是传递依赖，`npm dedupe`/payload 升版可能移除它。若某天 `npx tsx` 报
`could not determine executable`，改用 `node --experimental-strip-types`（Node 22.22 已验证可用）
或把脚本转 `.mjs`，两种都不需要新增依赖。

---

## 5. 执行过程中修掉的缺陷

| # | 缺陷 | 表现 | 修法 |
|---|---|---|---|
| 1 | zh 侧少 2 条 | 非绿合成模板轮转有硬上限（8 模板 × 3 轮 = 24 条封顶），zh 补不满配额，总数卡在 218 | 改成 `for (i = 0; out.length < need; i++)` 无限轮转直到补满，稳定落在 110/110 |
| 2 | 中文后缀漏进 en 标题 | en 合成标题出现 `Wireless earbuds charging case 2件装` | 后缀按 locale 取：`件装` / ` pack` |
| 3 | 标题重复 | 同一标题跨测试文件重复出现（`竹制牙刷（软毛）` 等 5 组），给标注员白送重复题、虚增样本量 | 夹具抽取与合成补量**都改为按纯标题去重**（`title\|category` 键对不上：合成侧总带 category，夹具侧常无） |

---

## 6. 遗留缺陷（下一轮必须处理）

### 6.1 合成样本占 74.5% —— 本轮最大弱点

真实可得的 `symy_search` 结果样本只有 56 条，离 200 差得远，主体靠词表拼装。
**后果：本轮标注结果只能作方向性参考，不能直接当 Wave 0 的一致率验收数**——
它验证的是「词表覆盖够不够」，验证不了「语义层能不能看懂真实商品标题」。

下一轮动作：抽真实搜索结果（`source: 'manual'`）替换最弱的合成条目，
优先替换 `synthetic` + `unknown` 的组合（那是最不像真实搜索结果的一批）。

### 6.2 `ruleLabel` 随词表漂移

`ruleLabel` 由 `green-rules.ts` 词表现算，词表一改基准就变。
标注冻结后若要调词表，**先复制基线 JSON 再改**，不要原地覆盖（已写进工作流 §6 红线）。

### 6.3 对比脚本未写

行动清单 #3 的下一格（Jev/wrapper vs 人工标注的混淆矩阵）尚未开工。
`LLMWrapperGate` 的 `SCORE` 量表档位顺序已是 `unknown → low → medium → high`
（`src/lib/decision-gate/__tests__/gate-fixtures.ts`），与标注集档位顺序一致，**无需额外映射**。

---

## 7. 产物清单

| 文件 | 状态 | 说明 |
|---|---|---|
| `src/lib/decision-gate/annotation-schema.ts` | 新增 | `GreenAnnotationEntry` 类型 + 目标量/超额/合成标记常量 |
| `scripts/gen-green-annotation-seed.ts` | 新增 | 冷启动生成器（不进 CI） |
| `doc/green-annotation-seed.json` | 新增 | 220 条标注骨架，`humanLabel` 全空 |
| `doc/green-annotation-workflow.md` | 新增 | 人工标注工作流 + 三档判据 + 自查口径 |
| `doc/green-annotation-result.md` | 新增 | 本文件 |
| 现有文件 | **零改动** | `git status` 仅新增 4 个文件 |

> 注：`src/lib/decision-gate/` 目录在本任务前已由行动清单 #1（DecisionGate 骨架）创建
> （`types.ts` / `llm-wrapper-gate.ts` / `index.ts` + 2 个测试文件，19:02–19:06）。
> 本任务只往该目录**追加** `annotation-schema.ts`，未触碰该目录任何既有文件。
> `scripts/test-affected.sh` 的改动（`M` 状态）**不是本任务做的**，系工作区内并行的其他改动。
