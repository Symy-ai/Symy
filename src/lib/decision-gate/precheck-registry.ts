/**
 * precheck-registry — Wave 1 预检判定单元**登记簿**（20 条，占位骨架）
 *
 * 数据来源：doc/jev-wave1-recon-result.md（b128 侦察）。20 个判定单元 =
 * 12 个判定本体住 src/app/api/chat/parts/ + 8 个住 src/lib/；只有 3 个能做成纯 Noul
 * （guard-pulse / reflection / green-alt-retro-gate），其余是 choice（富对象槽位）或
 * 必须把「抽取/查表」那一半留在规则层；8 组顺序依赖 + 4 个非单轮状态依赖 → 分两段迁。
 *
 * ⚠️ 本 registry 是**登记簿，不是开关**：**注册 ≠ 启用**。每条都还跑在规则层上
 * （route 未动一根线），Wave 1 迁移时才逐个「点亮」——把某条的 ruleRef 换成 gate 结果的
 * 消费端。今天这份清单的价值是：迁移时**不再重新考古**，改一处就能对齐全量单元。
 *
 * 📌 计数口径（b128 内部计数自相矛盾：§1.3 标题写「第 21 个」，§1.2 表格实有 8 行，
 *    §5.3 又写 21）：本簿按「12 parts / 8 lib = 20」收口，两条已知但不计入 20 的单元
 *    单列在 WAVE1_OUT_OF_REGISTRY（理由写在那一项上）。同理
 *    `impulse-forecast-detector` 里的 `detectForecastDayFollowUp`（同文件同卡片）并入本单元。
 *
 * 每条注释三段：**现状规则层行为** / **Wave 1 迁移优先级**（P0 情绪冲动类、P1 查询类、
 * P2 长尾）/ **迁移时必须一起搬的约束**。question 是**合理骨架**不是最终问法——现在冻结的
 * 是「问什么维度」（kind + 槽位集合），措辞等 Wave 0 验收线过 + 拿到真实 Jev 后用 evals 调优。
 */

import type { PrecheckQuestionSpec } from './unified-precheck-gate';

/** 情绪五档（顺序即规则层固定优先级 tired>stressed>anxious>sad>celebratory） */
export const MOOD_OPTIONS = ['tired', 'stressed', 'anxious', 'sad', 'celebratory'] as const;
/** 时间窗四档（三个 detector 各自抄了一份 WINDOW 词表 → Wave 1 应收敛成一个问题） */
export const WINDOW_OPTIONS = ['lastWeek', 'thisWeek', 'lastMonth', 'thisMonth'] as const;
/** 品类五档（GuardCategory） */
export const CATEGORY_OPTIONS = ['electronics', 'clothing', 'beauty', 'home', 'food'] as const;
/** 时段四桶（ImpulseTimeWindowId） */
export const TIME_BUCKET_OPTIONS = ['dawn', 'daytime', 'evening', 'lateNight'] as const;
/** 弱信号三型（ShoppingContextSignalType） */
export const CONTEXT_SIGNAL_OPTIONS = ['emotion_reward', 'scarcity_promo', 'wear_replace'] as const;
/** 澄清三槽（ShoppingClarifySlot） */
export const CLARIFY_SLOT_OPTIONS = ['recipient', 'category', 'timing'] as const;

const PARTS = 'src/app/api/chat/parts';

export const PRECHECK_REGISTRY: readonly PrecheckQuestionSpec[] = [
  // ───────── P0 情绪 / 冲动类（守护决策误判代价最高 + 现状词表最痛） ─────────
  {
    // 现状：情绪词 × 购物词双条件共现 → 5 档 mood 走情绪守护卡（三选一路）。
    // 约束：BNPL / 绿色品类 / 数据问答三类更高优先级让路要么写进问句，要么留仲裁层。
    detectorId: 'emotion-shopping-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'emotion-shopping-mood', options: [...MOOD_OPTIONS] },
    ruleRef: `${PARTS}/emotion-shopping-detector.ts`,
  },
  {
    // 现状：购买意图词 + 品类词表 → 24h 微挑战卡。约束：7 天频控是算术（留规则层）。
    detectorId: 'micro-challenge-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'micro-challenge-category', options: [...CATEGORY_OPTIONS] },
    ruleRef: `${PARTS}/micro-challenge-detector.ts`,
  },
  {
    // 现状：非绿品类词表命中 → 推荐卡。约束：payload 的 options[]/why 是 SSOT 词条，留规则层。
    detectorId: 'green-alt-detect',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'green-alt-hit',
      statement: '这条消息的购买对象属于小象在意的非环保品类，值得先给出更环保的替代建议',
    },
    ruleRef: `${PARTS}/green-alt-detect.ts`,
  },
  {
    // 现状：类目词表命中 → 「先看看你已有的」。约束：hoursLabel 服务端按时薪算好，留规则层。
    detectorId: 'reuse-detect',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'reuse-hint',
      statement: '这条消息想买的东西，用户很可能已经拥有同类物品，值得先提示复用',
    },
    ruleRef: `${PARTS}/reuse-detect.ts`,
  },
  {
    // 现状：拦截后反驳词表（「我就要买 / leave me alone」）→ tone 两档走降温卡。
    // 约束：afterGuardCard 是布尔前置门（客户端上行）不是判定，迁 Jev 时必须保持在闸外。
    detectorId: 'pushback-detector',
    source: 'lib',
    question: { kind: 'choice', id: 'pushback-tone', options: ['firm', 'annoyed'] },
    ruleRef: 'src/lib/pushback-detector.ts',
  },
  {
    // 现状：弱信号词表（「想奖励自己」「直播间最后三单」）→ signal × tier，是 v2 §1.1 自认
    // 「维护成本最高」的一张表 = Wave 1 最大收益点。约束：entries[] 词条要展示原词，留规则层。
    detectorId: 'shopping-context-signals',
    source: 'lib',
    question: { kind: 'choice', id: 'context-signal-type', options: [...CONTEXT_SIGNAL_OPTIONS] },
    ruleRef: 'src/lib/shopping-context-intent.ts',
  },

  // ───────── P1 查询类（数据问答族：规则层已稳，收益在长尾泛化） ─────────
  {
    // 现状：小时/时刻短语 + 冲动语境双条件 → canned 脉搏卡（三个纯 Noul 里基线最高的一个）。
    // 约束：内部硬依赖 detectForecastQuery 否决（侦察 §2.1 #2），让路条件要写进问句。
    detectorId: 'guard-pulse-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'guard-pulse-query',
      statement: '用户在问自己「什么时段最容易冲动购物」的节奏问题，且不是求建议、不是问未来预报',
    },
    ruleRef: `${PARTS}/guard-pulse-detector.ts`,
  },
  {
    // 现状：预报问句 + 同文件 detectForecastDayFollowUp 的星期短追问（「那周六呢」，7 档 choice）
    // 同卡处理 → Wave 1 打包时是本单元的第二个问题。约束：回顾型统计与生活话题让路。
    detectorId: 'impulse-forecast-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'forecast-query',
      statement: '用户在问未来某个时间段自己的消费触发规律（回顾型统计与生活话题让路）',
    },
    ruleRef: `${PARTS}/impulse-forecast-detector.ts`,
  },
  {
    // 现状：时段词表 → 时段统计卡。约束：带两槽（时间窗 + 四桶时段），第二个问题用
    // TIME_BUCKET_OPTIONS；与三处 WINDOW 词表拷贝的收敛一并处理。
    detectorId: 'impulse-time-query-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'impulse-time-window', options: [...WINDOW_OPTIONS] },
    ruleRef: `${PARTS}/impulse-time-query-detector.ts`,
  },
  {
    // 现状：品类词表 → 分类对账卡。约束：同带两槽（时间窗 + 品类），第二问用 CATEGORY_OPTIONS。
    detectorId: 'category-query-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'category-query-category', options: [...CATEGORY_OPTIONS] },
    ruleRef: `${PARTS}/category-query-detector.ts`,
  },
  {
    // 现状：统计问句 → 存款对账卡。约束：缺省 thisMonth 的默认值语义要保留，不能问空。
    detectorId: 'savings-query-detector',
    source: 'parts',
    question: { kind: 'choice', id: 'savings-query-window', options: [...WINDOW_OPTIONS] },
    ruleRef: `${PARTS}/savings-query-detector.ts`,
  },
  {
    // 现状：反思引导组件问题原文的精确匹配（trim）→ canned 镜子回复。约束：精确匹配是 SSOT，
    // 语义层只作未登记长尾表述的兜底，不许反过来改写 SSOT 词面。
    detectorId: 'reflection-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'reflection-question',
      statement: '这条消息是邀请用户回顾自己感受与选择的反思提问，不是要小象给答案',
    },
    ruleRef: `${PARTS}/reflection-detector.ts`,
  },
  {
    // 现状：绿色知识词条库三层匹配 → 知识问答卡。约束：命中 id 数组是词条库产物，留规则层，
    // 语义层只答「是否命中」。
    detectorId: 'green-knowledge-query',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'green-knowledge-hit',
      statement: '用户在问关于环保、绿色生活或气候影响的具体知识问题，小象有对应的知识词条',
    },
    ruleRef: 'src/lib/green-knowledge-query.ts',
  },

  // ───────── P2 长尾（富对象 / 抽取 / 状态依赖：收益小或需先拆前置） ─────────
  {
    // 现状：「该买吗 / worth buying」求判断 → 三问决策卡。形状上是纯 Noul 却排 P2：
    // 它与 pushback / commitment 互斥，仲裁表没定之前不许单点先迁（侦察 §5.2 设计题 1）。
    detectorId: 'prepurchase-detect',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'prepurchase-should-i-buy',
      statement: '用户拿不定主意、主动求小象替他判断该不该买（不是已经决定要买，也不是普通咨询）',
    },
    ruleRef: 'src/lib/prepurchase-detect.ts',
  },
  {
    // 现状：陈述式承诺（「这个月不买咖啡了」）→ 承诺卡。约束：subject 是字符串抽取（§1.4
    // 确定性计算留代码）不进 Jev；疑问形态与转述形态一律不命中的互斥要保留。
    detectorId: 'commitment-detector',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'commitment-made',
      statement: '用户第一人称陈述自己决定一段时间不买某样东西（不是问要不要买，也不是转述别人）',
    },
    ruleRef: 'src/lib/commitment-detector.ts',
  },
  {
    // 现状：连接词两侧对象（「iPad 还是安卓平板」）→ 对比卡。约束：sideA/sideB 是抽取不是判断
    // （侦察 §2.2 明确留规则层），Jev 只答「是不是在比较两个对象」。
    detectorId: 'compare-detector',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'compare-two-options',
      statement: '用户在比较两个具体对象之间的取舍（不是只问一个东西好不好，也不是已经决定要买）',
    },
    ruleRef: 'src/lib/compare-detector.ts',
  },
  {
    // 现状：2~12 个对象词切分 → 清单分诊卡。约束：items[] 是字符串数组，choice/score 都问不出，
    // **必须留规则层**；本条只登记「像一份清单」这个判定维度，gate 只做存在性确认。
    detectorId: 'list-triage-detector',
    source: 'parts',
    question: {
      kind: 'noul',
      id: 'list-triage-shape',
      statement: '这条消息一次性列出了一份包含多个待处理对象的清单式诉求',
    },
    ruleRef: `${PARTS}/list-triage-detector.ts`,
  },
  {
    // 现状：购买意图 + 具体物品词 → 重复购买决策卡。约束：itemTitle 抽取留规则层，Jev 只答品类。
    detectorId: 'duplicate-purchase-detect',
    source: 'parts',
    question: { kind: 'choice', id: 'duplicate-purchase-category', options: [...CATEGORY_OPTIONS] },
    ruleRef: `${PARTS}/duplicate-purchase-detect.ts`,
  },
  {
    // 现状：缺槽澄清 → 澄清卡。约束：askedSubjects[] 是会话态上行（侦察 §2.4），迁 Jev 后
    // 只能问槽位、问不了轮次（轮次跟踪留规则层）。
    detectorId: 'shopping-clarify',
    source: 'lib',
    question: { kind: 'choice', id: 'shopping-clarify-slot', options: [...CLARIFY_SLOT_OPTIONS] },
    ruleRef: 'src/lib/shopping-intent-clarify.ts',
  },
  {
    // 现状：绿色替代足迹召回意图（判定是 boolean，本体在 lib）。约束：读 store 的足迹聚合 IO
    // 留规则层，Jev 只答「是否召回」。
    detectorId: 'alt-footprint-intent',
    source: 'lib',
    question: {
      kind: 'noul',
      id: 'alt-footprint-query',
      statement: '用户在问自己过往为了环保替代品付出过什么、替代足迹如何',
    },
    ruleRef: 'src/lib/alt-footprint-intent.ts',
  },
];

/** 判定单元总数（b128 口径：12 住 parts / 8 住 lib = 20） */
export const PRECHECK_REGISTRY_SIZE = 20;

/**
 * 已知判定单元、但**不在** 20 条登记簿里的两条 —— 单列是为了让「为什么没登记」可查，
 * 而不是把它们悄悄忘掉。理由见文件头「计数口径」段。
 */
export const WAVE1_OUT_OF_REGISTRY: readonly { detectorId: string; reason: string }[] = [
  {
    detectorId: 'green-alt-retro-gate',
    reason: '判定器合成器（输入是其他判定器的输出）：必须等它依赖的 6 个数据问答单元先迁（Wave 1 两段式）',
  },
  {
    detectorId: 'follow-up-query',
    reason: '非单轮判定（输入是上一轮数据问答卡的元数据上行），不属「N 个问题打包一次调用」的建模范围',
  },
];

/** 按 id 取登记项（Wave 1 逐个点亮时的查询入口；未登记返回 undefined） */
export function findPrecheckSpec(detectorId: string): PrecheckQuestionSpec | undefined {
  return PRECHECK_REGISTRY.find((spec) => spec.detectorId === detectorId);
}
