# Jev Wave 0 — Phase 0 行动清单 #2 落地结果

> 2026-09-27 · 克莱尔（agent）· 基线 `b0db6a6`（main）
> 任务：`DecisionGate` 契约 + `LLMWrapperGate` 实现进主仓库（含单测），**不接线到 green-first-rank**。

---

## 1. 结论

| 项 | 结果 |
|---|---|
| 新增文件 | 6 个（`src/lib/decision-gate/` 5 个 + 本文档 1 个） |
| 单测 | 2 个文件 / **17 个 it 全绿**（要求 ≥8） |
| `npx vitest run src/lib/decision-gate/` | ✅ 2 passed / 17 tests（343ms） |
| `npx tsc --noEmit`（全仓） | ✅ 0 错 |
| `npx eslint src/lib/decision-gate/` | ✅ 0 error 0 warning |
| 回归（`architecture-guards` 137 例 + `test:affected` 11 文件 253 例） | ✅ 全绿 |
| 是否接线 | ❌ 未接线（红线：green-first-rank / green-rules 未动） |
| 依赖变更 | ❌ 无（`llm-client` 只做 type-only import） |

---

## 2. 文件清单

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/lib/decision-gate/types.ts` | 77 | 契约类型 + JSDoc（方案 §4 草稿 1:1 落盘） |
| `src/lib/decision-gate/llm-wrapper-gate.ts` | 175 | Phase 0 实现：JSON 指令 prompt + 容错解析 + 真实 latency |
| `src/lib/decision-gate/index.ts` | 23 | barrel export + `isDecisionGateEnabled()` |
| `src/lib/decision-gate/__tests__/llm-wrapper-gate.test.ts` | 126 | 契约形状 9 例 |
| `src/lib/decision-gate/__tests__/llm-wrapper-gate-parsing.test.ts` | 105 | 容错 6 例 + barrel/开关 2 例 |
| `src/lib/decision-gate/__tests__/gate-fixtures.ts` | 51 | 两测试文件共用夹具（非测试用例） |
| `doc/jev-phase0-result.md` | — | 本文档 |

> 拆测试文件的原因：合并后 231 行 > 任务要求的「每文件 ≤200 行」，按文件拆分原则一分为二，夹具独立成文件避免定义漂移。

---

## 3. 接口签名

```typescript
// types.ts — 方案 §4 契约草稿（字段与措辞未改）
export type GateProvider = 'jev' | 'llm-wrapper' | 'rules';
export type GateQuestion =
  | { kind: 'noul'; id: string; statement: string }
  | { kind: 'choice'; id: string; options: string[] }
  | { kind: 'score'; id: string; levels: GateLevelDesc[] };
export interface GateLevelDesc { label: string; description?: string }
export interface GateState { id: string; text: string; meta?: Record<string, unknown> }
export interface GateResult {
  id: string; kind: GateQuestion['kind']; confidence: number;
  value: number | number[]; latencyMs: number;
}
export interface DecisionGate {
  evaluate(state: GateState, questions: GateQuestion[]): Promise<GateResult[]>;
  readonly provider: GateProvider;
}

// llm-wrapper-gate.ts
export type GateLLMCall = (messages: LLMMessage[], options?: LLMCompletionOptions) => Promise<string>;
export interface LLMWrapperGateOptions {
  call: GateLLMCall;                    // 生产传 createLLMCompletion，测试传 fake
  completionOptions?: LLMCompletionOptions;  // 默认 { temperature: 0 }（判定要稳定）
  systemPrompt?: string;               // 整段替换默认指令
}
export class LLMWrapperGate implements DecisionGate {
  readonly provider: 'llm-wrapper';
  constructor(opts: LLMWrapperGateOptions);
  evaluate(state: GateState, questions: GateQuestion[]): Promise<GateResult[]>;
}

// index.ts
export function isDecisionGateEnabled(): boolean;  // process.env.DECISION_GATE_ENABLED === '1'，默认关
```

### value 形状与容错规则（实现口径）

| 场景 | 行为 |
|---|---|
| noul / score | 模型给 0..1 浮点；越界（>1 / <0）**截断**到 [0,1]；非数/缺答 → `{value: 0, confidence: 0}` |
| choice | 数组截断/补齐到 `options.length` → 非正数落 0 → 重新归一（和 = 1）；全 0 时退化为末位 1 |
| 围栏 / 前后废话 | 剥 ```` ```json ```` 围栏，再取最外层 `{...}`，仍失败 → 全部落 0 |
| JSON 语法错 / 非对象 | 不抛异常，全部落 0 + `logger.warn`（两级门：语义层失败 = 没命中，规则层继续） |
| 超时 | **本类不实现**（保持纯），300ms 预算由调用方 `Promise.race`；`latencyMs` 填 `performance.now()` 真实差值 |
| 空 `questions` | 直接返回 `[]`，**完全不调 LLM** |

---

## 4. 测试清单（17 例，全绿）

**契约形状**（`llm-wrapper-gate.test.ts`，9 例）
1. noul：value/confidence ∈ [0,1]、latencyMs ≥ 0
2. choice：长度 = options 数、和 ≈ 1（±0.05）
3. choice 长度不对（只回 1 个）→ 补齐到 3 并重新归一
4. score 多档：value ∈ [0,1]
5. **score 5 档**（unknown/low/medium/high/purer）：value ∈ [0,1]
6. 三类问题混装：按 questions 顺序回填，不多不少
7. `provider === 'llm-wrapper'`
8. 空 questions → `[]` 且 `call` 未被调用
9. state+questions 序列化成一条 JSON 指令（1 次调用、temperature=0）

**容错**（`llm-wrapper-gate-parsing.test.ts`，6 例）
10. ```` ```json ```` 围栏正常解析
11. JSON 前后带解释文字仍取到最外层对象
12. 垃圾文本 → 全部 value=0/confidence=0，不 throw
13. 部分缺失 → 没答的落 0
14. 越界（value=42、confidence=-1）与非数类型（`'a'` / `null`）归一
15. JSON 语法错误不 throw

**barrel + 开关**（同文件，2 例）
16. `isDecisionGateEnabled()` 默认关；`'true'` 仍为 false；只有 `'1'` 为 true
17. barrel 导出 `LLMWrapperGate`，构造后 provider 正确

---

## 5. 验证命令与输出

```bash
npx vitest run src/lib/decision-gate/          # 2 files / 17 tests passed (343ms)
NODE_OPTIONS='--max-old-space-size=6144' \
  npx tsc --noEmit                              # 0 errors（全仓）
npx eslint src/lib/decision-gate/               # 0 problems（0 error 0 warning）
npx vitest run src/lib/__tests__/architecture-guards.test.ts   # 137 passed
bash scripts/test-affected.sh --diff <6 个新文件>              # 11 files / 253 tests passed
```

---

## 6. 遇到的问题 / 需要知道的事

1. **`npx tsc --noEmit` 默认堆会 OOM**：本机 Node 默认 ~2GB 堆，跑全仓 `tsc` 直接 `FATAL ERROR: Ineffective mark-compacts near heap limit`。
   处置：`NODE_OPTIONS='--max-old-space-size=6144'` 后 0 错。**与本次改动无关**，但后续任何全仓 tsc 验证都要带这个变量。

2. **测试文件按 ≤200 行红线拆成两个**：原计划的单个 231 行测试文件超线，拆为「契约形状」+「容错/开关」两文件，共享 `gate-fixtures.ts`。用例数 9+8=17，仍远超 ≥8 要求。

3. **eslint `require-await` 告警**：fake call 用 `async () => reply` 会被 warn（`async` 无 await）。已改成 `() => Promise.resolve(reply)`，声明级消除而非压制。

4. **`normalizeValue` 早先有个恒真三元（死代码）**：`singleLevel ? n : n` 写完自查发现，重写时直接删掉。单档量表的 0.5 约定改在 prompt 层（`renderQuestion` 的 note）表达。

5. **守卫扫描已覆盖本目录**：`architecture-guards.test.ts` 137 例全绿（其中 server-only 守卫会递归扫 `src/lib/**`、循环依赖守卫会解析 `index.ts` barrel、无 `as any`/`as never` 棘轮）。`test:affected --diff` 也把本目录正确映射到 11 个测试文件。

6. **未改动的文件（红线核对）**：`green-first-rank.ts` / `green-rules.ts` / `green-level.ts` / `green-sort.ts` / `package.json` / `.env.example` 全部零改动。
   - 副作用：`DECISION_GATE_ENABLED` 未写进 `.env.example` / `env-consumers.ts`（两者都属既有文件）——需要开关时再加，现在没有消费方。
   - 备注：`scripts/test-affected.sh` 在本任务前已是 modified 状态（他人 batch118-a 之后的工作区改动），非本次产物。

7. **用法（接线时）**：
   ```typescript
   const gate = new LLMWrapperGate({ call: createLLMCompletion });
   const results = await Promise.race([
     gate.evaluate(state, questions),
     new Promise<GateResult[]>((r) => setTimeout(() => r([]), 300)),  // 300ms 预算，放弃即零降级感
   ]);
   ```
   拿到 Jev 访问后新增 `JevGate implements DecisionGate`，`provider: 'jev'`，调用方一行不改。

---

## 8. Phase 0 行动清单对照（方案 §6）

| # | 事项 | 负责 | 状态 |
|---|---|---|---|
| 1 | 申请 Jev waitlist | Spark | ⏳ 未开始（不在本任务范围） |
| 2 | **DecisionGate 接口 + LLMWrapperGate + 单测** | 克莱尔 | ✅ **本次完成**（17 例绿） |
| 3 | 场景 D 标注集 ≥200 条 | 克莱尔/Spark | ⏳ 进行中（工作区已有 `doc/green-annotation-*.{md,json}` 非本任务产物） |
| 4 | 方案推 `doc/` | 克莱尔 | ✅ 已完成（`doc/Jev-引入方案-v2.md`） |

**下一步（Wave 0 验收线之后才做）**：把 `LLMWrapperGate` 接进 `green-first-rank` 的词表评估步，跑标注集校准（三档一致率 ≥90% + 置信度可靠性曲线）。
