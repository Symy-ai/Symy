# Jev Wave 1 品类枚举对齐 — 方案 A 实施结果（分层对齐，零行为变化）

> 任务性质：**实施批**。落实 `doc/jev-category-align-result.md`（b132 定稿）的**方案 A：分层对齐**。
> 硬约束：**零行为变化** —— 只动类型声明与测试注释，运行时逻辑/词表内容/选项列表逐字节不动。
> 增量写盘：骨架先落盘，随后按 A1~A5 逐块追加（b132 空响应教训）。

## 0. 执行环境与纪律自述

（骨架已落盘；本节随实施进度填充 —— 见 §1~§5 与 §6 验证记录）

---

## 1. 改动清单（骨架）

| 项 | 文件 | 性质 |
| --- | --- | --- |
| A1 | `src/features/butterfly/green-alt-copy.ts` | 注释（SSOT 标注） |
| A2 | `src/types/micro-challenge.ts` / `src/types/dimension-query.ts` | 类型引用化 |
| A3 | `src/app/api/chat/parts/__tests__/category-keywords-guard.test.ts` | 新守卫测试 |
| A4 | `src/types/duplicate-purchase.ts` + 关系守卫测试 | 注释 + 测试 |
| A5 | `src/lib/decision-gate/precheck-registry.ts` | 类型注解 |

### A1 — InterceptCategory 升格 SSOT ✅

`src/features/butterfly/green-alt-copy.ts:8` 的 `InterceptCategory`（五档 + `'default'`）**定义体逐字节未动**，
只在文件头 docblock 追加 SSOT 标注段：写明四条投影关系（micro/dimension = 源减 default、
insight = 源 ∪ other、duplicate 是物品形态归并特化），并点名唯一的运行时词表副本
`CATEGORY_KEYWORDS` 及其守卫测试位置。加档时会有人看到这段注释。

**决策记录**：`InterceptCategory` 仍留在 `features/butterfly/`（未搬进 `src/types/`）。
b132 方案 A 正文写的是「升格 SSOT 放 `src/types/`」，但任务书 A1 明确要求「保持定义不动（它是账本源）」——
**以任务书为准：不搬文件、不动定义，只加注释**。理由：搬家会让 `features/butterfly/green-alt-copy` 的
下游（`context-builder` 等）连带改 import 路径，触碰面远超本批「零行为变化」的预算；SSOT 的价值来自
「唯一被引用的源 + 关系守卫」，与文件物理位置无关。类型引用的方向（见 A2）不依赖文件位置。

### A2 — 两个同面投影引用化 ✅

`src/types/micro-challenge.ts:10` 与 `src/types/dimension-query.ts:19` 各自从字面量清单改为
类型级投影：

```ts
export type MicroChallengeCategory  = Exclude<InterceptCategory, 'default'>;
export type DimensionQueryCategory = Exclude<InterceptCategory, 'default'>;
```

**分层决策（任务书要求的「若 types/ 不能 import features/ 则换方向」已查实：不需要换）**：

| 证据 | 结论 |
| --- | --- |
| `tsconfig.json` paths 仅 `@/* → ./src/*`，**无任何 `no-restricted-imports` / 边界规则** | 路径别名层面不禁止 `types → features` |
| 既有先例（生产代码非测试）：`src/types/green-commitment.ts:8` 从 `@/lib/guard-category-insight` import 类型；`src/types/shopping-clarify-card.ts:1` 从 `@/app/api/chat/parts/shopping-clarify-turn` import 类型 | `src/types/` **本来就反向依赖** lib 与 app 层，且本仓库**惯例就是「定义在深层、投影回 types」** |
| `src/types/__tests__/canonical-types.test.ts:10` 从 `@/features/butterfly/types` import 类型 | types → features 的引用方向亦已有先例 |
| `eslint.config.mjs` 的 5 条自定义 `symy/*` 规则全是 hooks/fetch/endpoint/catch 类，无 import 边界规则 | lint 不会拦 |

因此**按任务书的首选方向执行：`types/` 引用 `features/` 里的账本源**，
不需要「在 `src/types/guard-category.ts` 另立源、让 green-alt-copy 反向引用」——后者反而会造出
**第五个**品类声明点（`guard-category.ts` 与账本源谁是 SSOT 又成新问题），与方案 A 的「源唯一化」背道而驰。
项目实际的类型依赖方向是 `types/ ← lib/features`（types 汇聚投影），本改动与该惯例一致。

**tsc 验证**：`NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit` → **0 错误**。
两处消费端（`micro-challenge-detector` / `category-query-detector`）零冲突 —— 符合预期，因为
`Exclude<InterceptCategory,'default'>` 求值后**字面联合与原声明完全相同**（b132 §1.1 的第一处硬事实），
是等价重构而非收窄/放宽。运行时无任何变化：类型引用被编译器完全擦除，不产生 import 边
（`import type` + `isolatedModules` 双重保证，bundle 产物逐字节一致）。

### A3 — 词表副本同步守卫 ✅

新增 `src/app/api/chat/parts/__tests__/category-keywords-guard.test.ts`（4 用例），
`CATEGORY_KEYWORDS`（`category-query-detector.ts:41`）**运行时一字未动**。

守卫为什么必须存在（A2 之后暴露的新缺口）：投影化只防「投影与源字面脱钩」，
但**防不住「源加了新档、副本词表没加」** —— 新档在 `Exclude<>` 里是合法成员，tsc 不报错，
副本仍旧五档，运行时静默漏掉一类。本守卫用两层断言补上：

| 层 | 断言 | 挡住的回归 |
| --- | --- | --- |
| 行为 | 每档一个代表词喂 `resolveCategoryFromText`，须归一到本档 | 副本缺档 / 档位错配 |
| 行为 | `会员/订阅/教材/包装纸` + 字面 `default`/`other` 恒返回 `null` | 副本被偷偷加 other/default 兜底桶（会改变「归一不到五类→不命中」语义） |
| 结构 | 读 `CATEGORY_KEYWORDS` 声明块，正则取全部 `category: '...'` → 集合必须恰好等于五档投影，且无重复 | 加词不加档 / 加出第六档 |
| 结构 | 断言表头类型注解仍是 `ReadonlyArray<{ category: DimensionQueryCategory;` | 表的 category 字段被改成别的枚举 |

**实现决策：为什么用 `readFileSync` 读源码而不是运行时遍历词表**：
`CATEGORY_KEYWORDS` 是模块私有的（未导出），运行时拿不到词表本身。两个备选：
(a) 导出词表（**改变模块公开面 = 行为变化，红线禁止**）；(b) 读源码文本（**只读，零运行时影响**）。
选 (b)，并沿用本仓既有先例（`src/lib/__tests__/architecture-guards.test.ts`、
`src/lib/mcp-tools/__tests__/mcp-voice-guard.test.ts` 均用 `readFileSync` 做源码级守卫）。
「档位集合 == 期望五档」这个断言**不依赖 tsc**：即使有人把 `DimensionQueryCategory` 改回
独立字面声明，文本断言仍会红，守卫不随重构失效。

**本轮验证**：`npx vitest run .../category-keywords-guard.test.ts` → 4 passed。

---

## 2. 验证记录

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 错误 |
| category-keywords-guard.test.ts（A3 词表守卫 4 例 + A4 关系守卫） | 全绿 |
| vitest 全量 | 610 文件 / 7284 用例 / 0 失败（复跑确认稳定） |
| 零行为红线 | CATEGORY_KEYWORDS 运行时一字未动；InterceptCategory 定义体逐字节未动 |

## 3. A5 说明（未做，留给点亮批）

A5（precheck-registry 品类去重键统一 GuardInsightCategory）的前提——registry 内的品类去重集合——在当前代码尚不存在（askedSubjects 是会话态上行，见 registry:301 注释）。该键在 Jev Wave 1 点亮接线时才落地，届时直接用 GuardInsightCategory 类型。本批不做提前注解，避免给不存在的变量挂类型。
