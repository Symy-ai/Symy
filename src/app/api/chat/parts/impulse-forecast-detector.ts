/**
 * impulse-forecast-detector — "下周容易冲动吗" 预报问句检测 (纯函数, batch62-c)
 *
 * 用户往前问 ("下周容易冲动吗 / 这几天什么时候危险 / next week risk")
 * 命中时上层不走 Letta, 改走 canned 预报卡 (parts/impulse-forecast-turn.ts),
 * 数字复用 lib/impulse-forecast 的 forecastImpulseRisk (次数/天数/时段 only,
 * 提前准备框架, 非羞辱框架)。
 *
 * 触发克制 (红线):
 * - 必须有「前瞻时间词」(下周/未来七天/next week…) + 风险语境 (冲动/危险/
 *   容易/risk…), 二者联合才命中 — 天气/日程/纯心理讨论让路, 回顾型统计
 *   问句 ("这几天冲动买了几次") 让回 57-c/58-c
 * - 更强购物意图让路; "帮别人问" 不触发 (与 57-c/58-c 同款)
 * - 完整数据问答永远让位: 本 detector 不含 省了/拦截/几次 形态
 *
 * 单轮追问 (同文件同职责): 预报卡展示后 "那周六呢 / what about Sunday"
 * 由 detectForecastDayFollowUp 接住 — 只认星期几短追问, 品类/时段/时间窗
 * 追问让回 59-c 通用追问流 (单源复用其词表反向排除)。
 */

import { resolveCategoryFromText } from './category-query-detector';
import { resolveImpulseWindowFromText } from './impulse-time-query-detector';

/** 预报聚焦日 — 0=周一 … 6=周日 (与 WEEKDAYS_EN/ZH 同约定) */
export type ForecastDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 更强购物意图让路 (与 57-c/58-c 同款) */
const YIELD_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
  /(想|要|打算)(要|去|买|喝|吃|囤)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying|want to|wanna|going to buy)(?![\w-])/i,
  /\svs\.?\s/i,
];

/** 天气/日程/健康/纯生活话题让路 — 预报只答消费触发规律 */
const OFF_TOPIC_ZH = /(天气|下雨|下雪|气温|台风|降温|升温|日程|会议|排班|班表|课表|行程|感冒|生病|发烧|过敏|失眠|头疼|堵车|塞车)/;
const OFF_TOPIC_EN = /(?<![\w-])(?:weather|raining|snow(?:ing)?|temperature|schedule|meeting|shift)(?![\w-])/i;

/** 回顾型统计问句让回 57-c/58-c — 预报只答未来 */
const RETROSPECTIVE_ZH = /(买了几|拦了几|拦截几|冲动了几|守护了几|省了|多少(次|回|钱))/;
const RETROSPECTIVE_EN = /(?<![\w-])(?:how (?:many|much|often)|saved|win rate)(?![\w-])/i;

/** 帮别人问不触发 */
const ASKING_FOR_OTHERS = /(朋友|同事|同学|家人|别人|她|他们)/;

/** 前瞻时间词 — 往前看才命中 (下周…; 未来/接下来/后面/近 + 七天/一周/几天; 这几天) */
const FORECAST_TIME_ZH = /(下周|下星期|下礼拜|这几天|(?:未来|接下来|后面|近).{0,6}(?:七天|7天|一周|几天))/;
const FORECAST_TIME_EN = /(?<![\w-])(?:next week|the next (?:7|seven) days|next (?:7|seven) days|coming (?:week|days)|the coming days|next few days|rest of the week)(?![\w-])/i;

/** 风险语境 — 消费触发规律, 不是心理状态 */
const RISK_ZH = /(冲动|危险|风险|容易|把持不住|守不住|管不住|乱买|买多|多买|剁手|破戒)/;
const RISK_EN = /(?<![\w-])(?:risky|risk|tempted|tempting|impulse|impulsive|dangerous|vulnerable|slip|overspend)(?![\w-])/i;

/**
 * 检测预报问句。命中返回 true, 未命中返回 null 语义 (false)。
 * 纯函数: 只做字符串匹配, 非字符串/空输入恒 false。
 */
export function detectForecastQuery(userContent: string): boolean {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return false;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return false;
  if (ASKING_FOR_OTHERS.test(normalized)) return false;
  if (OFF_TOPIC_ZH.test(normalized) || OFF_TOPIC_EN.test(normalized)) return false;
  if (RETROSPECTIVE_ZH.test(normalized) || RETROSPECTIVE_EN.test(normalized)) return false;

  const forward = FORECAST_TIME_ZH.test(normalized) || FORECAST_TIME_EN.test(normalized);
  if (!forward) return false;
  return RISK_ZH.test(normalized) || RISK_EN.test(normalized);
}

/** 星期几词 → 聚焦日 (Monday=0); 表序即优先级, 先中先得 */
const DAY_WORD_ZH: ReadonlyArray<{ re: RegExp; day: ForecastDayIndex }> = [
  { re: /周[一]|星期一|礼拜一/, day: 0 },
  { re: /周[二]|星期二|礼拜二/, day: 1 },
  { re: /周[三]|星期三|礼拜三/, day: 2 },
  { re: /周[四]|星期四|礼拜四/, day: 3 },
  { re: /周[五]|星期五|礼拜五/, day: 4 },
  { re: /周[六]|星期六|礼拜六/, day: 5 },
  { re: /周[日天]|星期[日天]|礼拜[日天]/, day: 6 },
];
const DAY_WORD_EN: ReadonlyArray<{ re: RegExp; day: ForecastDayIndex }> = [
  { re: /(?<![\w-])mon(?:day)?(?![\w-])/i, day: 0 },
  { re: /(?<![\w-])tue(?:s(?:day)?)?(?![\w-])/i, day: 1 },
  { re: /(?<![\w-])wed(?:nesday)?(?![\w-])/i, day: 2 },
  { re: /(?<![\w-])thu(?:r(?:s(?:day)?)?)?(?![\w-])/i, day: 3 },
  { re: /(?<![\w-])fri(?:day)?(?![\w-])/i, day: 4 },
  { re: /(?<![\w-])sat(?:urday)?(?![\w-])/i, day: 5 },
  { re: /(?<![\w-])sun(?:day)?(?![\w-])/i, day: 6 },
];

/**
 * 星期几词归一: 先中先得; 无星期词返回 null。
 * 输入应为已归一 (lowercase + 空格折叠) 的字符串。
 */
export function resolveForecastDayFromText(normalized: string): ForecastDayIndex | null {
  for (const { re, day } of DAY_WORD_ZH) {
    if (re.test(normalized)) return day;
  }
  for (const { re, day } of DAY_WORD_EN) {
    if (re.test(normalized)) return day;
  }
  return null;
}

/** 单轮追问长度上限 — 与 59-c 同约定, 超过即携带了别的语义 */
const MAX_DAY_FOLLOW_UP_LENGTH = 30;

/**
 * 检测预报卡后的单日短追问 ("那周六呢 / what about Sunday / 周六")。
 * 命中返回聚焦日 (0-6), 未命中返回 null。
 * 品类/时段/时间窗追问让回 59-c 通用追问流 (词表单源反向排除);
 * 纯函数: 非字符串/空输入恒 null。
 */
export function detectForecastDayFollowUp(userContent: string): ForecastDayIndex | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0 || normalized.length > MAX_DAY_FOLLOW_UP_LENGTH) return null;

  // 更强购物意图 / 帮别人问 / 回顾统计 — 都不是预报追问, 让路
  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return null;
  if (ASKING_FOR_OTHERS.test(normalized)) return null;
  if (RETROSPECTIVE_ZH.test(normalized) || RETROSPECTIVE_EN.test(normalized)) return null;
  // 品类/时段/时间窗词在场上 → 59-c 通用追问的领地, 本 detector 不抢
  if (resolveCategoryFromText(normalized)) return null;
  if (resolveImpulseWindowFromText(normalized)) return null;
  if (/(上[个一]?周|本[个一]?周|上?个月|本月|这个月|last week|this week|last month|this month)/i.test(normalized)) return null;

  return resolveForecastDayFromText(normalized);
}
