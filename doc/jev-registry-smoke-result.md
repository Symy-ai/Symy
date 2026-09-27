# jev-registry-smoke 实弹冒烟 — Wave 1 预检 20 问的措辞质量验证（开发工具）

> 2026-09-27 · space-bunny 产出 · 基线 `996c458`（main）
> 关联：`doc/jev-unified-gate-result.md`（Wave 1 骨架 + 20 问登记簿）、`doc/jev-phase0-result.md`（Wave 0 LLMWrapperGate）、`doc/Jev-引入方案-v2.md` §2/§3
> 性质：**开发工具**。1 个新脚本 + `package.json` 一行 script + 本文档。产品代码零改动、零新依赖、不进 CI。

---

## 0. 结论摘要

| 项 | 结果 |
|---|---|
| 交付 | `scripts/jev-registry-smoke.mjs`（零依赖 node ESM，679 行）、`package.json` +1 行 `jev:smoke`、本文档 |
| 目的 | Wave 0 的 LLMWrapperGate 与 Wave 1 的 PRECHECK_REGISTRY **此前从未合体跑过**；本批用真实 LLM 通道跑一遍 20 问打包调用，检验问题措辞能否逼出合法可解析的判定分布 |
| 验证 | `node --check` 通过；**无 key 档实跑** exit 0（SKIP + 用法）；**离线四档假端点自测**全绿（good / partial / garbage / 端点不通）；**漂移检测变异验证**证明会真红；`tsc --noEmit` exit 0；`eslint scripts/jev-registry-smoke.mjs --max-warnings=0` exit 0；decision-gate 33 用例全绿 |
| 实弹档 | **未跑**（本机无 `OPENROUTER_API_KEY`）。coordinator 按 §2 的命令跑真实 LLM；预期输出形状见 §5 |
| 红线 | 零源码改动（`git diff --stat` 只有 package.json 1 行）；key 只从 `process.env` 读，脚本内零硬编码；未执行 fetch/rebase/checkout/push；脚本不被任何代码/CI 引用 |
| 遗留 | 20 问 registry 副本需与源码手动同步（脚本自检段 4 兜着，漂移即报红，见 §6 的两个实测坑） |

---

## 1. 脚本做什么

`npm run jev:smoke` = **LLMWrapperGate ⨯ PRECHECK_REGISTRY 的合体冒烟**：

1. 内嵌 **3 组 GateState**，文本从各 detector 的**真实词表场景**构造（逐条对得上，见 §3.2）；
2. 把 registry 的 **20 个问题序列化成一条 JSON 指令 prompt**（system 段逐字抄 `llm-wrapper-gate.ts:33` 的 `DEFAULT_SYSTEM_PROMPT`，user 段 = `{state, questions}` JSON，question 渲染抄 `renderQuestion`）；
3. 对每个 state 发**一次** `POST {OPENROUTER_API_BASE}/chat/completions`（`temperature: 0` + `response_format: json_object`）；
4. 用**同款容错解析**处理回复（`extractJsonObject` 围栏提取 → `JSON.parse` → 逐 id 收集 → `normalizeValue` 按 kind 收敛，抄 `llm-wrapper-gate.ts:44-145`）；
5. 输出每问 `{id, kind, value, confidence, 状态}` + **4 段汇总**（§5）。

判定「措辞好不好」的三条硬指标（脚本逐项打分）：

| 指标 | 判读 |
|---|---|
| **解析成功率** | 60 个判定里有多少条真的拿到合法 value。**漏答单独记账**（模型没给这个 id ≠ 显式答 0） |
| **全零率** | `value=0 且 confidence=0` 占比（含漏答兜底）。高 = 模型大量判「无法判断」= 措辞不明确或互相打架 |
| **跨 state 差异** | 同一问在「冲动 zh / 情绪 en / 中性」三种消息上的极差。全表零差异 = 模型没在读 state；**可分辨（极差 ≥ 0.2）** 与**摊平分布（choice argmax < 0.34）** 各自计数 |

---

## 2. 用法

```bash
# 无 key：打印 SKIP + 用法，exit 0（不发任何网络请求）
npm run jev:smoke

# 实弹（coordinator 档）：3 次打包调用
OPENROUTER_API_KEY=sk-or-v1-xxx npm run jev:smoke

# 换模型 / 换端点
OPENROUTER_MODEL=openai/gpt-4o-mini OPENROUTER_API_KEY=sk-or-v1-xxx npm run jev:smoke
OPENROUTER_API_BASE=https://openrouter.ai/api/v1 OPENROUTER_API_KEY=sk-or-v1-xxx npm run jev:smoke

# 离线档：端点不通，验证「失败不炸、报全 60 条、exit 1」
OPENROUTER_API_BASE=http://127.0.0.1:9/v1 OPENROUTER_API_KEY=dummy OPENCODE_SMOKE=1 npm run jev:smoke
```

| 环境变量 | 缺省 | 作用 |
|---|---|---|
| `OPENROUTER_API_KEY` | 无 | **必填**，缺则 SKIP 退 0（key 绝不写进代码） |
| `OPENROUTER_API_BASE` | `https://openrouter.ai/api/v1` | OpenAI 兼容端点前缀 |
| `OPENROUTER_MODEL` | `stealth/space-bunny-alpha` | 模型 |
| `OPENCODE_SMOKE=1` | 关 | 单次调用超时 20s → 120s（离线/长回复端点用） |

退出码：无 key = **0**（SKIP）；60 个判定全部合法 = **0**；端点失败 / 整段不可解析 / 解析率 < 100% = **1**。

---

## 3. 内嵌夹具

### 3.1 registry 的 20 问副本（手抄，与 `src/lib/decision-gate/precheck-registry.ts` 同步）

顺序 = registry 顺序。问法一栏是模型**实际看到**的文本（choice 只给 options 槽，noul 给 statement 句）。

| # | 问题 id | kind | detectorId | 问法（缩写） |
|---|---|---|---|---|
| 1 | `emotion-shopping-mood` | choice 5 | `emotion-shopping-detector` | options: tired/stressed/anxious/sad/celebratory |
| 2 | `micro-challenge-category` | choice 5 | `micro-challenge-detector` | options: electronics/clothing/beauty/home/food |
| 3 | `green-alt-hit` | noul | `green-alt-detect` | 「购买对象属于小象在意的**非环保**品类，值得先给更环保的替代建议」 |
| 4 | `reuse-hint` | noul | `reuse-detect` | 「想买的东西**很可能已经拥有同类物品**，值得先提示复用」 |
| 5 | `pushback-tone` | choice 2 | `pushback-detector` | options: firm/annoyed |
| 6 | `context-signal-type` | choice 3 | `shopping-context-signals` | options: emotion_reward/scarcity_promo/wear_replace |
| 7 | `guard-pulse-query` | noul | `guard-pulse-detector` | 「问自己**什么时段最容易冲动购物**的节奏问题，且不是求建议、不是问未来预报」 |
| 8 | `forecast-query` | noul | `impulse-forecast-detector` | 「问**未来**某个时间段自己的消费触发规律（回顾型统计与生活话题让路）」 |
| 9 | `impulse-time-window` | choice 4 | `impulse-time-query-detector` | options: lastWeek/thisWeek/lastMonth/thisMonth |
| 10 | `category-query-category` | choice 5 | `category-query-detector` | options: electronics/clothing/beauty/home/food |
| 11 | `savings-query-window` | choice 4 | `savings-query-detector` | options: lastWeek/thisWeek/lastMonth/thisMonth |
| 12 | `reflection-question` | noul | `reflection-detector` | 「**邀请用户回顾自己感受与选择**的反思提问，不是要小象给答案」 |
| 13 | `green-knowledge-hit` | noul | `green-knowledge-query` | 「问关于**环保、绿色生活或气候影响**的具体知识问题，小象有对应知识词条」 |
| 14 | `prepurchase-should-i-buy` | noul | `prepurchase-detect` | 「拿不定主意、主动求小象**替他判断该不该买**（不是已决定要买，也不是普通咨询）」 |
| 15 | `commitment-made` | noul | `commitment-detector` | 「**第一人称陈述**自己决定一段时间不买某样东西（不是问要不要买，也不是转述别人）」 |
| 16 | `compare-two-options` | noul | `compare-detector` | 「**比较两个具体对象**之间的取舍（不是只问一个东西好不好，也不是已经决定要买）」 |
| 17 | `list-triage-shape` | noul | `list-triage-detector` | 「一次性列出了**一份包含多个待处理对象的清单式诉求**」 |
| 18 | `duplicate-purchase-category` | choice 5 | `duplicate-purchase-detect` | options: electronics/clothing/beauty/home/food |
| 19 | `shopping-clarify-slot` | choice 3 | `shopping-clarify` | options: recipient/category/timing |
| 20 | `alt-footprint-query` | noul | `alt-footprint-intent` | 「问自己**过往为了环保替代品付出过什么**、替代足迹如何」 |

分布：12 parts + 8 lib；kind 分布 **9 noul / 11 choice**（`score` 档位 0 条 —— 20 个单元里没有量表型，registry 备了 `TIME_BUCKET_OPTIONS` 槽位常量但没登记成问题，Wave 1 迁第二槽时才会出现 score）。

### 3.2 三组 GateState（文本取自各 detector 真实词表）

| state | 文本 | 命中的真实词表场景（用于人工核「模型答得对不对」） |
|---|---|---|
| `zh-impulse` | `今天上班好累，想买双鞋奖励一下自己，加班费都攒了两个月了，剁手算了` | emotion-shopping：`MOOD_PATTERNS.zh` 的 tired（好累）× `SHOPPING_INTENT_ZH` 的 奖励自己/想买；shopping-context-signals：`emotion_reward` 词条同源；micro-challenge：买 + 鞋（clothing） |
| `en-emotional` | `Payday today and I really want to treat myself, is it worth buying a phone cable or should I just repair the old one?` | `MOOD_PATTERNS.en` 的 celebratory（payday）+ `SHOPPING_INTENT_EN` 的 treat myself；green-knowledge 的 worth buying 问法；duplicate-purchase 的 `phone cable`（electronics）；re-use-hint 的「repair the old one」正样本 |
| `zh-neutral` | `今天天气不错` | `guard-pulse-detector` 的 `OFF_TOPIC_ZH`（天气）—— **对照组：20 问全不该命中** |

`meta` 给了 `{locale, hourOfDay}`（hourOfDay 是 Wave 1 迁 `impulse-time` 所需的上下文，提前验证模型会不会滥用它）。

---

## 4. 无 key 档实跑输出（本机真实记录）

```
$ env -u OPENROUTER_API_KEY npm run jev:smoke

> weareallme@0.3.0 jev:smoke
> node scripts/jev-registry-smoke.mjs

🐘 jev-registry-smoke — Wave 1 预检 20 问实弹冒烟（开发工具，不进 CI）

  问题数 20 × state 数 3 = 60 个判定

  ⏭️  SKIP — 环境变量 OPENROUTER_API_KEY 为空，本档不发任何网络请求。

用法（key 只从环境变量读，脚本内零硬编码）：
  npm run jev:smoke                                             # 无 key → 打印本说明并 exit 0
  OPENROUTER_API_KEY=sk-or-v1-xxx npm run jev:smoke              # 实弹：3 次打包调用
  OPENROUTER_MODEL=openai/gpt-4o-mini npm run jev:smoke         # 换模型
  OPENROUTER_API_BASE=http://127.0.0.1:9/v1 \
    OPENROUTER_API_KEY=dummy OPENCODE_SMOKE=1 npm run jev:smoke  # 离线档：形状自测（预期失败退出）

可调环境变量：
  OPENROUTER_API_KEY   必填，缺则 SKIP（绝不在代码里存 key）
  OPENROUTER_API_BASE  缺省 https://openrouter.ai/api/v1
  OPENROUTER_MODEL     缺省 stealth/space-bunny-alpha
  OPENCODE_SMOKE=1     把单次调用超时从 20s 放宽到 120s（离线/长回复端点用）
$ echo $?
0
```

`node --check scripts/jev-registry-smoke.mjs` → exit 0（无输出）。

---

## 5. 实弹档的预期输出形状

命令：`OPENROUTER_API_KEY=<key> npm run jev:smoke`（默认端点与模型）。结构如下（`│` 缩进按实际终端宽度，数字是**形状示意**，非真实模型答案）：

```
  端点 https://openrouter.ai/api/v1 · 模型 stealth/space-bunny-alpha · 超时 20s · key 51 字符（不回显内容）

  → 调闸 [zh-impulse] zh 冲动购物（情绪+弱信号+品类齐全）
    ✅ 4210ms · 合法 value 20/20 · 原始回复 2871 字符

  [zh-impulse] zh 冲动购物（情绪+弱信号+品类齐全）
                        问题 id  kind    value                       conf  状态
          emotion-shopping-mood  choice  [0.85,0.03,0.04,0.03,0.05]  0.90  ✅
       micro-challenge-category  choice  [0.04,0.88,0.03,0.03,0.02]  0.92  ✅
                  green-alt-hit  noul    0.75                        0.85  ✅
                  ...（共 20 行，每个 state 一段）

  ── 汇总 1 · 解析成功率 / 全零率 ──
  判定总数        60（3 state × 20 问）
  解析成功率      60/60 = 100.0%
  全零率          4/60 = 6.7%（value=0 且 confidence=0，含漏答兜底；高 = 措辞无效）
  分 state        zh-impulse 20/20 · en-emotional 20/20 · zh-neutral 20/20

  ── 汇总 2 · 全零榜（模型给 confidence=0 或干脆没答该问 = 措辞无效嫌疑最大） ──
    guard-pulse-query         1/3 个 state
    pushback-tone             1/3 个 state
    ...

  ── 汇总 3 · value 分布直方图（每问跨 3 state；noul/score=标量，choice=argmax 概率） ──
                        问题 id  kind    state1  state2  state3  极差  argmax 档位
          emotion-shopping-mood  choice  0.85    0.42    0.21    0.64  tired(0.85) | celebratory(0.42) | sad(0.21)
       micro-challenge-category  choice  0.88    0.51    0.24    0.64  clothing(0.88) | electronics(0.51) | electronics(0.24)
                  green-alt-hit  noul    0.75    0.30    0.06    0.69  —
                  ...
  零差异问题（跨 3 state 极差 < 0.05）    0/20
  摊平分布问题（choice argmax < 0.34）     2/20
  可分辨问题（极差 ≥ 0.2）              14/20

  ── 汇总 4 · registry 副本漂移自检 ──
  ✅ 副本 20 条 / 源码 20 条，顺序一致

  ✅ 通过：3 个 state 的 60 个判定全部拿到合法 value —— 措辞在 wrapper 通道上可用。
```

**怎么读这张表**（Wave 1 问法调优的判据）：

| 现象 | 含义 | 下一步 |
|---|---|---|
| 解析率 < 100% | 模型漏答或形状违约 | 看汇总 2 的「含 N 次漏答」→ 措辞太绕/太像的，改写成更短的陈述句 |
| `zh-neutral` 上 P0 问题（#1~#6）value 高 | 让路条件没写进问句，模型在无关消息上乱判 | 把让路条件从括号提到主句（如 #7 的「且不是求建议、不是问未来预报」已经这么写了） |
| 某问极差 < 0.05 | 与 state 无关，措辞失去判别力 | 重写或合并该问 |
| choice 在 `zh-neutral` 上 argmax < 0.34 | 模型摊平分布 = 看不懂选项集 | 选项要带语义（现在只有裸 id，Jev 接入时可能需加 description） |
| 汇总 4 ❌ | 脚本副本漂移 | 按脚本文件头说明同步副本（**不是** registry 错） |

**预期 vs 需警惕**：模型是**小语种/小模型向**的 stealth 模型，60/60 全解析是可期望的基线（指令里已写死「必须回答每一个问题；无法判断时给 value 0、confidence 0」，模型漏答属**异常**）；但 `zh-neutral` 上 choice 摊平（argmax 0.25~0.35）是**很可能出现**的，因为 9 个 choice 问题的 options 全是裸 id 无描述 —— 这正是冒烟要提前暴露的东西，记下来供 Wave 1 决定是否给槽位加 description。

---

## 6. 验证记录

### 6.1 本机可验证的四档（全部离线，零网络）

用**临时假 OpenRouter 端点**（`/tmp` 下的 node http server，OpenAI 兼容响应，**不提交仓内**）驱动脚本，把解析/统计/排版/退出码四条路径都走了一遍：

| 档 | 假端点行为 | 期望 | 实测 | 退出码 |
|---|---|---|---|---|
| good | 20 问全答、`response_format` + ```json 围栏 | 60/60 解析成功，汇总 4 ✅ | 60/60 = 100.0%，全零率 0.0%，零差异 0/20，可分辨 20/20，漂移 ✅ | 0 |
| partial | 漏答 1/3 + 缺 confidence 1/6 + `value` 写成字符串 1/8 | 解析率跌到 ~2/3，漏答被记账 | 39/60 = 65.0%，全零率 35.0%，汇总 2 逐条标「含 3 次漏答」 | 1 |
| garbage | 回「抱歉，我无法完成这个任务。」 | 整段不可解析 → 报 0% + 明确「整段不可解析 3/3」 | 0.0%，20 问零差异，结论行「❌ 未通过：… 整段不可解析 3/3」 | 1 |
| 端点不通 | `http://127.0.0.1:9/v1`（`OPENCODE_SMOKE=1` → 超时 120s） | 3 次 `fetch failed` 不炸，报全 60 条 | 逐 state 「❌ 调用失败（30ms）：fetch failed」，汇总仍完整出表 | 1 |

**围栏/前言容错**在 good 档被真实走到：假端点回的是 ```` ```json\n{...}\n``` ````，脚本照常解析（首行提示「回复带围栏/前言，容错提取已兜住」）。

### 6.2 变异验证：漂移检测真的会红

把源码 registry 的 `alt-footprint-query` 改成 `alt-footprint-QUERY`（副本不动），脚本汇总 4 立刻变红并指出差异：

```
  ── 汇总 4 · registry 副本漂移自检 ──
  ❌ 副本 20 条 / 源码 20 条，顺序不一致
     副本缺：alt-footprint-QUERY
     副本多：alt-footprint-query
     → 脚本副本需与 precheck-registry.ts 手动同步（见脚本文件头说明）
```

**过程中自测抓出的两个真 bug**（都已修，值得记下来防止改回去）：

1. **漂移检测恒定误报**：最初按 `indexOf('WAVE1_OUT_OF_REGISTRY')` 截断取 id —— 但**文件头注释里也提到过这个名字**，截断点落在 20 条之前，输出恒为「源码 0 条」。改为用**声明语句**做锚点（`export const PRECHECK_REGISTRY` → `export const PRECHECK_REGISTRY_SIZE`）后正确读到 20 条。
2. **漏答被算成「解析成功」**：`parseOk` 只看兜底后的 value（漏答兜底成 0 也算「合法 0」），导致 garbage 档的解析成功率显示 100%。改为 `parseOk(answered, result)`，漏答单独记 `answered=false`，garbage 档随即报 0.0%。

### 6.3 零影响核对

| 检查 | 命令 | 结果 |
|---|---|---|
| 语法 | `node --check scripts/jev-registry-smoke.mjs` | exit 0 |
| 类型 | `NODE_OPTIONS='--max-old-space-size=4096' npx tsc --noEmit` | exit 0 |
| Lint | `npx eslint scripts/jev-registry-smoke.mjs --max-warnings=0` | exit 0（文件头 `/* eslint-disable no-console */`） |
| 既有测试 | `npx vitest run src/lib/decision-gate` | 3 文件 **33 用例全绿**（脚本不被 vitest 收集：`include` 只含 `src/**`） |
| 改动范围 | `git diff --stat` | 只有 `package.json | 1 +`；新文件 `scripts/jev-registry-smoke.mjs` + 本文档 |
| CI | `.github/workflows/ci-checks.yml` | 只跑 `tsc` / `eslint src/` / `vitest` —— 脚本**不在任何 CI 步骤** |
| 依赖 | `package.json` | 未加任何 dependency；脚本只用 `node:fs` / `node:path` / `node:url` / 内置 `fetch` |

---

## 7. 红线自检

| 红线 | 结论 |
|---|---|
| 纯新增 scripts + 文档 + package.json 一行 script | ✅ `git status --short` 只有 `M package.json`、`?? scripts/jev-registry-smoke.mjs`、本文档 |
| 零源码改动 | ✅ `src/` 一字未动（`git diff --stat` 只有 package.json） |
| 脚本不进 CI | ✅ CI 三步（tsc / eslint src/ / vitest）均不涉及；无代码引用该脚本 |
| 零新依赖 | ✅ 只用 node 内置模块与内置 `fetch` |
| key 不硬编码 | ✅ 全文只在 `process.env.OPENROUTER_API_KEY` 读；打印时只回显**字符数**；文档里全是占位符 `sk-or-v1-xxx` |
| 不 fetch/rebase/checkout/push | ✅ 全程未执行 |
| 结果文档必写 | ✅ 本文（含未跑实弹档的说明） |

---

## 8. 已知限制 / 下一格

1. **实弹档未在本机跑**（无 key）。§5 是**预期形状 + 判读方法**，不是实测数据；coordinator 跑完后把真实输出贴进 §4（新建一节「实弹档实跑输出」）即可。
2. **20 问副本靠手抄**。漂移自检只比 **id 序列**，不比 options/statement 文本 —— 改了问法文字但没改 id，检测不到。Wave 1 调优问法时，**registry 与脚本副本要同一次提交一起改**。
3. **9 个 choice 的 options 是裸 id**（`electronics` / `firm` / `tired`…），模型看不懂时只能靠 state 猜。这是本冒烟最可能暴露的措辞缺陷（见 §5 末），Jev 接入时可能要靠 `GateLevelDesc.description` 同类机制补描述。
4. **`zh-neutral` 对照组只测「不该命中」**。没有测反向：中性消息 + 守护卡刚发出的上下文（`afterGuardCard` 是闸外前置门，不该进 prompt）。pushback-tone（#5）在无上下文时必然摊平，这是**预期**而非缺陷 —— 判读时别误伤它。
5. **3 组 state 是人工构造**，不是 evals 集。真要调问法，应把这 3 组扩成绿标集那样的人工标注语料（`doc/green-annotation-seed.json` 的路子），用一致率而不是「能不能解析」当验收线。
