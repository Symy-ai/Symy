# Jev Wave 1 首条点亮实施方案 — micro-challenge-category（只读侦察产出）

> 2026-09-28 · 只读侦察批 · 基线 `00888fd`（main）
> 关联：`doc/jev-wave1-recon-result.md`（b128 侦察）/ `doc/jev-unified-gate-result.md`（骨架）/ `doc/jev-choice-wording-result.md`（b131 措辞）/ `doc/jev-category-align-result.md` + `jev-category-align-impl-result.md`（b132/b133 品类对齐）
> 性质：**零代码改动，仅本文档**。`git status` 干净。

---

## 1. 选首条点亮目标：micro-challenge-category

**选定：`micro-challenge-detector` 的 `micro-challenge-category`（choice，五档）**。否决 `shopping-clarify-slot`。

### 1.1 候选对比（20 条里风险最低的两条 vs 全场）

| 维度 | micro-challenge-category | shopping-clarify-slot | 其他 18 条 |
|---|---|---|---|
| 消费端位置 | `letta-turn-context.ts:350-352` — **叠加型**（链 19，不短路，Letta 正常跑） | `route.ts:716-729` — **短路型**（链 16，命中即 return，Letta 不跑） | 短路型占 15/20 |
| 失败爆炸半径 | 最多少发/多发一张可忽略的卡；Letta 回复不受影响 | 命中即**终止整条主链**：错判直接改变用户可见回复主路径 | — |
| 输入依赖 | 消息文本 + 客户端频控历史（算术留规则层，§1.4 明示） | `askedSubjects[]` **会话态上行**（b128 §2.4 明列的非单轮依赖） | 仅 3 条纯 Noul 无额外输入 |
| 输出消费方式 | `MicroChallengeProposal` 富对象，但 category 是唯一判定量；titleKey/durationHours 是常量派生 | `slot` 决定 answers[] 派生 + **直接改写回复文案**（澄清卡 = canned reply） | — |
| 下游 UI 链 | 已就绪且已被生产验证（batch46-b 起） | 同样就绪，但卡片错误 = 用户被错误追问 | — |
| 品类枚举对齐 | **已解决**：b132/b133 方案 A 落地，`MicroChallengeCategory = Exclude<InterceptCategory,'default'>` 类型引用化 + category-keywords-guard 测试 | 不涉品类，但三槽位与 `answers[]` 派生耦合 | 三处品类问里 micro 是唯一已对齐的 |
| 既有测试 | `micro-challenge-detector.test.ts` 7 用例 + `micro-challenge-card.test.tsx` 前端 | `shopping-clarify-turn.test.ts` | — |

### 1.2 决定性理由

1. **叠加型不是短路型**（b128 §1.4 的关键结构性事实）：micro-challenge 住在 `loadLettaTurnContext` 内（链 19），命中与否只影响 SSE 流最前是否多注入一张 `micro_challenge` 事件，**主回复由 Letta 生成、完全不受影响**。点亮出错的最坏结果 = 卡片漏发或误发，不是答非所问。shopping-clarify 是链 16 短路块，gate 误判「需要澄清」会让用户收到 canned 追问、Letta 整轮不跑 —— 首条点亮就接主路径短路器，翻车半径不成比例。
2. **判定面刚好是 choice 一问**：`detectMicroChallenge` 的语义可迁移部分恰好是 `micro-challenge-category` 一题（五档），购买意图门 `hasPurchaseIntent` 与 7 天频控是 b128 §1.4/§2.4 定死的「确定性计算留代码」，天然留在规则层 —— 点亮边界干净，不用拆 detector 内部。
3. **下游解包零新增工作**：UI 渲染链（`consume-ai-stream.ts:502` → `micro-challenge-card.tsx`）只消费 `proposal.category`，五档 i18n key（`chat.microChallenge.body.*` / `itemName.*`）zh/en 全齐（已逐一验证），且该链自 batch46-b 生产运行至今。
4. **品类三问中唯一已过对齐关的**：b131 发现三处品类枚举互不一致、判定「点亮前必须先对齐」；b132/b133 已按方案 A 落地（SSOT 标注 + 投影引用化 + 守卫测试）。micro-challenge 用的是 `normalizeInterceptCategory`（账本源本身），是三条里**唯一**不用动任何枚举就能点的品类题。category-query（词表本地副本）与 duplicate-purchase（四档物品形态）都还有各自的结构性注意点。
5. **首条点亮的示范价值**：它把「gate 结果 → 富对象提案 → SSE 事件 → 前端卡片」全链走通一遍，产出的接线模式（merge 语义、回退纪律、flag）可直接复用到 reuse/green-alt 等同型叠加卡。

### 1.3 shopping-clarify-slot 被否决的核心理由（记入档案，防回头翻案）

不是「不好」，是「不该当第一条」：短路型 + 会话态 `askedSubjects` 依赖 + b130 实弹 argmax<0.34 的主力摊平题。等首条点亮验证了 gate 通道稳定性、且 evals 调优 statement 后再点（建议排第 4~6 条）。

---


## 2. 现状消费链侦察

### 2.1 detector 在 src/app/api/chat/ 里的调用链（现状，全链已核对）

```
route.ts (1116 行)
└─ L839: const turnContext = await loadLettaTurnContext({...})
   └─ parts/letta-turn-context.ts
      ├─ L32:  import { detectMicroChallenge } from './micro-challenge-detector'
      ├─ L350-352:
      │    const microChallenge = symyGreenContext.greenPref === 'off'
      │      || suppressGuardCards || spendingCap.exceeded
      │      ? null
      │      : detectMicroChallenge({ userContent, recentMicroChallenges: microChallengeHistory });
      └─ L407: 返回值随 turnContext 解构 → route.ts L857
└─ route.ts 消费（两路）:
   ├─ 流式 L940-942: if (microChallenge) sseBody = prependReuseHintEvent(sseBody, microChallengeSseEvent(microChallenge))
   │    （最先包装 → 排最后 → 前端卡片区顺序 green → reuse → micro）
   └─ 非流式 L1014-1015: ...(microChallenge ? { microChallenge } : {})
```

**时机**：发 Letta 前的预检阶段（链 19 叠加点），在所有短路块（1~18）都放行之后才执行 —— 即只有「没被任何 canned 卡拦截的普通消息」会走到这里。

**门控**（三重，全部前置在 detector 调用外）：`greenPref !== 'off'` && `!suppressGuardCards` && `!spendingCap.exceeded`。

**detector 内部三段逻辑**（`micro-challenge-detector.ts:61-84`）：

| 段 | 行 | 性质 | Wave 1 归属 |
|---|---|---|---|
| ① 购买意图门 `hasPurchaseIntent` | L30-47, 63 | zh includes + en 词边界正则 | **留规则层**（b128 §1.4：意图词表是词法不是语义；也可后续单独迁） |
| ② 品类归一 `normalizeInterceptCategory` → 五档 | L65-67 | 账本 SSOT 词表 | **← 本条点亮目标（换 gate 的 choice 结果）** |
| ③ 7 天同品类频控 | L69-77 | 纯算术 + 客户端历史 | **留规则层**（b128 §1.4/§2.4 定死） |

**返回**：`MicroChallengeProposal | null`（`{category, titleKey, durationHours:24}`；titleKey/durationHours 是 category 的纯派生常量）。

### 2.2 下游 UI 渲染链（已就绪，生产验证过）

```
SSE: {type:'micro_challenge', microChallenge: proposal}
→ src/components/chat/hooks/consume-ai-stream.ts L502-508（type 分发；malformed payload warn+忽略）
→ src/components/chat/parts/micro-challenge-card.tsx
   （L42 recordMicroChallengeOffered(category) 记频控；L50 itemName i18n；L91 t(titleKey)）
→ micro-challenge-store.ts（localStorage 频控历史，下轮上行回 server）
```

i18n 就绪度实测：`zh.json`/`en.json` 的 `chat.microChallenge.body` 与 `itemName` 五档 key **全齐无缺**（electronics/clothing/beauty/home/food，逐 key 验证）。渲染链只消费 `category` 字符串，**不存在** b131 说的「裸 id options 解包」问题 —— options 只存在于 gate 问题定义里，不进 payload。

### 2.3 unified-precheck-gate 同题判定路径现状

**结论：未在跑，不是「在跑没被消费」。** 核对证据：

- `runUnifiedPrecheck` 全仓引用只有 3 处：定义文件 + barrel（`index.ts:25`）+ 自身测试。**零业务调用方**（`grep -rn` 全 src 核实）。
- `index.ts` 文件头明写「Phase 0 只建不接：… 没有任何业务调用方」；`jev-unified-gate-result.md` 红线核对表确认「不改 chat route ✅」。
- registry 的 20 条 question（含 `micro-challenge-category` 的 b131 迭代 statement）**从未被 evaluate 过**——除 b131 的 60 例实弹脚本测试（一次性 wrapper 通道验证，非生产路径）。

即：点亮 = **从零接线**，不是「把已有结果换个消费端」。这是本方案 §3 要补的那条线。

### 2.4 gate 基础设施现状（可直接复用的件）

| 件 | 状态 | 位置 |
|---|---|---|
| `runUnifiedPrecheck`（打包/300ms 预算/按 id 对齐/永不 throw） | ✅ 就绪，33 用例绿 | `unified-precheck-gate.ts:90` |
| `PRECHECK_REGISTRY` 20 条（含本条 statement） | ✅ 就绪 | `precheck-registry.ts:77-87` |
| `LLMWrapperGate`（Jev 未到位时的模拟层） | ✅ 就绪，依赖注入 call | `llm-wrapper-gate.ts` |
| `isDecisionGateEnabled()` 总开关 | ✅ 存在，默认关（`DECISION_GATE_ENABLED=1` 才开） | `index.ts` 尾部 |
| LLM 通道 `createLLMCompletion` | ✅ 就绪 | `src/lib/llm-client.ts:97` |
| 实际 Jev gate 实现 | ❌ **缺**（Jev 还在 waitlist） | — |

---

## 3. 点亮接线设计（coordinator 补写，基于 §2 侦察事实）

### 3.1 一句话方案
在 `letta-turn-context.ts` L350-352 处，`detectMicroChallenge` 的品类归一段（②）改为可切换双路：`DECISION_GATE_ENABLED=1` 时 category 由 `runUnifiedPrecheck(['micro-challenge-category'])` 的 choice 结果供给（账本 SSOT 归一后五档），gate 失败/超时/非法档回退 detector 原生归一；①意图门与③频控不动。

### 3.2 最小 diff 点位
| 文件 | 改动 | 行数预估 |
|---|---|---|
| `src/app/api/chat/parts/micro-challenge-detector.ts` | 拆出 `resolveCategory()` 纯函数（现 L65-67），新增可选参数 `gateCategory?: MicroChallengeCategory`——有值直接用（过 normalize 防非法档），无值走原生 | ~15 行 |
| `src/app/api/chat/parts/letta-turn-context.ts` L348-352 | detector 调用前：若 `isDecisionGateEnabled()`，`await runUnifiedPrecheck([...], {userContent, locale, userId})`（300ms 预算内建），把 choice 结果的 category 传入 detector | ~20 行 |
| `src/lib/decision-gate/index.ts` | 无改动（总开关已存在） | 0 |

### 3.3 回退纪律（三级）
1. gate 调用 throw/超时 → logger.warn + 用 detector 原生归一（用户无感）
2. gate 返回非法档（不在五档）→ 同上回退
3. `DECISION_GATE_ENABLED` 未设 → 全链不进 gate 分支（零开销，生产行为与今日逐字节一致）

### 3.4 Feature flag 结论
用现成 `DECISION_GATE_ENABLED`（默认关），**不需要新 env**。QA 站开、生产关——灰度按部署环境天然隔离。

## 4. 测试计划
- 既有必过：`micro-challenge-detector.test.ts` 7 用例（gate 分支关闭时行为不变）、`category-keywords-guard.test.ts`、`letta-turn-context` 相关
- 新增断言：
  a. gate 开 + 返回 'clothing' → proposal.category='clothing'（原生归一会被 gate 结果覆盖）
  b. gate 开 + throw → category 回退原生归一 + logger.warn 一次
  c. gate 开 + 返回 'banana'（非法）→ 回退
  d. gate 关 → runUnifiedPrecheck 不被调用（spy 断言零调用）

## 5. 风险清单
| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| 1 | **实际 Jev gate 缺失**（waitlist 中）——点亮首跑只能用 LLMWrapperGate 模拟层 | 高 | 本方案设计为 gate-agnostic：接口不变，Jev 到位后只换 provider。首点亮目标定为「接线通道验证」而非「判定质量」 |
| 2 | LLMWrapperGate 走 createLLMCompletion → 额外延迟/token 成本 | 中 | 300ms 预算内建超时；QA 站先跑量；statement 已过 b131 60 例实弹 |
| 3 | gate 误判档位 → 卡片文案与用户所说品类不符 | 中 | 五档 i18n 全齐，最坏是文案档错非崩溃；evals 调优归 Jev 正式接入 |
| 4 | turn-context 链 19 处新增 await（串行预算） | 低 | runUnifiedPrecheck 永不 throw + 300ms cap；失败直接回退 |
| 5 | 下游解包 | 无 | §2.2 已证渲染链只吃 category 字符串，无 options 解包问题 |

## 6. 结论
micro-challenge-category 是首条点亮的最优解：叠加型爆炸半径最小、品类对齐唯一过关、下游链生产验证过。Jev 未到位不阻塞——先用 LLMWrapperGate 验证接线通道（gate-agnostic 设计），Jev 接口到位后换 provider 即得真判定。建议本方案过 arch 审后实施。
