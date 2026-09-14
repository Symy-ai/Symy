/**
 * compare-detector — A vs B 对比购买意图检测 (纯函数, batch56-a)
 *
 * 场景: 用户在对话里问二选一 — "买 iPad 还是安卓平板 / refurbished vs new /
 * 该选 A 还是 B"。命中时上层不走 Letta, 改走 canned 迎接回复 + 对比裁决卡
 * (见 parts/compare-turn.ts), 用户点选后才落 health_events。
 *
 * 触发克制 (红线):
 * - 只匹配「问哪个」的求问形态; 陈述已买 ("我买了A还是B" 类纠结复盘 /
 *   "已经下单了") 不命中 — 那不是决策时刻
 * - 反驳 ("我就要买") 属 48-b 冷静卡流、口头承诺 ("这个月不买X") 属 53-a
 *   承诺流、单对象求问 ("该买 X 吗") 属 50-a 三问流 — 三流更强, 在此让路
 *   (互斥由本 detector 的排除模式 + route 链顺序共同保证)
 * - 无关 "还是" 连词 ("我还是算了" / "还是先看看") 不命中 — 连词后无真实
 *   第二对象 (排除词表)
 * - zh 走包含/捕获匹配, en 走连接词分割 + 词边界 (防 "buyer" 类误中)
 */

export interface CompareIntent {
  /** 连接词前一侧的对象原词 ("iPad" / "refurbished"); 提取不到时整流不命中 */
  sideA: string;
  /** 连接词后一侧的对象原词 ("安卓平板" / "new") */
  sideB: string;
}

/** 更强意图让路 — 反驳 (48-b) / 承诺 (53-a) / 单对象求问 (50-a) 优先 */
const YIELD_ZH: readonly RegExp[] = [
  /(我就要买|我就要下单|让我买|别拦我|别劝我)/,
  /(不买|不囤).{0,12}(了|啦)/, // 承诺语义 ("这个月不买咖啡了") 是陈述不是求问
  /(该不该买|该不该入手|值得买吗|要不要买)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:leave me alone|let me buy|no more|not buying|won'?t buy|stop buying)(?![\w-])/i,
  /(?<![\w-])(?:should i buy|is it worth)(?![\w-])/i,
];

/** 陈述已买 — 已下单的纠结不是决策时刻 */
const BOUGHT_ZH: readonly string[] = ['已经买了', '已经下单', '刚买了', '已下单', '买回来了'];
const BOUGHT_EN: readonly RegExp[] = [
  /(?<![\w-])(?:i (?:already )?(?:bought|ordered|got)|just bought)(?![\w-])/i,
];

/** 无关 "还是/或者" 连词 — 后面跟的不是第二对象 */
const FILLER_ZH: readonly string[] = [
  '算了', '先看看', '再看看', '再想想', '不买了', '算了叭', '先不买', '观望',
];
const FILLER_EN: readonly string[] = ['never mind', 'not yet', 'pass'];

/** 对比连接词 (zh: 还是/或者/或是; en: vs / or — or 需购买语境词护航) */
const EN_CONTEXT = /(?<![\w-])(?:buy|get|choose|pick|should|which|worth|go for)(?![\w-])/i;

function cleanSide(raw: string): string | null {
  const s = raw
    .trim()
    // 前缀闲词: 主语/助动词/动词 ("我/帮我/该/应该/要不要/买/选/要/入手/换")
    .replace(/^(?:我|我们|帮我|帮忙|问|问问|到底|纠结|该|应该|是不是|要不要|想|想要)+/u, '')
    .replace(/^(?:should\s+(?:i|we)|do\s+(?:i|we)|can\s+(?:i|we)|help\s+me|i(?:'m| am)?|we)\s+/i, '')
    .replace(/^(?:buy|get|choose|pick|go\s+for|buying|to\s+buy|买|选|要|入手|换|去)\s*/i, '')
    // 后缀疑问尾巴 ("哪个好/更划算/呢/吗/?")
    .replace(/(?:哪个(?:更|比较)?(?:好|值|划算|推荐|环保)|(?:更|比较)(?:值|划算|好|环保)|求推荐|呢|吗|啊|好|[?？。!！~～])+\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length > 24) return null;
  return s;
}

/**
 * 检测 A vs B 对比购买意图。命中返回 {sideA, sideB}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectCompare(userContent: string): CompareIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  // 更强意图让路 (route 链里它们排在前面, 这里再挡一道保证 detector 独立可用)
  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return null;
  if (BOUGHT_ZH.some((w) => normalized.includes(w)) || BOUGHT_EN.some((p) => p.test(normalized))) return null;
  if (FILLER_ZH.some((w) => normalized.includes(w)) || FILLER_EN.some((w) => normalized.includes(w))) return null;

  // en: "A vs B" 强连接词直接分; "A or B" 需购买语境词护航 (防随口 or 句)
  const vsMatch = /(.{1,32}?)\s+vs\.?\s+(.{1,32}?)(?:[?!.]|$)/i.exec(normalized);
  if (vsMatch) {
    const a = cleanSide(vsMatch[1]);
    const b = cleanSide(vsMatch[2]);
    if (a && b) return { sideA: a, sideB: b };
  }
  const orMatch = /(.{1,32}?)\s+or\s+(.{1,32}?)(?:[?!.]|$)/i.exec(normalized);
  if (orMatch && EN_CONTEXT.test(normalized)) {
    const a = cleanSide(orMatch[1]);
    const b = cleanSide(orMatch[2]);
    if (a && b) return { sideA: a, sideB: b };
  }

  // zh: 还是/或者/或是 分割; 双连接词 ("还是选A还是B") 取最后一个真实分割点
  const zhMatch = /(.{1,24}?)(?:还是|或者|或是)(.{1,24}?)(?:[。！!～?？]|$)/u.exec(normalized);
  if (zhMatch) {
    const a = cleanSide(zhMatch[1]);
    const b = cleanSide(zhMatch[2]);
    if (a && b) return { sideA: a, sideB: b };
  }

  return null;
}
