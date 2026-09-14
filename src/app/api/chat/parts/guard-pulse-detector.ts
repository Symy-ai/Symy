/**
 * guard-pulse-detector — "我什么时候最容易冲动" 小时节奏问句检测 (纯函数, batch68-c)
 *
 * 用户问自己的 hour-of-day 节奏 ("我什么时候最容易冲动 / 哪个时段最容易
 * 破防 / my weakest shopping hour"), 命中时上层不走 Letta, 改走 canned
 * 脉搏卡 (parts/guard-pulse-turn.ts), 数字复用 lib/guard-pulse 的
 * aggregateGuardPulse (小时/次数/天数 only, 看见节奏不是认罪)。
 *
 * 触发克制 (红线):
 * - 必须有「小时/时刻短语」(什么时候/几点/what time/weakest shopping hour…)
 *   + 冲动/购物语境, 二者联合才命中
 * - 完整让位: 更强购物意图、"什么时候买" 式求建议、回顾型统计、帮别人问
 *   不触发; 前瞻时间词让回 62-c 预报; 四桶时段词 (晚上/深夜/白天/早上)
 *   让回 58-c 时段问句; 品类词让回 58-c 分类问句
 */

import { detectForecastQuery } from './impulse-forecast-detector';
import { resolveCategoryFromText } from './category-query-detector';
import { resolveImpulseWindowFromText } from './impulse-time-query-detector';

/** 更强购物意图让路 (与 57-c/58-c/62-c 同款) */
const YIELD_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
  // "什么时候该买/什么时候买划算" 式求建议 — 问的是动作时机, 不是自己的节奏
  // (须带情态动词或建议后缀; "什么时候下单最多" 式节奏问句不误杀)
  /什么时候(该|要|适合|再|才)(买|下单)/,
  /什么时候(买|下单).{0,8}(划算|合适|便宜|值)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying|want to|wanna|going to buy)(?![\w-])/i,
  /\svs\.?\s/i,
  /(?<![\w-])(?:when|what time) should i (?:buy|order|check out)(?![\w-])/i,
];

/** 帮别人问不触发 */
const ASKING_FOR_OTHERS = /(朋友|同事|同学|家人|别人|她|他们)/;

/** 天气/日程/健康等纯生活话题让路 (与 62-c 同款清单 + 通勤/账单等 "高峰" 歧义词) */
const OFF_TOPIC_ZH = /(天气|下雨|下雪|气温|台风|降温|升温|日程|会议|排班|班表|课表|行程|感冒|生病|发烧|过敏|失眠|头疼|堵车|塞车|打车|叫车|网约车|公交|地铁|电费|水费|网费|账单|工资|发薪)/;
const OFF_TOPIC_EN = /(?<![\w-])(?:weather|raining|snow(?:ing)?|temperature|schedule|meeting|shift|commute|subway|train|bus|traffic|bill(?:s)?|salary|payday)(?![\w-])/i;

/** 回顾型统计问句让回 57-c/58-c — 脉搏只答 hour-of-day 节奏 */
const RETROSPECTIVE_ZH = /(买了几|拦了几|拦截几|冲动了几|守护了几|省了|多少(次|回|钱))/;
const RETROSPECTIVE_EN = /(?<![\w-])(?:how (?:many|much|often)|saved|win rate)(?![\w-])/i;

/** 小时/时刻短语 — 问「一天中的什么时候」 */
const HOUR_ZH = /(什么时候|啥时候|啥时间|哪.{0,3}(个小时|小时|时段|时间|钟点)|几点(钟|整)?)/;
const HOUR_EN = /(?<![\w-])(?:what time|what hour|which hour|which time|weakest shopping hour|peak shopping hour|when am i|when do i|when is my)(?![\w-])/i;

/** 冲动/购物语境 — 节奏问句必须有消费触发词, 纯日程问句不沾 */
const RISK_ZH = /(冲动|破防|剁手|把持不住|守不住|管不住|破戒|乱买|买多|多买|失守|失控|下单|购物|高峰)/;
const RISK_EN = /(?<![\w-])(?:impulse|impulsive|tempted|temptation|overspend|spending|spend|shop|shopping|buy|buying|weakest|peak|slip|vulnerable|risk|risky)(?![\w-])/i;

/**
 * 检测小时节奏问句。命中返回 true, 未命中返回 false。
 * 纯函数: 只做字符串匹配, 非字符串/空输入恒 false。
 */
export function detectGuardPulseQuery(userContent: string): boolean {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return false;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return false;
  if (ASKING_FOR_OTHERS.test(normalized)) return false;
  if (OFF_TOPIC_ZH.test(normalized) || OFF_TOPIC_EN.test(normalized)) return false;
  if (RETROSPECTIVE_ZH.test(normalized) || RETROSPECTIVE_EN.test(normalized)) return false;
  // 前瞻时间词 → 62-c 预报的领地 ("这几天/下周 什么时候容易冲动")
  if (detectForecastQuery(normalized)) return false;
  // 四桶时段词 → 58-c 时段问句的领地 ("晚上冲动买的多吗");
  // "time of day" 是 hour-of-day 问句的一部分, 不算时段词
  if (resolveImpulseWindowFromText(normalized.replace(/time of (the )?day/g, ' '))) return false;
  // 品类词 → 58-c 分类问句的领地 ("奶茶什么时候最容易破防")
  if (resolveCategoryFromText(normalized)) return false;

  const hourPhrase = HOUR_ZH.test(normalized) || HOUR_EN.test(normalized);
  if (!hourPhrase) return false;
  return RISK_ZH.test(normalized) || RISK_EN.test(normalized);
}
