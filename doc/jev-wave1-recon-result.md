# Jev Wave 1 侦察批结果 — 19 预检器 UnifiedPrecheckGate 合并可行性

> 2026-09-27 · space-bunny 产出 · 基线 `7ab904c`（main）
> 关联：`doc/Jev-引入方案-v2.md` §1.1 / §2 / §3（Wave 1 = 19 预检器 → 单次 Jev 调用）
> 性质：**只读侦察 + 1 个新固化测试文件 + 本文档**。零产品代码改动，既有测试未动。

---

## 0. 结论摘要（先看这段）

| 结论 | 内容 |
|---|---|
| **"19 个预检器"是判定单元数，不是文件数** | v2 §1.1 列的 19 项里，**只有 12 个住在 `src/app/api/chat/parts/`**；另外 7 项的判定实现在 `src/lib/`，parts/ 那层是 turn 包装或薄封装。**实际搬家的代码在 src/lib/，不在 parts/** |
| **parts/ 里真正的 detector 文件只有 12 个** | 文件名带 `detect` 的恰好 12 个；parts/ 共 56 个 `.ts`（54 个 + index.ts + types.ts），其余是 turn/context/SSE 包装/基础设施 |
| **附带发现第 20 个判定单元** | `green-alt-retro-gate.ts` 的 `shouldDeferGreenAltRetro` 是 parts/ 内的一个真判定器（复用 6 个其他判定器 + 2 个 lib），v2 清单未列。见 §1.3 |
| **合并可行性：可行，但不是"一次调用 19 问"那么简单** | 19 个判定器里 **10 个返回富对象**（Noul 是非题问不出）、**8 组存在顺序依赖**、**4 个的输入不止消息文本**。见 §2 |
| **最大障碍不是技术，是"互斥"** | 现状 19 个判定器**不是并列关系，是互斥优先级链**（先中先得，短路返回）。并行打包成 19 个 Jev 问题后，"谁赢"必须重新定义 —— 这是 Wave 1 的真正设计题 |
| **Jev 语义层天然双语** ✅ | 词表现状是 zh/en **双份手工维护**（每条 `zh: RegExp` + `en: RegExp`）。这是 Wave 1 最大收益点，也是最易验证的收益点 |
| **无副作用** ✅ | 21 个 parts/ 判定器**全部零 IO / 零 store 写 / 零 localStorage**。`localStorage` 只是客户端上行数据（`guardIntensity`/`guardScope`/`microChallengeHistory`），服务端只读。无一个需要"从合并里拆出去" |
| **固化测试已落地** ✅ | `src/app/api/chat/parts/__tests__/precheck-inventory-guard.test.ts`，56 用例，已用「删除文件」变异验证过会红（6 红） |

---

## 1. 预检器清单盘点

### 1.1 parts/ 内的 12 个 detector（判定本体在 parts/）

| # | 文件 | 主导出签名 | 输入 | 输出形状 | 副作用 |
|---|---|---|---|---|---|
| 1 | `green-alt-detect.ts` | `detectGreenAltCard(userContent, locale: GreenLocale, greenPref, preferences?)` | 消息文本 + locale + 开关 + 偏好态 | `GreenAltCardData \| null`（富：id/why/options[]/reuse） | 无 |
| 2 | `reuse-detect.ts` | `detectReuseHint(userContent, locale?, hourlyRate?)` | 消息文本 + locale + **时薪** | `ReuseHint \| null`（富：含服务端算好的 hoursLabel） | 无 |
| 3 | `micro-challenge-detector.ts` | `detectMicroChallenge({userContent, recentMicroChallenges?, now?})` | 消息文本 + **客户端频控历史** | `MicroChallengeProposal \| null`（富：category/titleKey/durationHours） | 无（`Date.now` 可注入） |
| 4 | `emotion-shopping-detector.ts` | `detectEmotionShopping(userContent, {locale?, greenPref?}?)` | 消息文本 + locale + 开关 | `{mood} \| null`（**choice 型**：5 档 mood，固定优先级） | 无 |
| 5 | `guard-pulse-detector.ts` | `detectGuardPulseQuery(userContent)` | **仅消息文本** | `boolean` ✅ 纯 Noul | 无 |
| 6 | `impulse-forecast-detector.ts` | `detectForecastQuery(userContent)` | **仅消息文本** | `boolean` ✅ 纯 Noul | 无 |
| 6b | 同文件 | `detectForecastDayFollowUp(userContent)` | 仅消息文本 | `0\|1\|…\|6 \| null`（7 档，**choice 型**） | 无 |
| 6c | 同文件 | `resolveForecastDayFromText(normalized)` | 已归一文本 | `ForecastDayIndex \| null` | 无（纯工具） |
| 7 | `impulse-time-query-detector.ts` | `detectImpulseTimeQuery(userContent)` | **仅消息文本** | `{window, impulseWindow} \| null`（富：窗口×时段双槽） | 无 |
| 8 | `list-triage-detector.ts` | `detectListTriage(userContent)` | **仅消息文本** | `{items: string[]} \| null`（**富：抽出 2~12 个对象词**） | 无 |
| 9 | `reflection-detector.ts` | `isReflectionQuestion(userContent)` | **仅消息文本** | `boolean` ✅ 纯 Noul | 无 |
| 10 | `savings-query-detector.ts` | `detectSavingsQuery(userContent)` | **仅消息文本** | `{window} \| null` | 无 |
| 11 | `category-query-detector.ts` | `detectCategoryQuery(userContent)` | **仅消息文本** | `{window, category} \| null` | 无 |
| 12 | `duplicate-purchase-detect.ts` | `detectDuplicatePurchase(userContent)` | **仅消息文本** | `{itemTitle, category} \| null`（富：抽物品名） | 无 |

> 另有 `resolveCategoryFromText` / `resolveImpulseWindowFromText` 两个**词表归一纯工具**（被 3 个判定器 + 1 个追问流共用），Wave 1 合并后会被"反排除"逻辑吃掉（见 §2.1）。

### 1.2 判定实现在 src/lib/ 的（parts/ 那层是薄封装或 turn 包装）—— 7 项

| # | v2 清单项 | parts/ 文件与主导出 | 真正实现在 | 输出形状 | 副作用 |
|---|---|---|---|---|---|
| 13 | prepurchase-detect | `prepurchase-turn.ts` `buildPrepurchaseTurn({userContent, locale, rng?})` | `src/lib/prepurchase-detect.ts` `detectPrepurchaseIntent` | `{subject, ...} \| null` | 无（`rng` 可注入） |
| 14 | pushback-detector | `cooldown-turn.ts` `buildCooldownTurn({userContent, locale, afterGuardCard, rng?})` | `src/lib/pushback-detector.ts` `detectPushback` | `{tone: 'firm'\|'annoyed', category} \| null`（**choice 型 2 档**） | 无 |
| 15 | shopping-clarify | `shopping-clarify-turn.ts` `buildShoppingClarifyTurn({userContent, locale, askedSubjects?})` | `src/lib/shopping-intent-clarify.ts` `classifyShoppingIntent` | `{slot: 'recipient'\|'category'\|'timing', ...answers[]} \| null`（**choice 型 3 槽**） | 无 |
| 16 | green-knowledge-query | `green-knowledge-context.ts` `buildGreenKnowledge(userContent, locale, greenPref)` | `src/lib/green-knowledge-query.ts` `matchGreenKnowledge` | `{contextBlock, card} \| 双 null`（**富：命中词条 id 数组**） | 无 |
| 17 | alt-footprint-intent | `alt-adoption-context.ts` `loadAltAdoptionContext({userId, store, userContent, locale})` | `src/lib/alt-footprint-intent.ts` `detectAltFootprintQuery` | `{line, card} \|`（**有 IO**：读 store 取足迹聚合） | **读 store**（best-effort，降级 undefined） |
| 18 | shopping-context-signals | `context-signal-turn.ts` `buildContextSignalTurn({userContent, locale, guardIntensity, greenPref, dismissedEntryIds, ...})` | `src/lib/shopping-context-intent.ts` `detectShoppingContextIntent` + `src/lib/shopping-context-signals.ts` 词表 | `{signal, tier, confidence, entries[]} \| null`（**最富：置信档 + 命中词条排序**） | 无 |
| 19 | （清单未列） commitment-detector | `commitment-turn.ts` `buildCommitmentTurn({userContent, locale, rng?})` | `src/lib/commitment-detector.ts` `detectCommitment` | `{duration, ...} \| null` | 无 |
| 19b | （清单未列） compare-detector | `compare-turn.ts` `buildCompareTurn({userContent, locale, rng?})` | `src/lib/compare-detector.ts` `detectCompare` | `{sides, ...} \| null` | 无 |

> v2 §1.1 A 表列了 19 项，其中第 13/14/15/16/17/18 项如上；**第 19 项 v2 写的是 `shopping-context-signals`**。把 commitment + compare 补进来后是 **20 个判定单元**，不是 19。v2 漏列了 commitment/compare（route 里都有独立短路块）。

### 1.3 附带发现：第 21 个判定单元（v2 未列）

| 文件 | 主导出 | 输入 | 输出 | 副作用 |
|---|---|---|---|---|
| `green-alt-retro-gate.ts` | `shouldDeferGreenAltRetro(userContent, locale)` | 消息文本 + locale | `boolean` ✅ 纯 Noul | 无 |

它是**其他判定器的合成器**：`isDataQuery()` 复用 6 个判定器（savings/category/impulse-time/forecast/follow-up/guard-pulse），`isPurchaseIntent()` 再加 `detectDuplicatePurchase` + `classifyShoppingIntent` + 自己的窄词表。

> **Wave 1 含义**：这个 gate 一旦转 Jev，它依赖的那 6 个判定器**必须先迁**（否则 gate 读的是规则层结果，两层混用产生第三种组合）。它把 Wave 1 从"19 个并列问题"变成"**先迁 6 个、再迁 1 个合成器**"的两段式。

### 1.4 当前调用点与串行顺序

**唯一调用方是 `src/app/api/chat/route.ts`（1116 行）。** 全部判定器串在一条**互斥短路链**上 —— 命中即 `return`，后续判定器根本不跑。

链路顺序（行号为 `route.ts`）：

| 序 | 位置 | 判定单元 | 命中后 | 开关门控 |
|---|---|---|---|---|
| 1 | L201-251 | retro 回答块（`shouldDeferGreenAltRetro` gate） | 落账 + Letta 收束注入 | `greenAltRetroAnswer` 存在 |
| 2 | L258-280 | retro 追问块（同 gate） | canned 追问卡 | `greenAltRetroPending && greenPref !== 'off'` |
| 3 | L286-319 | **reflection** | canned 短回复（分块 15 字符模拟打字） | 无（任何开关下都答） |
| 4 | L324-345 | **pushback / cooldown** | canned 降温 + 冷静卡 | `greenPref !== 'off'` **且 `afterGuardCard`** |
| 5 | L349-374 | **duplicate-purchase** | 决策卡 | 无 |
| 6 | L375-398 | **prepurchase** | 三问卡 | 无（用户来问就陪） |
| 7 | L401-425 | **commitment** | 承诺卡 | 无 |
| 8 | L428-452 | **compare** | 对比卡 | 无 |
| 9 | L455-480 | **list-triage** | 清单分诊卡 | 无 |
| 10 | L485-524 | **follow-up**（`detectFollowUpQuery` → `resolveFollowUpContext`） | 重算数据问答卡 | 无 |
| 11 | L525-557 | **category-query** | 分类对账卡 | 无 |
| 12 | L558-594 | **impulse-time-query** | 时段统计卡 | 无 |
| 13 | L595-637 | **impulse-forecast** | 预报卡 / 单日卡 | 无 |
| 14 | L638-669 | **guard-pulse** | 脉搏卡 | 无 |
| 15 | L673-715 | **savings-query** | 对账卡 | 无 |
| 16 | L716-739 | **shopping-clarify** | 澄清卡 | 无 |
| 17 | L743-768 | **emotion-shopping** | 情绪守护卡 | 无 |
| 18 | L774-838 | **shopping-context-signals** | 弱信号语义路由卡 | 无 |
| 19 | L839 (`loadLettaTurnContext`) | **green-alt / reuse / micro-challenge / BNPL / green-knowledge / alt-footprint** | **不短路** —— 叠加 SSE 事件 + prompt 注入 | `greenPref` / `suppressGuardCards` / `spendingCap.exceeded` |

**关键结构性事实：链 1~18 是「短路型」（canned reply，不调 Letta）；链 19 是「叠加型」（Letta 正常跑，卡片走 SSE 预注入 + prompt 拼装）。两类不能一视同仁。**

---

## 2. 合并障碍清单

### 2.1 顺序依赖 —— 8 组（Wave 1 最大的真障碍）

现状的"互斥"是**双向实现**的：既有 route 链序（source-order），也有各 detector 内部的"让路"排除词。打包成并行 Jev 问题后，两层都要重排。

| # | 依赖关系 | 现状实现 | 打包成并行问题后 |
|---|---|---|---|
| 1 | **green-alt-detect ↔ savings/category/impulse-time/forecast/follow-up/guard-pulse** | `green-alt-retro-gate.isDataQuery()` 反向复用全部 6 个 | gate 迁 Jev 前，6 个必须先迁；否则两层混用 |
| 2 | **guard-pulse ↔ forecast** | `detectGuardPulseQuery` 内部 `if (detectForecastQuery(normalized)) return false` | **硬依赖**：forecast 结果直接否掉 guard-pulse。并行打包时 guard-pulse 的问题陈述里必须内置"若这是前瞻时间问题则答否" |
| 3 | **guard-pulse ↔ category / impulse-time** | 内部调 `resolveCategoryFromText` / `resolveImpulseWindowFromText` 让路 | 同上，是 detector 内部依赖 |
| 4 | **forecast-follow-up ↔ category / impulse-time** | `detectForecastDayFollowUp` 内部调两个 `resolve*` 让路 | 同上 |
| 5 | **emotion-shopping ↔ BNPL / green-alternatives** | 内部 `detectBNPL()` + `suggestAlternative()` 让路 | BNPL 是 §1.1 B 表第 21 项（Wave 0/2 范围），**跨波次依赖** |
| 6 | **emotion-shopping ↔ context-signals** | 两者互为"让路"关系（route 链序 L743 → L774 锁定） | 并行后需显式定义优先级 |
| 7 | **follow-up ↔ savings/category/impulse-time/forecast** | 靠 route 链序（追问块 L485 在完整问句块之前）+ detector 内排除完整问句形态 | 追问流**依赖上一轮卡的元数据**（`dataQueryContext` 上行）→ **不是纯单轮判定**，见 §2.4 |
| 8 | **savings / category / impulse-time 三者共享 WINDOW 词表** | 三个文件各抄一份 `WINDOW_ZH`/`WINDOW_EN`（完全相同的三段） | 合并后应共用一个 Jev 问题（"时间窗"三槽），但**规则层现状是三份拷贝**——改一份会漏两处 |

**另外 6 个 source-order 锁已有测试**，Wave 1 重排会直接打红：
`follow-up-query.test.ts:150` / `impulse-forecast-detector.test.ts:115` / `guard-pulse-detector.test.ts:58` / `emotion-guard-turn.test.ts:95` / `context-signal-turn.test.ts:406` / `green-alt-retro-turn.test.ts:129`

### 2.2 富对象返回 —— 10 个（Noul 是非题问不出）

| 判定单元 | 富字段 | Jev 问法建议 |
|---|---|---|
| `emotion-shopping` | `mood`（5 档，**固定优先级** tired>stressed>anxious>sad>celebratory） | **choice**（5 options）+ 优先级需在 evals 里复核 |
| `cooldown/pushback` | `tone`（firm / annoyed 2 档） | **choice**（2 options） |
| `shopping-clarify` | `slot`（recipient / category / timing）+ `answers[]` | **choice**（3 options），answers 由 slot 派生 |
| `detectForecastDayFollowUp` | 星期几（7 档） | **choice**（7 options） |
| `savings-query` | `window`（4 档 lastWeek/thisWeek/lastMonth/thisMonth，**默认 thisMonth**） | **choice**（4 options）+ 默认值语义要保留 |
| `category-query` | `window`（4 档）+ `category`（5 档） | **choice ×2**（两个 slot） |
| `impulse-time-query` | `window`（4 档）+ `impulseWindow`（4 档 lateNight/evening/daytime/dawn） | **choice ×2** |
| `list-triage` | `items[]`（**2~12 个抽取的对象词**） | ❌ **choice/score 都问不出** → **必须留在规则层**（这是字符串抽取，不是判断） |
| `duplicate-purchase` | `itemTitle`（抽取的物品名）+ `category`（4 档） | 判定 → choice（4 options）；**itemTitle 抽取留规则层** |
| `green-knowledge` | 命中词条 id 数组（最多 `MAX_KNOWLEDGE_HITS` 条） | 判定 → Noul；**id 数组留规则层** |
| `shopping-context-signals` | `tier`（3 档 direct/implicit/weak）+ `entries[]`（按置信度降序 ≤3 个 chip） | `signal` + `tier` → **choice**；**entries 词条留规则层**（前端要展示原词） |
| `micro-challenge` | `category` + `titleKey` + `durationHours` | choice（5 品类）；titleKey/24h 是常量 |
| `green-alt-detect` | `id/why/options[]/reuse/reuseChannel` | 判定 → Noul/choice；**payload 留规则层**（`GREEN_ALTERNATIVES` 是 SSOT 词条库） |
| `reuse-detect` | 含服务端算好的 `hoursLabel` | 判定 → Noul；label 留规则层 |

> **净结论**：19~21 个判定单元里，**能直接做成纯 Noul 的只有 3 个**（`guard-pulse` / `isReflectionQuestion` / `shouldDeferGreenAltRetro`）。其余要么 choice/score，**要么必须把「抽取/查表/取词」那一半留在规则层**。
> 这不否定 Wave 1 —— §2 两级门架构本来就允许"规则出 payload、Jev 出判断"。但**"19 个问题打包一次调用"是判定层的说法，不是整条链的说法**。

### 2.3 i18n 现状

| 维度 | 现状 |
|---|---|
| 词表形态 | **zh/en 双份手工维护**。每条词表都是 `const X_ZH = /.../ ; const X_EN = /.../i` 或 `{zh: RegExp, en: RegExp}` |
| 匹配方式不对称 | **zh 走包含匹配（`includes`）/ en 走词边界**（`(?<![\w-])...(?![\w-])`）。这不是随手写的 —— zh 无空格边界，en 需要防 `buyer's remorse` 类误中 |
| 例外 | `micro-challenge-detector` 是**混合**：`PURCHASE_INTENT_ZH: string[]`（includes）+ `PURCHASE_INTENT_EN: RegExp[]`（词边界） |
| 归一 | 几乎全部先 `toLowerCase().replace(/\s+/g,' ').trim()`；`list-triage` 例外（保留原文大小写 + 单独 lower） |
| locale 参数 | **只有 4 个判定器真的收 locale**：`green-alt-detect` / `emotion-shopping` / `context-signal` / `alt-adoption`。其余 15+ 个**完全 locale-blind**（zh/en 词表都跑，谁先中算谁） |
| Jev 收益 | ✅ 语义层天然双语 → **双份词表维护成本归零**是 Wave 1 最大收益，也是最容易在 evals 里证明的收益（现有 zh/en 双语测试可直接当对照集） |

> ⚠️ **反直觉的一条**：locale-blind 的判定器占绝大多数。这说明现状"双语"是靠**词表穷举**实现的，不是靠语义。若 Jev 只收 `zh` 语境，这些判定器的双语行为会**变**（不是变差，是变）——evals 必须分 locale 报（Wave 0 验收线已有"分 locale 报"的做法，直接复用）。

### 2.4 非单轮状态依赖（打包成"一条消息 = 一个 state"会丢的）

| 判定单元 | 额外输入 | 来源 | 打包影响 |
|---|---|---|---|
| `follow-up` (`detectFollowUpQuery` + `resolveFollowUpContext`) | **上一轮数据问答卡的元数据**（`dataQueryContext`：kind/window/category/impulseWindow） | 客户端会话态上行 | **不是纯单轮判定**。Jev state 需要把 `prev` 一并塞进去，否则 `resolveFollowUpContext` 无上文即返回 null |
| `cooldown/pushback` | `afterGuardCard`（上一轮 assistant 是否带过守护卡） | 客户端会话态上行 | 同上，是**布尔前置门**而非判定 |
| `micro-challenge` | `recentMicroChallenges[]` + `now` | 客户端 localStorage 上行 | 7 天频控是**算术**（§1.4 留代码），不该问 Jev |
| `reuse-detect` | `hourlyRate` | DB（`profiles.hourly_rate`） | 服务端算好的输入，可进 state |
| `alt-adoption` | store 查询（足迹聚合） | Supabase | **有 IO**，判定与 IO 耦合；建议 IO 留规则层，只把"是否召回"问 Jev |
| `green-alt-detect` | `preferences`（拒绝偏好态） | store + retro events 合并 | 偏好态是**状态机**，不是判定 |
| `shopping-clarify` | `askedSubjects[]` | 客户端会话态 | 澄清轮次跟踪 |

### 2.5 各检测器现有测试文件（Wave 1 evals 对照基准）

**parts/ 内（12 detector + 相关）**：

| 文件 | 用例规模 |
|---|---|
| `__tests__/category-query-detector.test.ts` | 有 |
| `__tests__/duplicate-purchase-turn.test.ts` | 有（**注意：测的是 turn 不是 detector**，`detectDuplicatePurchase` 本体无独立测试） |
| `__tests__/emotion-shopping-detector.test.ts` | 有 |
| `__tests__/guard-pulse-detector.test.ts` | 有（含 source-order 锁） |
| `__tests__/impulse-forecast-detector.test.ts` | 有（含 source-order 锁） |
| `__tests__/impulse-time-query-detector.test.ts` | 有 |
| `__tests__/list-triage-detector.test.ts` | 有 |
| `__tests__/micro-challenge-detector.test.ts` | 有 |
| `__tests__/savings-query-detector.test.ts` | 有 |
| `__tests__/green-alt-detect.test.ts` | 有 |
| `__tests__/reuse-detect.test.ts` | 有 |
| `__tests__/emotion-guard-turn.test.ts` | 有（含 source-order 锁 + i18n 齐全性） |
| `__tests__/context-signal-turn.test.ts` | **最重**（19772 B，含 zh≥30 / en≥30 正例语料 + zh≥20 / en≥20 负例语料 + source-order 锁） |
| `__tests__/follow-up-query.test.ts` | 有（含 `resolveFollowUpContext` + source-order 锁） |
| `__tests__/green-alt-retro-gate.test.ts` | 有 |
| `__tests__/prepurchase-turn.test.ts` / `cooldown-turn.test.ts` / `commitment-turn.test.ts` / `compare-turn.test.ts` / `shopping-clarify-turn.test.ts` / `green-alt-retro-turn.test.ts` | 有 |

**src/lib/ 内（薄封装背后的真判定）**：`prepurchase-detect` / `pushback-detector` / `shopping-intent-clarify` / `shopping-context-intent` / `green-knowledge-query` / `alt-footprint-intent` / `compare-detector` / `commitment-detector` / `bnpl-detector` / `green-alternatives` / `reuse-advisor` —— 全部有测试。

**无独立测试的**：`reflection-detector.ts`（本体）、`shopping-context-signals.ts`（词表常量，被 `shopping-context-intent.test.ts` 间接覆盖）。

> **evals 建议**：Wave 1 的对照基准直接复用上述 zh/en 双语语料（尤其 `context-signal-turn.test.ts` 的 30+30 正例 / 20+20 负例）。**不需要新建标注集** —— 这是 Wave 1 相对 Wave 0 的优势：Wave 0 要新造绿色标注集，Wave 1 的行为基准已经在仓库里了。

### 2.6 副作用盘点结论

| 类型 | 结论 |
|---|---|
| 写 localStorage | **零**。`localStorage` 只出现在**客户端**（设置页 / 会话态），服务端只读上行值 |
| 写 store / DB | **零**（判定器本体）。写库动作在 route 层 fire-and-forget（`recordGreenAltRetroEvent` / `extractAndSaveFacts` / `logAIBehavior`），**不在判定器里** |
| 读 store / DB | **1 个**：`alt-adoption-context.ts`（best-effort，失败静默降级） |
| 网络 IO | **零**。`bnpl-detector` / `shopping-facts` 等 IO 都在 context 装载阶段，不在判定器内 |
| 随机 / 时钟 | `micro-challenge` 的 `Date.now`（**可注入 `now`**）；各 turn 的 `rng`（**可注入**）；route 层 `new Date()` |
| 抛异常 | **零**。全部 detector 头注释都写明"不抛异常" |

> ✅ **没有任何一个判定器需要"从合并里拆出去"**。唯一的读 IO（alt-adoption）建议 IO 与判定分离：IO 留规则层、判定问 Jev。

---

## 3. 现状固化测试

**文件**：`src/app/api/chat/parts/__tests__/precheck-inventory-guard.test.ts`（新增，231 行）

### 3.1 测什么

| describe | 用例 | 断言内容 |
|---|---|---|
| 清单 — 文件集合 | 3 | ① `readdirSync(parts/)` 与冻结基线（56 个模块）**逐字 `toEqual`** → 防静默增删<br>② 冻结基线自身无重复条目<br>③ `FROZEN_INVENTORY` 每个文件 `existsSync` → 迁移期移动/删除即红 |
| 清单 — 判定导出签名 | 21 + 1 | 21 个主判定导出（`export function/const`）仍存在 → 改名/删掉即红<br>+ 条目数冻结为 21（12 detector + 9 lib-backed） |
| 清单 — 可 import | 21 | 静态 `import()` 成功且 `typeof === 'function'` → 防循环依赖/语法损坏。**兼作"仍是纯判定器"的证明**：哪天改成有副作用的，这个断言会提醒 |
| 清单 — 富对象输出形状 | 10 | 10 个富输出类型（`CategoryQueryIntent` / `ListTriageIntent` / `FollowUpQueryIntent` …）仍导出 → 输出形状被改 = evals 对照基准失效，即红 |

共 **56 用例**。技术形态沿用仓内既有惯例（`src/lib/__tests__/architecture-guards.test.ts` 的 `readdirSync` + `existsSync` + `process.cwd()` 路径法）。

### 3.2 变异验证（证明它真的会红）

```
# 模拟 Wave 1 迁移删掉一个 detector 文件
$ rm src/app/api/chat/parts/duplicate-purchase-detect.ts
$ npx vitest run .../precheck-inventory-guard.test.ts
 Test Files  1 failed (1)
      Tests  6 failed | 50 passed (56)
# 已完整还原（git status 干净）
```

6 个用例转红，覆盖"文件集合 / 存在性 / 导出签名 / import / 富对象类型"五个维度 —— **安全网确认有效**。

> 落盘过程中该测试还抓到了**我自己写的基线里一处重复条目**（`cooldown-turn.ts` 写了两遍），说明防静默增删的断言在写的时候就起了作用。

### 3.3 维护约定

Wave 1 迁移期间文件被移动/删除/改名 → **本测试红是预期行为**。此时的正确动作是：同步更新 `FROZEN_INVENTORY` / `FROZEN_PARTS_MODULES` + 本文档表格，**而不是放宽断言**。放宽断言 = 静默增删，恰好是本测试要防的事。

---

## 4. 验证结果

| 验证项 | 命令 | 结果 |
|---|---|---|
| parts/ 全绿 | `npx vitest run src/app/api/chat/parts/` | ✅ **55 files / 670 tests passed** |
| 新测试单独跑 | `npx vitest run .../precheck-inventory-guard.test.ts` | ✅ **1 file / 56 tests passed** |
| 变异验证（删文件） | 同上，模拟迁移 | ✅ **6 红**（预期），已还原 |
| 类型检查 | `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` | ✅ **0 错误**（exit 0） |
| ESLint（新文件） | `npx eslint src/app/api/chat/parts/__tests__/precheck-inventory-guard.test.ts` | ✅ **0 问题**（exit 0） |

> **环境备注（如实记录）**：`npx tsc --noEmit` 在默认 Node 堆（~2GB）下会 OOM 崩溃（`FATAL ERROR: Ineffective mark-compacts near heap limit`）。这是**环境内存限制，与本次改动无关**（本仓 1900+ 文件）。加 `--max-old-space-size=8192` 后干净通过。后续 CI/本地跑 tsc 建议带这个 flag。

### 改动范围核对（红线）

| 红线 | 状态 |
|---|---|
| 零产品代码改动 | ✅ `git status` 只有 1 个新文件（`?? src/app/api/chat/parts/__tests__/precheck-inventory-guard.test.ts`）+ 本文档 |
| 不动既有测试 | ✅ 未修改任何既有测试文件 |
| 1 个新测试文件 | ✅ 恰好 1 个 |
| 不 fetch / rebase / checkout / push | ✅ 全程未执行 |

---

## 5. 给 Wave 1 的可行性判断

### 5.1 判断：**可行，但方案表述需要修正**

「19 个预检器 → 一次 Jev 调用（19 个 Noul 问题打包）」在**表述上过于乐观**。修正后的形态：

```
一次 Jev 调用（1 个 state = 1 条消息）
├─ 判定层：~19 个问题，1 个 Noul + ~10 个 choice
│    └─ 全部并行评估，无短路 —— 互斥判定移到"结果仲裁"阶段
├─ 仲裁层：按现状 route 链序优先级取第一个通过的（顺序依赖在这一层解决）
└─ 抽取层：留在规则层（items[] / itemTitle / entries[] / id[] / options[]）
```

### 5.2 三个必须先答的设计题

1. **互斥仲裁放哪？** 现状是"串行短路"（先中先得）。并行后 19 个问题可能同时为真，仲裁逻辑（优先级表）必须显式存在且被测试锁住 —— 否则就是**新的行为回归源**。
2. **Wave 1 一次迁完，还是分两段？** 建议：**第一段迁 12 个 parts/ detector（无副作用、单轮、测试齐）**；**第二段迁 `green-alt-retro-gate` 合成器**（它依赖第一段的 6 个）+ lib 级 7 个。这样每段都有独立的 evals 门槛，翻车半径可控。
3. **抽取型输出留规则层，Wave 1 收益还剩多少？** 剩下的是**判断的泛化能力**（长尾表述不再漏）+ **词表维护成本归零**（双语）。抽取/算术（items 切分、7 天频控、小时聚合、时间窗默认值）按 §1.4 本来就该留代码 —— 这与 v2 方案 §1.4「确定性计算 → 留代码」一致，不是妥协。

### 5.3 Wave 1 建议验收线（对齐 §3 Wave 0 纪律）

1. **对照基准已在仓库**：直接用 §2.5 列的既有 zh/en 语料（尤其 `context-signal-turn.test.ts` 的 30+30 正例 / 20+20 负例），不新建标注集
2. **判定一致率**：Jev vs 规则层，逐判定器报（不是合并报一个数 —— 3 个纯 Noul 的基线最高，富对象的最低）
3. **分 locale 报**：现状 15+ 个判定器 locale-blind，双语行为来自词表穷举；Jev 换语义后**行为会变**（未必变差），必须分开报
4. **互斥仲裁准确率单列**：多命中样本上仲裁选中的那个，与现状 route 链序是否一致 —— 这是守护决策误判（拦错/漏拦）的主要来源
5. **降级演练**：Jev 300ms 超时 / 报错 / 未开通三种情况下，规则层单独跑的结果与今天逐字节一致

---

## 附：侦察中发现的、与 v2 方案清单的差异

| # | 差异 | 说明 |
|---|---|---|
| 1 | **19 → 21 个判定单元** | v2 §1.1 A 表漏列 `commitment-detector` 与 `compare-detector`（route L401 / L428 两个独立短路块），且**未列** `green-alt-retro-gate`（复盘让位判定，route L229 / L259） |
| 2 | **"33 个 detector 相关文件"（v2 §1.1 引言）→ 实际 12 个** | parts/ 共 56 个 `.ts`；文件名含 `detect` 的 12 个；判定单元 21 个（12 在 parts/ + 9 薄封装指向 lib/） |
| 3 | **`prepurchase-detect` 不在 parts/** | v2 §1.1 第 13 项写成 `prepurchase-detect`，parts/ 里对应的是 `prepurchase-turn.ts`，真判定在 `src/lib/prepurchase-detect.ts` |
| 4 | **多数判定器 locale-blind** | 21 个里只有 4 个真收 locale 参数。"词表双语" 实际靠 zh/en 双份词表穷举，不是 locale 分支 |
| 5 | **`detectForecastDayFollowUp` 是独立判定** | v2 第 6 项 `impulse-forecast-detector` 实际含 2 个判定（预报问句 + 单日追问），后者是 7 档 choice |
| 6 | **`green-alt-retro-gate` 是判定器聚合器** | 它的输入是其他判定器的输出 —— 决定了 Wave 1 的迁移顺序（必须两段式） |
