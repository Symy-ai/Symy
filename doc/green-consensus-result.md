# Wave 0 验收线计算器落地结果（ruleLabel vs humanLabel 一致率）

> 执行：2026-09-27 · 克莱尔（agent）· 基线 `6d462c9`（main）
> 上游：`doc/green-annotation-workflow.md` §5「标完之后：一致性对比」· `doc/jev-phase0-result.md` §6.3「对比脚本未写」
> 验收线出处：`doc/Jev-引入方案-v2.md` §3 Wave 0 第 3 条 —— 「Jev vs 词表三档一致率 ≥90%，且长尾（词表 unknown 的）给出合理分辨」

---

## 1. 结论

| 项 | 结果 |
|---|---|
| 新增文件 | 2 个（`scripts/green-consensus-report.mjs` + `scripts/__tests__/green-consensus-report.test.mjs`）+ 本文档 |
| 改文件 | 1 个（`package.json`，**只加一行** `green:consensus`，既有 scripts 值一字未动） |
| 源码改动 | **零**（`src/` 全仓 0 字节改动；`npx tsc --noEmit` 0 错） |
| npm 依赖 | **零新增**（只用 `node:fs` / `node:path` / `node:url` + `node:test`） |
| 单测 | 1 个文件 / **9 个 describe / 39 个 it 全绿** |
| `node --test` 跑法 | `node --test "scripts/__tests__/*.test.mjs"`（见 §4 的坑，**任务书给的无引号形式在 Node 22.22.2 上不成立**） |
| `npx eslint`（两个新文件） | ✅ 0 error 0 warning |
| 真实数据实跑 | ✅ `humanLabel` 0/220 → 打印进度 + 词表基线，**exit 0**（未标注不是错误） |
| 验收线判定 | ⏳ **pending** —— 结构已就绪，等人工回填 `humanLabel` 后一条命令出数 |

**这次交付的不是「一致率数字」，是「算这个数字的那条命令」。** 数字现在出不来（`humanLabel` 全空，红线不许生成器代填），但工具本身今天就能验收：结构、口径、退出码、脏数据拒绝、CLI 参数、单测全绿。

---

## 2. 用法

```bash
npm run green:consensus                                # 默认读 doc/green-annotation-seed.json
npm run green:consensus -- --file <path.json>          # 换文件（标注中途快照 / 手工构造夹具）
npm run green:consensus -- --json                      # stdout 只出机器可读 JSON
node scripts/green-consensus-report.mjs --help          # 用法
```

| 退出码 | 含义 |
|---|---|
| `0` | 正常。**含「`humanLabel` 全空 → 打印进度后正常退出」**（标注还没开始是正常状态，不算错） |
| `1` | 标注集读不到 / JSON 解析失败 / 数据非法（`humanLabel` 越界、`id` 重复、必填字段缺失）→ 打印具体问题，**拒绝出报告**（宁可没数，不出骗人的数） |

`--file` 相对路径按当前工作目录解析；未知参数报错退出（不静默忽略拼错的 flag）。

### 输出内容（7 段）

| 段 | 内容 | 口径 |
|---|---|---|
| 1 | 标注进度 | 总条数 / 已标注（`humanLabel` 非空）/ `N/220 annotated (x.x%)` / zh-en 分布 |
| 2 | 词表基线 `ruleLabel` 分布 | 全部条目，冻结基准；`low` 标注为「词表管线无此档」 |
| 3 | 混淆矩阵 | `ruleLabel`(行) × `humanLabel`(列) 4×4，对角线 `[方括号]` 标出 |
| 4 | 一致率 | 对角线 / 已标注数，**保留 1 位小数**；附分档一致率 |
| 5 | 分 locale 一致率 | zh / en **分开报**（防「英文泛化好、中文翻车」）；某 locale 0 条报 `n/a` 不报 `0.0%` |
| 6 | **长尾分辨** | `ruleLabel=unknown` 桶内 `humanLabel` 分布 + **分辨率 = ≠unknown 占比**（0 = 完全没分辨 = Jev 在这一格没赢） |
| 7 | 验收线判定 | `pass` / `fail` / `pending`（无标注数据时**不判定**，不假装通过） |

`humanLabel` 全空时第 3–6 段整体跳过（全 0 的矩阵没有信息量），直接给 `pending`。

---

## 3. 输出样例

### 3.1 当前真实状态（`humanLabel` 全空）

```console
$ npm run green:consensus
═══════════════════════════════════════════════════════════
 绿色标注集 · Wave 0 验收线报告 (ruleLabel vs humanLabel)
═══════════════════════════════════════════════════════════
 文件: /home/spark/src/github/Symy/doc/green-annotation-seed.json

【1】标注进度
  总条数      220
  已标注      0   (humanLabel 非空)
  进度        0/220 annotated (0.0%)
  zh / en     110 / 110

【2】词表基线 ruleLabel 分布（全部条目, 冻结基准）
  high     142   (64.5%)
  medium   6     (2.7%)
  low      0     (0.0%)   ← 词表管线无此档
  unknown  72    (32.7%)

【3-6】混淆矩阵 / 一致率 / 长尾分辨 / 分 locale — 跳过
  原因: humanLabel 全空（尚未标注, 正常状态, 非错误）。
  下一步: 按 doc/green-annotation-workflow.md 标注后重跑本命令。

  验收线判定: ⏳ pending（无标注数据, 不判定 pass/fail）
```

`exit 0`。**词表基线已可读**：`high 142 / medium 6 / unknown 72` —— `medium` 只占 2.7%（6/220），这条先记下来：验收线是「三档一致率」，而词表三档里 `medium` 样本极少，该档的统计功效很低，`high`+`unknown` 才是主战场。

### 3.2 有分歧时的样例（**构造的假数据，仅演示排版与诊断路径**）

> ⚠️ 下面这份 `humanLabel` 是我**合成的假值**（`/tmp/demo-annotated.json`，脚本跑完即删），**不是人工标注结果**，不得当任何结论引用。真实数字必须等人工回填。

```console
【3】混淆矩阵 (ruleLabel × humanLabel, 仅已标注条目)
  rule ↓ / human →  high medium low  unknown
  ────────────────────────────────────
  high    [99  ]  0      16     11
  medium   0     [5   ]  0      0
  low      0      0     [0   ]  0
  unknown   15     0      0     [49  ]
  合计已标注  195

【4】一致率
  整体        153/195 = 78.5%
              分档: high 99/126 (78.6%) · medium 5/5 (100.0%) · low 0/0 · unknown 49/64 (76.6%)

【5】分 locale 一致率
  zh          76/97 = 78.4%
  en          77/98 = 78.6%

【6】长尾分辨 (ruleLabel=unknown 的条目里 humanLabel 落哪)
  human=high     15    (23.4%)  ← 词表长尾被人工捞出 = Jev 的分辨
  human=medium   0     (0.0%)
  human=low      0     (0.0%)
  human=unknown  49    (76.6%)  ← 词表与人工都判不出（一致）
  分辨率      15/64 = 23.4%（≠unknown 的占比, 0 = 完全没分辨）

【7】验收线判定 (Jev-引入方案-v2.md §3 Wave 0 第 3 条)
  ❌ FAIL — 一致率 78.5% vs 验收线 ≥90.0%
  长尾分辨: 15 条从 unknown 桶里分辨出来
  ⚠️ 低于验收线 → 词表过宽/覆盖不足需诊断, 不得回头改 ruleLabel 让数字好看。
```

### 3.3 `--json` 机器格式

```console
$ node scripts/green-consensus-report.mjs --json | jq '{total, annotated, rate: .overall.rate, tail: .unknownTail.resolveRate, status: .acceptance.status}'
{ "total": 220, "annotated": 0, "rate": null, "tail": null, "status": "pending" }
```

字段：`labels` / `matrix`(4×4) / `distribution` / `overall`(`agree`/`annotated`/`rate`/`perRuleLabel`/`missedLow`) / `byLocale.{zh,en}` / `unknownTail`(`humanDistribution`/`resolved`/`resolveRate`) / `acceptance`(`threshold`/`status`/`hasData`/`tailResolved`)。
分母为 0 的比率一律给 `null`（不编 `0%` 假信号），格式化成 `0.0%` 交给渲染层。

---

## 4. 单测

### 4.1 跑法（重要：不要用 `npm test`）

`package.json` 的 `test` 走 vitest，而 `vitest.config.ts` 的 `include` 只有 `src/**/*.test.ts(x)` —— `scripts/__tests__/*.mjs` **不在收集范围**（实测 `npx vitest run scripts/__tests__` → `No test files found, exiting with code 1`）。按任务书红线，**没动 vitest 配置、没改 `test` script**。node:test 单独跑：

```bash
node --test "scripts/__tests__/*.test.mjs"        # ✅ 39/39
```

> **任务书里的命令 `node --test scripts/__tests__/` 在本机 Node v22.22.2 上跑不起来**：
> 目录参数会被当模块路径解析，报 `Error: Cannot find module '.../scripts/__tests__'`（加不加结尾斜杠都一样）。
> Node 22 的 `--test` 对**位置参数**只认具体文件路径 / glob 模式，不做目录递归。
> 三种可用形式（都实测 39/39）：
>
> | 形式 | 结果 | 备注 |
> |---|---|---|
> | `node --test "scripts/__tests__/*.test.mjs"` | ✅ 39/39 | **引号必须留着**（让 Node 自己展开 glob，跨平台一致） |
> | `node --test scripts/__tests__/*.test.mjs` | ✅ 39/39 | 依赖 shell 展开，Windows cmd 不行 |
> | `node --test scripts/__tests__/green-consensus-report.test.mjs` | ✅ 39/39 | 单文件 |
> | `node --test scripts/__tests__/` | ❌ 1 fail | 任务书原命令，Node 22 不支持目录参数 |

### 4.2 测试计数与覆盖

```
# node --test "scripts/__tests__/*.test.mjs"
# tests 39
# suites 9
# pass 39
# fail 0
# duration_ms ~640
```

| describe | it 数 | 覆盖 |
|---|---|---|
| 混淆矩阵与整体一致率（10 条手工已知数据） | 5 | 4×4 每格值 / 行列合计 / 一致率 60.0% / 分档率（0 档给 `null` 而非 `NaN`）/ `fail` 判定 |
| 分 locale 一致率 | 3 | zh 4/5=80.0% vs en 2/5=40.0%（故意做出语言差）/ 两侧计数与整体自洽 / 单侧 0 条时 `null` |
| **unknown 长尾分辨** | 4 | 10 条已知数据的桶内分布 / 四种长尾形态分辨率（high·medium·low→1，unknown→0）/ 空桶 `null` / 未标注不进桶 |
| 标注进度（全空 / 部分 / 全满） | 5 | 0/220=0.0% + `pending` + 全字段无 `NaN`/`Infinity` / **45/220=20.5%** / `""`·`"  "`·`null` 视为未标注 / `"unknown"` 算已标注 |
| 数据校验 `normalizeEntries` | 4 | 正常 0 问题 / `humanLabel` 越界点名 / `id` 重复·缺失·`ruleLabel` 缺失 / 顶层非数组·含非对象 |
| 渲染 `renderReport` | 4 | 全空报告跳过矩阵 + `pending` + 无 `NaN` / 有数据报告各段 + `n/a` 不报 `0.0%` / 脏数据到渲染层也不崩 / 夹具不外泄 |
| `parseArgs` | 4 | 默认路径 / `--file` 与 `--file=` / `--json` `--help` / 未知参数与缺值 |
| **CLI 端到端**（真起子进程，退出码当断言） | 9 | 45/220 进度 exit 0 / 10 条全标注 exit 0 / `--json` 可 `JSON.parse` / 空数据 `--json` / **真实 seed 跑通** / 文件不存在 exit 1 / 坏 JSON exit 1 / 数据非法 exit 1 / 未知参数 exit 1 / `--help` exit 0 |
| 夹具清理 | 1 | 夹具全在 `tmp/` 内，不污染 `scripts/`·`doc/` |

- 手工已知数据（10 条）的期望值是**逐条手算**写进测试注释的（`high 4/6, medium 1/2, low 0/0, unknown 1/2` → 对角线 6 → 60.0%），不是跑一遍脚本把输出抄回测试（那种测试只会固化实现的错误）。
  第一版注释里我把 `high` 桶算成 5 条、`zh` 算成 2 条，测试直接打红（4 !== 7 / 5 !== 2）—— 红灯来自**我注释里的手算错误**，不是脚本错。改正注释后 39 绿。
- 夹具落在仓内 `tmp/green-consensus-fixture/`（不用 `/tmp`，保证换机器/容器也能跑），`after` 钩子 `rmSync(recursive)` 清理，另有夹具路径断言防外泄。跑完 `git status` 无 `tmp/` 残留。

---

## 5. 验证记录

| 命令 | 结果 |
|---|---|
| `node scripts/green-consensus-report.mjs` | ✅ exit 0，打印 `0/220 annotated (0.0%)` + 词表基线 |
| `npm run green:consensus` | ✅ exit 0（同上，走 package.json 入口） |
| `node scripts/green-consensus-report.mjs --json` | ✅ 合法 JSON：`total 220 / annotated 0 / status pending / matrix 4 行` |
| `node --test "scripts/__tests__/*.test.mjs"` | ✅ **39/39 pass, 0 fail** |
| `npx eslint scripts/green-consensus-report.mjs scripts/__tests__/green-consensus-report.test.mjs` | ✅ 0 error 0 warning |
| `npx tsc --noEmit`（全仓） | ✅ 0 错（注意：需 `NODE_OPTIONS='--max-old-space-size=6144'`，默认堆直接 core dump） |
| `git status --short` | `M package.json` + `?? scripts/__tests__/` + `?? scripts/green-consensus-report.mjs` + 本文档 —— `src/` 与 `doc/green-annotation-seed.json` **零改动** |
| `doc/green-annotation-seed.json` | 220 条 / `humanLabel` 键 **0 个**（本任务没碰过这个文件） |

---

## 6. 红线自检

| 红线 | 状态 | 证据 |
|---|---|---|
| 纯新增（scripts + 文档），零源码改动 | ✅ | `git status` 无 `src/` 任何条目；`tsc --noEmit` 0 错 |
| 零 npm 依赖 | ✅ | 只 `import { readFileSync } from 'node:fs'` / `node:path` / `node:url`；测试用 `node:test` + `node:assert/strict` + `node:child_process` |
| 不改 `package.json` 既有 scripts 值 | ✅ | `git diff package.json` 只有 `+ "green:consensus": ...` 一行插入 |
| 不改 vitest 配置 / `test` script | ✅ | `vitest.config.ts`、`package.json:12` 均未动 |
| 不写回标注集 | ✅ | 脚本对文件只有 `readFileSync`，全文件无写操作 |
| 不改 `ruleLabel` | ✅ | 脚本只读 `ruleLabel`；报告在 FAIL 时明确印「不得回头改 ruleLabel」 |
| 不虚构 `humanLabel` | ✅ | 演示用的假 `humanLabel` 只存在于 `/tmp`，跑完即删，仓内标注集仍是 0 标注 |

---

## 7. 已知限制 / 下一格

1. **数字出不来，等人工回填。** 工具已可验收，但 Wave 0 验收线（≥90% 一致率 + 长尾分辨）**目前无法判定**，报告如实打 `pending` 而不是打「通过」。
2. **`medium` 档样本太少（词表只给 6/220 = 2.7%）。** 分档一致率里这一档的统计功效极低，读数时别当结论；`high`(142) + `unknown`(72) 才是主战场。这条建议在回填前就定下来：若人工把大量条目判成 `medium`，那本身是「词表过宽」的信号，不是「分档一致率低」。
3. **73% 合成样本的缺陷仍在**（见 `doc/green-annotation-result.md` §6.1）。即使回填后一致率 ≥90%，按 workflow §3 也只能作**方向性参考**，不能直接当 Wave 0 验收数。脚本不修正这个偏差，只如实打印数字。
4. **`low` 档是词表管线的盲区**：报告把「人工 `low` 而词表给了已知档」（词表过宽）与「人工 `high`/`medium` 而词表 `unknown`」（词表漏）分列在矩阵的不同格子并给了逐档注记，便于按 workflow §5 的诊断口径读。但脚本**不自动**输出「假阳性 / 假阴性」汇总数字 —— 4×4 矩阵已经在报告里了，再造一个口径等于多一处可能算错的地方。需要汇总时从 `matrix` 推（`--json` 里直接可用）。
5. **长尾分辨率的口径**：本脚本用「`rule=unknown` 桶里 `human ≠ unknown` 的占比」。这与验收线原文「给出**合理分辨**」不是严格等价（合理 还含人工侧可信度），但它可算、可测、不含糊；「合理」那一半仍需人工看 15 条捞出来的样本。若 owner 认为该口径太宽，唯一的改法是改 `unknownTail.resolveRate` 的定义，**不要**改 `ruleLabel`。
6. **本工具只做「冻结基准 vs 人工」这一层。** 验收线原文是「**Jev** vs 词表」；`ruleLabel` 是词表管线（当前 green-first-rank 行为）冻结后的输出。Jev（`LLMWrapperGate`）那侧的输出要另出对照表（`jevLabel` 字段），本脚本没加 —— 加字段就动了标注集结构，不在本次红线内。

---

## 8. 产物清单

| 文件 | 状态 | 说明 |
|---|---|---|
| `scripts/green-consensus-report.mjs` | 新增 | 验收线计算器。纯函数（`buildReport`/`normalizeEntries`/`renderReport`/`parseArgs` 导出）+ CLI 双模式，`import` 无副作用 |
| `scripts/__tests__/green-consensus-report.test.mjs` | 新增 | 39 个 it（node:test）。夹具写 `tmp/`，用完即删 |
| `package.json` | 改 1 行 | `+ "green:consensus": "node scripts/green-consensus-report.mjs"` |
| `doc/green-consensus-result.md` | 新增 | 本文件 |
| `doc/green-annotation-seed.json` | **零改动** | 仍是 220 条 / 0 标注（humanLabel 只能人工填） |
| `vitest.config.ts` | **零改动** | node:test 靠单跑，不进 vitest 收集范围 |
