/**
 * impulse-time-query-detector — "我晚上冲动买的多吗" 时段问句检测 (纯函数, batch58-c)
 *
 * 用户问自己的冲动购买落在哪个时段 (晚上/深夜…), 命中时上层不走 Letta,
 * 改走 canned 时段统计卡 (parts/impulse-time-query-turn.ts), 数字复用
 * 48-c aggregateImpulseWindows (次数/天数 only, 非羞辱框架)。
 *
 * 触发克制 (红线):
 * - 必须有时段词 + 冲动/买语境 + 求问形态 (吗/多/几/how), 三者联合才命中
 * - 更强购物意图让路; "帮别人问" 不触发 (与 category-query-detector 同款)
 * - 时段词归一到 impulse-window 的四桶; 时间窗默认 thisMonth (与 57-c 同约定)
 */

import type { SavingsQueryWindow } from '@/types/savings-query';
import type { ImpulseTimeWindowId } from '@/types/dimension-query';

export interface ImpulseTimeQueryIntent {
  window: SavingsQueryWindow;
  impulseWindow: ImpulseTimeWindowId;
}

/** 更强购物意图让路 (与 57-c savings-query-detector 同款) */
const YIELD_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying)(?![\w-])/i,
  /\svs\.?\s/i,
];

/** 帮别人问不触发 */
const ASKING_FOR_OTHERS = /(朋友|同事|同学|家人|别人|她|他们)/;

/** 求问形态 — 吗/多/几/How; 时段词 + 买/冲动语境联合才命中 */
const QUERY_ZH = /(吗|呢|多不多|几(次|回)|多少|频率|规律)/;
const QUERY_EN = /\b(?:do i|did i|am i|how often|how many)\b|\?/i;

/** 冲动/购买语境 */
const CONTEXT_ZH = /(冲动|下单|买买买|买)/;
const CONTEXT_EN = /\b(?:impulse|impulsive|buy|buying|shop|shopping|order(?:ing)?)\b/i;

/** 时段词 → impulse-window 桶 (顺序: 深夜词先于泛晚上词) */
const TIMEWORD_ZH: ReadonlyArray<{ re: RegExp; window: ImpulseTimeWindowId }> = [
  { re: /深夜|半夜|凌晨|夜里|后半夜/, window: 'lateNight' },
  { re: /晚上|傍晚|晚间/, window: 'evening' },
  { re: /白天|下午|午后/, window: 'daytime' },
  { re: /早上|清晨|一大早/, window: 'dawn' },
];
const TIMEWORD_EN: ReadonlyArray<{ re: RegExp; window: ImpulseTimeWindowId }> = [
  { re: /(?<![\w-])late at night|late[- ]night|after midnight|middle of the night(?![\w-])/i, window: 'lateNight' },
  { re: /(?<![\w-])(?:in the )?evenings?|at night(?![\w-])/i, window: 'evening' },
  { re: /(?<![\w-])(?:during )?(?:the )?day(?:time)?|afternoons?(?![\w-])/i, window: 'daytime' },
  { re: /(?<![\w-])(?:early )?mornings?|at dawn(?![\w-])/i, window: 'dawn' },
];

/** 时间窗 (与 57-c 同约定, 默认 thisMonth) */
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
 * 时段词归一: 深夜词先于泛晚上词, 先中先得; 无时段词返回 null。
 * batch59-c 起导出 — follow-up-query 的裸时段词追问复用同一张词表 (单源)。
 * 输入应为已归一 (lowercase + 空格折叠) 的字符串。
 */
export function resolveImpulseWindowFromText(normalized: string): ImpulseTimeWindowId | null {
  for (const { re, window: w } of TIMEWORD_ZH) {
    if (re.test(normalized)) return w;
  }
  for (const { re, window: w } of TIMEWORD_EN) {
    if (re.test(normalized)) return w;
  }
  return null;
}

/**
 * 检测时段问句。命中返回 {window, impulseWindow}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 非字符串/空输入恒 null。
 */
export function detectImpulseTimeQuery(userContent: string): ImpulseTimeQueryIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return null;
  if (ASKING_FOR_OTHERS.test(normalized)) return null;
  if (!QUERY_ZH.test(normalized) && !QUERY_EN.test(normalized)) return null;
  if (!CONTEXT_ZH.test(normalized) && !CONTEXT_EN.test(normalized)) return null;

  const impulseWindow = resolveImpulseWindowFromText(normalized);
  if (!impulseWindow) return null;

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
  return { window: window ?? 'thisMonth', impulseWindow };
}
