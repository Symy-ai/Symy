/**
 * savings-query-detector — "这个月省了多少" 问账意图检测 (纯函数, batch57-c)
 *
 * 场景: 用户在对话里直接问账 — "我这个月省了多少？""上周守护了几次？"
 * "我胜率怎么样？"。命中时上层不走 Letta (Letta 看不到聚合数字, 自由回复
 * 只能含糊安慰或编造金额 — AI 报假账比不报更伤信任), 改走 canned 对账卡
 * (见 parts/savings-query-turn.ts), 数字全部来自既有聚合 lib。
 *
 * 触发克制 (红线):
 * - 只匹配「问数字」的求问形态 (多少/几次/胜率/帮我算算账); 陈述句
 *   ("我省钱了") 不命中 — 没在问, 就别抢答
 * - 购物意图 ("该买 X 吗 / A 还是 B / 这周要买这些") 属更强的购物类
 *   detector, 在此让路 (互斥由排除模式 + route 链顺序共同保证)
 * - 问价 ("多少钱一单") 不是问省了多少 — 需省/守护/挽回语境词护航
 * - 时间窗解析: 本周/这周 → thisWeek, 上周 → lastWeek, 本月/这个月 →
 *   thisMonth, 上月/上个月 → lastMonth; 无法解析默认 thisMonth
 *   (周界 Monday-start, 与 weekly-guard-compare 同约定)
 * - zh 走包含匹配, en 走词边界 (小写归一后 includes/regex)
 */

import type { SavingsQueryWindow } from '@/types/savings-query';

export interface SavingsQueryIntent {
  window: SavingsQueryWindow;
}

/** 更强购物意图让路 — 求问/承诺/对比/清单四流在前 (route 链序 + 这里再挡一道) */
const YIELD_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗|帮我看看.{0,8}该不该)/,
  /(不买|不囤).{0,12}(了|啦)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying)(?![\w-])/i,
  /(?<![\w-])(?:no more|not buying|won'?t buy)(?![\w-])/i,
  /\svs\.?\s/i,
];

/** 问账语义 (zh) — 必须是「问数字」形态, 陈述句 (我省钱了) 天然不中 */
const QUERY_ZH: readonly RegExp[] = [
  /省了?多少钱?/,
  /省下?了多少/,
  /省(钱|账)了吗/,
  /守护了?几(次|回|单)/,
  /拦了?几(次|回)/,
  /帮我算(一?算|一下)?.{0,12}(省|账)/,
  /胜率/,
  /挽回.{0,6}多少/,
];

/** 问账语义 (en) — saved / guarded / win rate 求问形态 */
const QUERY_EN: readonly RegExp[] = [
  /how much (?:(?:have|did)\s+i|i['’]?ve)\s+sav(?:e|ed|ings)/i,
  /how much\s+sav(?:ed|ings)/i,
  /my win rate|win rate\s*(?:is|was)?\s*(?:how|\?)?/i,
  /how many times.{0,24}(?:guarded|blocked|intercepted)/i,
  /help me (?:add up|count|calculate).{0,24}(?:saved|savings|guarding|win rate)/i,
];

/** 时间窗 (顺序: 上周/上月 先于 本周/本月; 默认 thisMonth) */
const WINDOW_ZH: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /上周|上一周/, window: 'lastWeek' },
  { re: /本周|这周|这一周/, window: 'thisWeek' },
  { re: /上个?月/, window: 'lastMonth' },
  { re: /本月|这个月|这月/, window: 'thisMonth' },
];
const WINDOW_EN: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /(?<![\w-])last week(?![\w-])/i, window: 'lastWeek' },
  { re: /(?<![\w-])(?:this|the past|past) week(?![\w-])/i, window: 'thisWeek' },
  { re: /(?<![\w-])last month(?![\w-])/i, window: 'lastMonth' },
  { re: /(?<![\w-])(?:this|the) month(?![\w-])/i, window: 'thisMonth' },
];

/**
 * 检测问账意图。命中返回 {window}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectSavingsQuery(userContent: string): SavingsQueryIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  // 更强购物意图让路
  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return null;

  const isZhQuery = QUERY_ZH.some((p) => p.test(normalized));
  const isEnQuery = QUERY_EN.some((p) => p.test(normalized));
  if (!isZhQuery && !isEnQuery) return null;

  // 时间窗: zh/en 各自扫一遍, 先中先得; 无时间词默认本月
  let window: SavingsQueryWindow | null = null;
  for (const { re, window: w } of WINDOW_ZH) {
    if (re.test(normalized)) {
      window = w;
      break;
    }
  }
  if (!window) {
    for (const { re, window: w } of WINDOW_EN) {
      if (re.test(normalized)) {
        window = w;
        break;
      }
    }
  }
  return { window: window ?? 'thisMonth' };
}
