/* eslint-disable no-console -- 脚本类文件 console 是本职输出 */
/**
 * jev-registry-smoke — Wave 1 预检 20 问的**实弹冒烟**（问题措辞质量验证）
 *
 * 目的（Wave 1 提前检验）：Wave 0 建的 LLMWrapperGate（模拟 Jev 的 Noul/Choice/Score
 * 输出）与 Wave 1 前置建的 PRECHECK_REGISTRY（20 个判定单元的问题登记）此前**从未合体
 * 跑过**。本脚本把两者接起来，用真实 LLM 通道对 3 组 GateState 各发**一次**打包调用
 * （20 问同批），检验：registry 里每个问题的**措辞**能不能让 wrapper 模型返回合法、
 * 可解析的判定分布。
 *
 * 判定标准（就是「措辞有没有问题」的三条硬指标，报告逐项打分）：
 *   1. 解析成功率 —— 60 个判定里有多少条拿到合法 value（choice 还要长度对、分布非全零）
 *   2. 全零率 —— value=0 且 confidence=0 的占比；高 = 大量问题被模型判成「无法判断」
 *      = 这些措辞不明确 / 互相打架（registry 里 6 个让路条件冲突就是主要嫌疑）
 *   3. 跨 state 差异 —— 同一问题在「冲动 zh / 情绪 en / 中性」三种消息上，
 *      值应该有可分辨差异（emotion-shopping-mood / context-signal-type 这类 P0 问题
 *      在中性消息上就该塌回 0）。全表零差异 = 模型没在读 state，措辞与消息无关
 *
 * 跑法（开发工具，**不进 CI**，任何代码路径都不引用它）：
 *   npm run jev:smoke                        # 无 key → 打印 SKIP + 用法，exit 0
 *   OPENROUTER_API_KEY=sk-or-xxx npm run jev:smoke      # 实弹：走 OpenRouter
 *   OPENROUTER_MODEL=x/y npm run jev:smoke               # 换模型（默认 stealth/space-bunny-alpha）
 *   OPENROUTER_API_BASE=http://127.0.0.1:9/v1 OPENROUTER_API_KEY=dummy \
 *     OPENCODE_SMOKE=1 npm run jev:smoke                 # 离线档：形状自测（会失败退出）
 *
 * 三条纪律：
 *   1. **key 只从 process.env 读，绝不硬编码**；没 key 就 SKIP 退 0，不报错。
 *   2. **不 import 任何 TS 源码**（.mjs 跑在裸 node 上）—— registry 与 wrapper 的关键
 *      片段各抄一份副本；抄的时候不改动语义，只为让脚本零构建可跑。
 *   3. **只读**：不写任何仓库文件（结果文档是人写的），不碰 src/。
 *
 * ⚠️ **关于下面的 PRECHECK_REGISTRY 副本**：它与 `src/lib/decision-gate/precheck-registry.ts`
 * 手抄同步，**registry 变更时必须手动更新本副本**。权衡写在这里：.mjs 不便 import TS
 * （要么起 tsx/ts-node 依赖，要么建构建产物），为一个开发工具引入任一都不划算；20 条
 * 问法的形状是 Wave 1 期间**冻结**的（措辞调优要等真实 Jev + evals），副本漂移窗口有界。
 * 自检：`REPORT.questionIds` 会与源码 id 逐条对照（见 §4 输出第 4 段），漂移即人工核对。
 *
 * 零依赖（只用 node 内置的 process / console / setTimeout / fetch）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_TS = path.join(REPO_ROOT, 'src', 'lib', 'decision-gate', 'precheck-registry.ts');

/* ─────────────────────────── 类型（JSDoc 注释，等价 src/lib/decision-gate/types.ts） ───────────────────────────
 *
 * .mjs 不 import TS，故此处用 JSDoc 复刻契约形状，便于读脚本的人对照源码：
 *   GateQuestion = {kind:'noul', id, statement} | {kind:'choice', id, options} | {kind:'score', id, levels}
 *   GateState    = {id, text, meta?}
 *   GateResult   = {id, kind, value:number|number[], confidence:number, latencyMs:number}
 */

/** 预检登记项（对齐 unified-precheck-gate.ts 的 PrecheckQuestionSpec） */
/**
 * @typedef {Object} SmokeSpec
 * @property {string} detectorId
 * @property {'parts'|'lib'} source
 * @property {{kind:'noul', id:string, statement:string}|{kind:'choice', id:string, options:string[]}} question
 */

/** 槽位常量（与 precheck-registry.ts 同值，同步点） */
const MOOD_OPTIONS = ['tired', 'stressed', 'anxious', 'sad', 'celebratory'];
const WINDOW_OPTIONS = ['lastWeek', 'thisWeek', 'lastMonth', 'thisMonth'];
const CATEGORY_OPTIONS = ['electronics', 'clothing', 'beauty', 'home', 'food'];
const CONTEXT_SIGNAL_OPTIONS = ['emotion_reward', 'scarcity_promo', 'wear_replace'];
const CLARIFY_SLOT_OPTIONS = ['recipient', 'category', 'timing'];

/* ⚠️ 与 src/lib/decision-gate/precheck-registry.ts 同步的副本 —— registry 变更时手动更新（理由见文件头） */
const PRECHECK_REGISTRY = [
  {
    detectorId: 'emotion-shopping-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'emotion-shopping-mood', options: MOOD_OPTIONS },
  },
  {
    detectorId: 'micro-challenge-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'micro-challenge-category', options: CATEGORY_OPTIONS },
  },
  {
    detectorId: 'green-alt-detect',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'green-alt-hit',
      statement: '这条消息的购买对象属于小象在意的非环保品类，值得先给出更环保的替代建议',
    },
  },
  {
    detectorId: 'reuse-detect',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'reuse-hint',
      statement: '这条消息想买的东西，用户很可能已经拥有同类物品，值得先提示复用',
    },
  },
  {
    detectorId: 'pushback-detector',
    source: 'lib',
    question: { kind: 'choice', id: 'pushback-tone', options: ['firm', 'annoyed'] },
  },
  {
    detectorId: 'shopping-context-signals',
    source: 'lib',
    question: { kind: 'choice', id: 'context-signal-type', options: CONTEXT_SIGNAL_OPTIONS },
  },
  {
    detectorId: 'guard-pulse-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'guard-pulse-query',
      statement: '用户在问自己「什么时段最容易冲动购物」的节奏问题，且不是求建议、不是问未来预报',
    },
  },
  {
    detectorId: 'impulse-forecast-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'forecast-query',
      statement: '用户在问未来某个时间段自己的消费触发规律（回顾型统计与生活话题让路）',
    },
  },
  {
    detectorId: 'impulse-time-query-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'impulse-time-window', options: WINDOW_OPTIONS },
  },
  {
    detectorId: 'category-query-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'category-query-category', options: CATEGORY_OPTIONS },
  },
  {
    detectorId: 'savings-query-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'savings-query-window', options: WINDOW_OPTIONS },
  },
  {
    detectorId: 'reflection-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'reflection-question',
      statement: '这条消息是邀请用户回顾自己感受与选择的反思提问，不是要小象给答案',
    },
  },
  {
    detectorId: 'green-knowledge-query',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'green-knowledge-hit',
      statement: '用户在问关于环保、绿色生活或气候影响的具体知识问题，小象有对应的知识词条',
    },
  },
  {
    detectorId: 'prepurchase-detect',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'prepurchase-should-i-buy',
      statement: '用户拿不定主意、主动求小象替他判断该不该买（不是已经决定要买，也不是普通咨询）',
    },
  },
  {
    detectorId: 'commitment-detector',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'commitment-made',
      statement: '用户第一人称陈述自己决定一段时间不买某样东西（不是问要不要买，也不是转述别人）',
    },
  },
  {
    detectorId: 'compare-detector',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'compare-two-options',
      statement: '用户在比较两个具体对象之间的取舍（不是只问一个东西好不好，也不是已经决定要买）',
    },
  },
  {
    detectorId: 'list-triage-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'list-triage-shape',
      statement: '这条消息一次性列出了一份包含多个待处理对象的清单式诉求',
    },
  },
  {
    detectorId: 'duplicate-purchase-detect',
    source: 'parts',
    question: { kind: 'choice', id: 'duplicate-purchase-category', options: CATEGORY_OPTIONS },
  },
  {
    detectorId: 'shopping-clarify',
    source: 'lib',
    question: { kind: 'choice', id: 'shopping-clarify-slot', options: CLARIFY_SLOT_OPTIONS },
  },
  {
    detectorId: 'alt-footprint-intent',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'alt-footprint-query',
      statement: '用户在问自己过往为了环保替代品付出过什么、替代足迹如何',
    },
  },
];

/* ─────────────────────────── 测试 GateState（3 组，文本取自各 detector 的真实词表场景） ─────────────────────────── */

/**
 * 三组 state 的文本逐条对得上真实 detector 词表，便于事后核「模型答得对不对」：
 *   S1 zh 冲动：emotion-shopping(SHOPPING_INTENT_ZH 的「奖励自己」+ MOOD 的 tired)
 *             + shopping-context-signals(emotion_reward 词条同源) + micro-challenge(买+鞋)
 *   S2 en 情绪消费：MOOD_PATTERNS.en 的 celebratory（payday）+ SHOPPING_INTENT_EN 的
 *             "treat myself" + green-knowledge 的 worth buying 问法 + duplicate 的 phone cable
 *   S3 zh 中性：guard-pulse 的 OFF_TOPIC_ZH（天气）—— 20 问全不该命中的对照组
 * @type {Array<{id:string,label:string,text:string,meta:Record<string,unknown>}>}
 */
const STATES = [
  {
    id: 'zh-impulse',
    label: 'zh 冲动购物（情绪+弱信号+品类齐全）',
    text: '今天上班好累，想买双鞋奖励一下自己，加班费都攒了两个月了，剁手算了',
    meta: { locale: 'zh', hourOfDay: 22 },
  },
  {
    id: 'en-emotional',
    label: 'en 情绪消费（payday 庆祝 + treat myself）',
    text: "Payday today and I really want to treat myself, is it worth buying a phone cable or should I just repair the old one?",
    meta: { locale: 'en', hourOfDay: 13 },
  },
  {
    id: 'zh-neutral',
    label: 'zh 中性问候（对照组，20 问全不该命中）',
    text: '今天天气不错',
    meta: { locale: 'zh', hourOfDay: 9 },
  },
];

/* ─────────────────────────── wrapper 同款 prompt 构造（抄 llm-wrapper-gate.ts DEFAULT_SYSTEM_PROMPT） ─────────────────────────── */

const DEFAULT_SYSTEM_PROMPT = [
  '你是 Symy 的语义判定引擎（DecisionGate 模拟层）。',
  '对给定 state 逐一评估问题，只输出一个 JSON 对象，不要输出任何其他文字。',
  '格式：{"results":[{"id":"<问题id>","value":<按 kind 形状>,"confidence":<0..1>}]}',
  'value 形状约定：',
  '- kind=noul：0..1 浮点（0=否，1=是）',
  '- kind=choice：与 options 等长的数组，元素为概率，和约等于 1',
  '- kind=score：0..1 浮点，第 i 档对应 i/(档数-1)（单档按 0.5 处理）',
  '必须回答每一个问题；无法判断时给 value 0、confidence 0。',
].join('\n');

/** renderQuestion 同款：choice 只给 options 槽，noul 给 statement 句 */
function renderQuestion(question) {
  if (question.kind === 'choice') return { id: question.id, kind: 'choice', options: question.options };
  return { id: question.id, kind: 'noul', statement: question.statement };
}

/** buildMessages 同款：state 与 questions 一起 JSON 化进 user 消息 */
function buildMessages(state, questions) {
  return [
    { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        state: { id: state.id, text: state.text, meta: state.meta ?? {} },
        questions: questions.map(renderQuestion),
      }),
    },
  ];
}

/* ─────────────────────────── wrapper 同款容错解析（抄 llm-wrapper-gate.ts） ─────────────────────────── */

/** 收敛到 [0,1]；非法数值返回 null 交上层兜底 */
function clamp01OrNull(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.min(1, Math.max(0, raw));
}

/** 模型偶尔在 JSON 前后加解释文字或 ```json 围栏，取最外层 {...} */
function extractJsonObject(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** choice：截断/补齐到 options 长度，非正数落 0，总和为 0 时退化为末位 1 */
function normalizeDistribution(raw, size) {
  if (!Array.isArray(raw) || size === 0) return null;
  const weights = Array.from({ length: size }, (_, i) => {
    const n = clamp01OrNull(raw[i]);
    return n !== null && n > 0 ? n : 0;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    weights[size - 1] = 1;
    return weights;
  }
  return weights.map((w) => w / total);
}

/** 按 kind 收敛 value；无法收敛返回 null（= 解析失败） */
function normalizeValue(question, raw) {
  if (question.kind === 'choice') return normalizeDistribution(raw, question.options.length);
  return clamp01OrNull(raw);
}

/** 逐 id 收集模型的原始回答；非法 JSON / 缺 results 一律当没答（与 wrapper 一致） */
function parseAnswers(raw) {
  const byId = new Map();
  const objectJson = extractJsonObject(raw);
  if (!objectJson) return byId;
  let parsed;
  try {
    parsed = JSON.parse(objectJson);
  } catch {
    // safe to ignore: 模型输出不是合法 JSON —— wrapper 的语义是「失败即没命中」，此处同款
    return byId;
  }
  const results = parsed && parsed.results;
  if (!Array.isArray(results)) return byId;
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (typeof entry.id !== 'string' || byId.has(entry.id)) continue;
    byId.set(entry.id, { value: entry.value, confidence: entry.confidence });
  }
  return byId;
}

/**
 * 冒烟专用的成功判定：比 wrapper 的「永不抛」更严一档，才看得出措辞有没有效。
 * 漏答（模型没给这个 id）与显式答 0 **要分开**：统一兜底后两者的 value 都是 0，
 * 但前者是「模型没接住这问」= 措辞问题，后者可能本来就是正确答案。
 * choice 允许 wrapper 的退化解（全落末位）通过形状关，但会在分布表里显形。
 */
function parseOk(answered, result) {
  if (!answered) return false;
  if (Array.isArray(result.value)) return result.value.length > 0 && result.value.some((v) => v > 0);
  return typeof result.value === 'number' && Number.isFinite(result.value);
}

/* ─────────────────────────── LLM 通道（OPENROUTER_API_BASE + OPENROUTER_API_KEY） ─────────────────────────── */

/** 从 OpenAI 兼容响应里取 assistant 文本（choices 缺失时抛，调用方按失败计） */
function extractText(payload) {
  const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (!choice || !choice.message || typeof choice.message.content !== 'string') {
    throw new Error('响应不是 OpenAI 兼容形状（缺 choices[0].message.content）');
  }
  return choice.message.content;
}

/**
 * 发一次打包调用（20 问同批）。
 * OPENCODE_SMOKE=1 时把 abort 超时从 20s 放宽到 120s —— 冒烟是**人工**跑的离线检验，
 * 不受线上 300ms 预算约束，误杀长回复只会让冒烟结论失真。
 */
async function callLLM({ base, apiKey, model, messages, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'Symy jev-registry-smoke',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // 截断错误体：上游可能回 HTML 错误页，整段塞进报告反而淹没结论
      throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    // 兼容两种响应形态：JSON 直出 与 SSE 流（OmniRoute 通道即使未请求 stream 也回 SSE）。
    // SSE 形态：逐行取 "data: {...}" 块，累积 delta.content（并跳过 delta.reasoning——
    // bunny 类推理模型的 reasoning 与正文混在流里，只取 content 才是答案）。
    const trimmed = text.trimStart();
    if (trimmed.startsWith('data:') || trimmed.startsWith('{') === false && trimmed.startsWith('[') === false) {
      let content = '';
      for (const line of text.split('\n')) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const payload = l.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta;
          if (delta && typeof delta.content === 'string') content += delta.content;
        } catch { /* 跳过非 JSON 行（如 SSE 注释/心跳） */ }
      }
      if (!content) throw new Error('SSE 响应里没有累积到任何 delta.content（可能全是 reasoning 或空流）');
      return content;
    }
    return extractText(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── 统计（判措辞的三条硬指标） ─────────────────────────── */

const pct = (n) => `${(n * 100).toFixed(1)}%`;

/** 安全百分比：分母 0 返回 null，由调用方决定打印什么（0/0 不是一个数） */
const safeRate = (num, den) => (den > 0 ? num / den : null);

/** noul/score 取 value；choice 取 argmax 那一档（分布形状信息留给分布表） */
function scalarOf(result) {
  if (Array.isArray(result.value)) {
    let best = 0;
    result.value.forEach((v, i) => {
      if (v > result.value[best]) best = i;
    });
    return result.value[best];
  }
  return result.value;
}

/** choice 分布的「集中度」：argmax 概率。0 = 模型把概率摊平（不敢判/看不懂选项） */
function argmaxOf(result) {
  if (!Array.isArray(result.value)) return result.value;
  return result.value.reduce((best, v, i) => (v > result.value[best] ? i : best), 0);
}

/** 三 state 极差：同一问题上 noul 的 max-min / choice 的 argmax 概率 max-min。0 = 三 state 判得一样 */
function spreadOf(perState) {
  const nums = perState.map(scalarOf);
  return Math.max(...nums) - Math.min(...nums);
}

/**
 * 读 registry 源码里 20 条登记项的 question id（副本漂移检测用）。
 *
 * 两个坑（都是实测踩出来的，别改回去）：
 *   1. 区间锚点必须是**声明语句**（`export const PRECHECK_REGISTRY` / `export const
 *      PRECHECK_REGISTRY_SIZE`）而不是裸名字——文件头注释里也提到过 WAVE1_OUT_OF_REGISTRY，
 *      用 `indexOf('WAVE1_OUT_OF_REGISTRY')` 截断会把 20 条一起切掉（恒定报「源码 0 条」）。
 *   2. 正则只吃 `id: '...'` 字面量即可；detectorId 在源码里是键名不带引号，不会混进来。
 */
function registryIdsFromSource() {
  let src;
  try {
    src = readFileSync(REGISTRY_TS, 'utf8');
  } catch {
    // safe to ignore: 读不到源码（脚本被拷到别处）不是致命错，只提示无法核对
    return null;
  }
  const start = src.indexOf('export const PRECHECK_REGISTRY');
  const end = src.indexOf('export const PRECHECK_REGISTRY_SIZE');
  if (start === -1 || end === -1 || end <= start) return [];
  return [...src.slice(start, end).matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
}

/* ─────────────────────────── 报告排版（CJK 占 2 列，pad 对齐） ─────────────────────────── */

function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
}

/** 定宽串数组 → 逐行渲染（空串补齐，避免手写模板字符串时列宽对不齐） */
function renderTable(headers, rows) {
  const heights = new Array(headers.length).fill(0);
  for (const row of [headers, ...rows]) {
    row.forEach((cell, i) => {
      heights[i] = Math.max(heights[i], displayWidth(cell));
    });
  }
  return [headers, ...rows].map((row) =>
    row
      .map((cell, i) => (i === 0 ? pad(cell, heights[i]) : padLeft(cell, heights[i])))
      .join('  ')
      .trimEnd(),
  );
}

const pad = (s, width) => ' '.repeat(Math.max(0, width - displayWidth(s))) + String(s);
const padLeft = (s, width) => String(s) + ' '.repeat(Math.max(0, width - displayWidth(s)));
/** 浮点定宽显示（0.75 / 0.7500 两档宽度不同，直接对齐会错位） */
const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/** 一个 state 的 20 问明细：id / kind / value / confidence / 状态 */
function printQuestionRows(state, rows) {
  console.log(`\n  [${state.id}] ${state.label}`);
  const table = renderTable(
    ['问题 id', 'kind', 'value', 'conf', '状态'],
    rows.map((r) => [r.id, r.kind, r.valueText, num(r.confidence, 2), r.parseOk ? '✅' : '⚠️ 全零/未答']),
  );
  for (const line of table) console.log(`    ${line}`);
}

const USAGE = [
  '',
  '用法（key 只从环境变量读，脚本内零硬编码）：',
  '  npm run jev:smoke                                             # 无 key → 打印本说明并 exit 0',
  '  OPENROUTER_API_KEY=sk-or-v1-xxx npm run jev:smoke              # 实弹：3 次打包调用',
  '  OPENROUTER_MODEL=openai/gpt-4o-mini npm run jev:smoke         # 换模型',
  '  OPENROUTER_API_BASE=http://127.0.0.1:9/v1 \\',
  '    OPENROUTER_API_KEY=dummy OPENCODE_SMOKE=1 npm run jev:smoke  # 离线档：形状自测（预期失败退出）',
  '',
  '可调环境变量：',
  '  OPENROUTER_API_KEY   必填，缺则 SKIP（绝不在代码里存 key）',
  '  OPENROUTER_API_BASE  缺省 https://openrouter.ai/api/v1',
  '  OPENROUTER_MODEL     缺省 stealth/space-bunny-alpha',
  '  OPENCODE_SMOKE=1     把单次调用超时从 20s 放宽到 120s（离线/长回复端点用）',
];

/* ─────────────────────────── main ─────────────────────────── */

async function main() {
  console.log('\n🐘 jev-registry-smoke — Wave 1 预检 20 问实弹冒烟（开发工具，不进 CI）\n');
  console.log(`  问题数 ${PRECHECK_REGISTRY.length} × state 数 ${STATES.length} = ${PRECHECK_REGISTRY.length * STATES.length} 个判定`);

  const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  if (apiKey === '') {
    console.log('\n  ⏭️  SKIP — 环境变量 OPENROUTER_API_KEY 为空，本档不发任何网络请求。');
    for (const line of USAGE) console.log(line);
    process.exitCode = 0;
    return;
  }
  const base = (process.env.OPENROUTER_API_BASE ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = process.env.OPENROUTER_MODEL ?? 'stealth/space-bunny-alpha';
  const timeoutMs = process.env.OPENCODE_SMOKE === '1' ? 120_000 : 20_000;
  console.log(`  端点 ${base} · 模型 ${model} · 超时 ${timeoutMs / 1000}s · key ${apiKey.length} 字符（不回显内容）`);

  const questions = PRECHECK_REGISTRY.map((s) => s.question);
  /** 每个 state 一行结果：ok / raw / latencyMs / rows（20 条） */
  const runs = [];

  for (const state of STATES) {
    console.log(`\n  → 调闸 [${state.id}] ${state.label}`);
    const started = performance.now();
    let raw = null;
    let error = null;
    try {
      raw = await callLLM({ base, apiKey, model, messages: buildMessages(state, questions), timeoutMs });
    } catch (err) {
      // safe to ignore: 端点失败不是脚本要修的错 —— 记下来继续下一个 state，末尾统一报
      error = err instanceof Error ? err.message : String(err);
    }
    const latencyMs = Math.round(performance.now() - started);
    const answers = error ? new Map() : parseAnswers(raw);
    const rows = questions.map((q) => {
      const answer = answers.get(q.id);
      const value = answer ? normalizeValue(q, answer.value) : null;
      const confidence = answer ? clamp01OrNull(answer.confidence) : null;
      const result = { id: q.id, kind: q.kind, value: value ?? 0, confidence: confidence ?? 0 };
      return {
        id: q.id,
        detectorId: PRECHECK_REGISTRY.find((s) => s.question.id === q.id).detectorId,
        kind: q.kind,
        value: result.value,
        confidence: result.confidence,
        parseOk: parseOk(answer !== undefined, result),
        answered: answer !== undefined,
        valueText: Array.isArray(result.value)
          ? `[${result.value.map((v) => v.toFixed(2)).join(',')}]`
          : num(result.value),
      };
    });
    runs.push({ state, error, raw, latencyMs, rows, parseFailed: !error && extractJsonObject(raw) === null });
    if (error) {
      console.log(`    ❌ 调用失败（${latencyMs}ms）：${error}`);
    } else {
      const ok = rows.filter((r) => r.parseOk).length;
      // 提取器本就容忍 ```json 围栏与前后废话，所以「不是 { 开头」不是缺陷，只是形态提示
      const shape = raw.trim().startsWith('{') ? '' : '（回复带围栏/前言，容错提取已兜住）';
      console.log(`    ✅ ${latencyMs}ms · 合法 value ${ok}/${rows.length} · 原始回复 ${raw.length} 字符${shape}`);
    }
    printQuestionRows(state, rows);
  }

  /* ── 汇总 1：解析成功率 / 全零率 ── */
  const allRows = runs.flatMap((r) => r.rows);
  const okRows = allRows.filter((r) => r.parseOk);
  const zeroRows = allRows.filter((r) => !r.parseOk || (r.confidence === 0 && scalarOf(r) === 0));
  console.log('\n\n  ── 汇总 1 · 解析成功率 / 全零率 ──');
  console.log(`  判定总数        ${allRows.length}（${STATES.length} state × ${questions.length} 问）`);
  console.log(
    `  解析成功率      ${okRows.length}/${allRows.length} = ${pct(safeRate(okRows.length, allRows.length) ?? 0)}`,
  );
  console.log(
    `  全零率          ${zeroRows.length}/${allRows.length} = ${pct(safeRate(zeroRows.length, allRows.length) ?? 0)}（value=0 且 confidence=0，含漏答兜底；高 = 措辞无效）`,
  );
  const perStateOk = STATES.map((s, i) => `${s.id} ${runs[i].rows.filter((r) => r.parseOk).length}/${questions.length}`);
  console.log(`  分 state        ${perStateOk.join(' · ')}`);

  /* ── 汇总 2：全零榜（措辞最可疑的问题排前面） ── */
  const zeroCountByQuestion = new Map(
    questions.map((q) => [
      q.id,
      allRows.filter((r) => r.id === q.id && (r.confidence === 0 || !r.answered)).length,
    ]),
  );
  const zeroTop = [...zeroCountByQuestion.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  console.log('\n  ── 汇总 2 · 全零榜（模型给 confidence=0 或干脆没答该问 = 措辞无效嫌疑最大） ──');
  if (zeroTop.length === 0) console.log('  （空）60 个判定没有一条落全零 —— 措辞全部产出了有效判定');
  for (const [id, n] of zeroTop) {
    const missed = allRows.filter((r) => r.id === id && !r.answered).length;
    const label = `${n}/${STATES.length} 个 state${missed > 0 ? `（含 ${missed} 次漏答）` : ''}`;
    console.log(`    ${pad(id, 28)} ${label}`);
  }

  /* ── 汇总 3：value 分布直方图（每问跨 3 state） ── */
  console.log('\n  ── 汇总 3 · value 分布直方图（每问跨 3 state；noul/score=标量，choice=argmax 概率） ──');
  let flatCount = 0;
  const histogramRows = [];
  const histogramCells = [];
  for (const q of questions) {
    const perState = runs.map((r) => r.rows.find((row) => row.id === q.id));
    const spreads = spreadOf(perState);
    if (spreads < 0.05) flatCount += 1;
    // choice 另列 argmax 落在哪一档（分布形状信息：摊平 vs 明确，是另一种措辞失效形态）
    const argmax = q.kind === 'choice' ? perState.map((r) => `${q.options[argmaxOf(r)]}(${num(scalarOf(r))})`) : null;
    histogramRows.push({ q, perState, spreads, argmax });
    histogramCells.push([
      q.id,
      q.kind,
      num(scalarOf(perState[0])),
      num(scalarOf(perState[1])),
      num(scalarOf(perState[2])),
      num(spreads),
      argmax ? argmax.join(' | ') : '—',
    ]);
  }
  for (const line of renderTable(
    ['问题 id', 'kind', 'state1', 'state2', 'state3', '极差', 'argmax 档位'],
    histogramCells,
  )) {
    console.log(`    ${line}`);
  }
  console.log(`\n  零差异问题（跨 3 state 极差 < 0.05）    ${flatCount}/${questions.length}`);
  const flatChoices = histogramRows.filter(
    ({ q, perState }) => q.kind === 'choice' && perState.some((r) => scalarOf(r) < 0.34),
  ).length;
  console.log(
    `  摊平分布问题（choice argmax < 0.34）     ${flatChoices > 0 ? `${flatChoices}/${questions.length}` : '（无）'}`,
  );
  const discriminative = histogramRows.filter(({ spreads }) => spreads >= 0.2).length;
  console.log(`  可分辨问题（极差 ≥ 0.2）              ${discriminative}/${questions.length}`);

  /* ── 汇总 4：registry 副本漂移自检 ── */
  const sourceIds = registryIdsFromSource();
  const copyIds = questions.map((q) => q.id);
  console.log('\n  ── 汇总 4 · registry 副本漂移自检 ──');
  if (!sourceIds) {
    console.log('  ⚠️  读不到 src/lib/decision-gate/precheck-registry.ts，跳过对照（脚本被拷走？）');
  } else {
    const missing = sourceIds.filter((id) => !copyIds.includes(id));
    const extra = copyIds.filter((id) => !sourceIds.includes(id));
    const sameOrder = missing.length === 0 && extra.length === 0 && sourceIds.every((id, i) => id === copyIds[i]);
    console.log(
      `  ${sameOrder ? '✅' : '❌'} 副本 ${copyIds.length} 条 / 源码 ${sourceIds.length} 条，顺序${sameOrder ? '一致' : '不一致'}`,
    );
    if (missing.length > 0) console.log(`     副本缺：${missing.join(', ')}`);
    if (extra.length > 0) console.log(`     副本多：${extra.join(', ')}`);
    if (!sameOrder) console.log('     → 脚本副本需与 precheck-registry.ts 手动同步（见脚本文件头说明）');
  }

  /* ── 退出码：SKIP 档之外，有端点/解析问题就非 0 ── */
  const failed = runs.filter((r) => r.error);
  const unparseable = runs.filter((r) => r.parseFailed);
  const parseRate = safeRate(okRows.length, allRows.length) ?? 0;
  if (failed.length > 0 || unparseable.length > 0 || parseRate < 1) {
    console.log(
      `\n  ❌ 未通过：调用失败 ${failed.length}/${runs.length} 个 state · 整段不可解析 ${unparseable.length}/${runs.length} · 解析成功率 ${pct(parseRate)}（冒烟要求 60 个判定全部拿到合法 value；离线档打不通端点属预期）`,
    );
    process.exitCode = 1;
  } else {
    console.log('\n  ✅ 通过：3 个 state 的 60 个判定全部拿到合法 value —— 措辞在 wrapper 通道上可用。');
  }
}

await main();
