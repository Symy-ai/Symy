/**
 * follow-up-query — 数据问答的一轮追问跟随检测与上文解析 (纯 lib, batch59-c)
 *
 * 57-c/58-c 的数据问答是一问一答即止: "那上个月呢" "那外卖呢" 这类短追问
 * 落空。本 lib 给问答流加一轮跟随:
 *   - detectFollowUpQuery(text): 识别时间追问 (上月/上周…) 与维度切换追问
 *     (裸品类词 奶茶/外卖… 复用 category-query-detector 词表; 裸时段词
 *     晚上/深夜… 复用 impulse-time-query-detector 词表 — 单源引用不复制)
 *   - resolveFollowUpContext(prevTurn, followUp): 用上一条数据问答卡的
 *     窗口/维度元数据推出重算参数 — 时间追问继承维度换窗口, 维度追问继承
 *     窗口换维度, 两者都给则都换。无上文时返回 null (回落普通检测链,
 *     绝不拿空窗口算数)。
 *
 * 触发克制 (红线):
 * - 只认「短追问」: 归一后长度 ≤ 30, 且不含问数字形态 (几次/多少/how many…)
 *   — 完整问句 ("上个月省了多少") 天然让回 57-c/58-c 完整检测
 * - 更强购物意图让路 (与 58-c 同款排除 + 想/要买语境): "想喝奶茶" 是购物
 *   意图, 不是换维度追问
 * - 时间词只映射 57-c/58-c 已支持的四个窗口 (上季度按需求近似取上月);
 *   "今年/年初至今" 需要年窗聚合新算术路径, 与红线冲突, 不在本轮支持
 */

import { resolveCategoryFromText } from './category-query-detector';
import { resolveImpulseWindowFromText } from './impulse-time-query-detector';
import type { SavingsQueryWindow } from '@/types/savings-query';
import type { DimensionQueryCategory, ImpulseTimeWindowId } from '@/types/dimension-query';

/** 上一条数据问答卡的元数据 (前端会话态上行, 内存级; 缺失即无上文) */
export type PrevDataQueryMeta =
  | {
      kind: 'savings' | 'category' | 'impulse';
      window: SavingsQueryWindow;
      category?: DimensionQueryCategory;
      impulseWindow?: ImpulseTimeWindowId;
    }
  // batch62-c: 预报卡无窗口/维度可继承 — 只作 "那周六呢" 单日追问的资格标记,
  // 由 impulse-forecast-detector 消费; 这里恒回落 null (预报无时间窗语义)
  | { kind: 'forecast' };

/** 追问检测结果 — 三槽任一非空才返回, 全空返回 null */
export interface FollowUpQueryIntent {
  timeWindow?: SavingsQueryWindow;
  category?: DimensionQueryCategory;
  impulseWindow?: ImpulseTimeWindowId;
}

/** 重算参数 — 追问解析后的完整 (kind, window, dimension) */
export type ResolvedFollowUp =
  | { kind: 'savings'; window: SavingsQueryWindow }
  | { kind: 'category'; window: SavingsQueryWindow; category: DimensionQueryCategory }
  | { kind: 'impulse'; window: SavingsQueryWindow; impulseWindow: ImpulseTimeWindowId };

/** 更强购物意图让路 (与 58-c 同款) + 想/要买语境 — 裸品类词 + 想买 ≠ 追问 */
const YIELD_ZH: readonly RegExp[] = [
  /(该不该买|该买.{0,6}吗|要不要买|值得买吗)/,
  /还是.{1,24}(好|值|划算|呢|吗|\?|？)/,
  /(想|要|打算)(要|去|买|喝|吃|囤)/,
  /(吃|喝|买|点|订|下单|逛)/,
];
const YIELD_EN: readonly RegExp[] = [
  /(?<![\w-])(?:should i buy|is it worth|worth buying|want to|wanna|i'?ll buy|going to buy)(?![\w-])/i,
  /\svs\.?\s/i,
  /(?<![\w-])(?:eat|eating|buy|buying|order|ordering|get|grab)(?![\w-])/i,
];

/** 帮别人问不触发 (与 57-c/58-c 同款) */
const ASKING_FOR_OTHERS = /(朋友|同事|同学|家人|别人|她|他们)/;

/** 问数字形态 — 含完整问句形态时不走追问流 (让回 57-c/58-c 完整检测) */
const FULL_QUERY_ZH = /(几(次|回|单)|多少|胜率|省了|拦截|拦了|守护了|冲动买|帮我算)/;
const FULL_QUERY_EN = /\b(?:how (?:many|much|often)|win rate|saved|skipped|blocked)\b/i;

/** 追问时间词 → 窗口 (只有四个已支持窗口; 上季度按需求取上月近似) */
const TIMEWORD_ZH: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /上个季度|上个?月/, window: 'lastMonth' },
  { re: /上月/, window: 'lastMonth' },
  { re: /上周|上一周|前一周/, window: 'lastWeek' },
  { re: /本周|这周|这一周/, window: 'thisWeek' },
  { re: /本月|这个月|这月/, window: 'thisMonth' },
];
const TIMEWORD_EN: ReadonlyArray<{ re: RegExp; window: SavingsQueryWindow }> = [
  { re: /(?<![\w-])last (?:month|quarter)(?![\w-])/i, window: 'lastMonth' },
  { re: /(?<![\w-])last week(?![\w-])/i, window: 'lastWeek' },
  { re: /(?<![\w-])(?:this|the) week(?![\w-])/i, window: 'thisWeek' },
  { re: /(?<![\w-])(?:this|the) month(?![\w-])/i, window: 'thisMonth' },
];

/** 短追问长度上限 — 超过即认为携带了别的语义, 让回完整检测 */
const MAX_FOLLOW_UP_LENGTH = 30;

/**
 * 检测短追问。命中返回追问槽位 (时间窗/品类/时段任一), 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectFollowUpQuery(userContent: string): FollowUpQueryIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0 || normalized.length > MAX_FOLLOW_UP_LENGTH) return null;

  // 更强购物意图 / 帮别人问 / 完整问句形态 — 都不是追问, 让路
  if (YIELD_ZH.some((p) => p.test(normalized)) || YIELD_EN.some((p) => p.test(normalized))) return null;
  if (ASKING_FOR_OTHERS.test(normalized)) return null;
  if (FULL_QUERY_ZH.test(normalized) || FULL_QUERY_EN.test(normalized)) return null;

  let timeWindow: SavingsQueryWindow | undefined;
  for (const { re, window: w } of TIMEWORD_ZH) {
    if (re.test(normalized)) {
      timeWindow = w;
      break;
    }
  }
  if (!timeWindow) {
    for (const { re, window: w } of TIMEWORD_EN) {
      if (re.test(normalized)) {
        timeWindow = w;
        break;
      }
    }
  }

  const category = resolveCategoryFromText(normalized) ?? undefined;
  const impulseWindow = resolveImpulseWindowFromText(normalized) ?? undefined;

  if (!timeWindow && !category && !impulseWindow) return null;
  return { ...(timeWindow ? { timeWindow } : {}), ...(category ? { category } : {}), ...(impulseWindow ? { impulseWindow } : {}) };
}

/**
 * 用上一条数据问答卡的元数据解析追问的重算参数。
 * - 时间追问 (只给 timeWindow): 继承上文维度, 换窗口
 * - 维度追问 (给 category/impulseWindow): 继承上文窗口, 换维度 (可跨 kind 切换)
 * - 两者都给: 都换
 * 无上文 (prev 缺失/形状不全) 返回 null — 调用方回落普通检测链, 绝不拿空窗口算数。
 * 纯函数: 不抛异常; prev 形状不全按无上文处理。
 */
export function resolveFollowUpContext(prev: PrevDataQueryMeta | null | undefined, followUp: FollowUpQueryIntent): ResolvedFollowUp | null {
  if (!prev || typeof prev !== 'object') return null;
  // batch62-c: 预报卡上文不参与维度继承 (预报无时间窗语义, 只供单日追问)
  if (prev.kind === 'forecast') return null;
  const { kind, window } = prev;
  if (kind !== 'savings' && kind !== 'category' && kind !== 'impulse') return null;
  if (window !== 'thisWeek' && window !== 'lastWeek' && window !== 'thisMonth' && window !== 'lastMonth') return null;

  const nextWindow = followUp.timeWindow ?? window;

  if (followUp.category) return { kind: 'category', window: nextWindow, category: followUp.category };
  if (followUp.impulseWindow) return { kind: 'impulse', window: nextWindow, impulseWindow: followUp.impulseWindow };
  if (followUp.timeWindow) {
    // 纯时间追问: 继承维度。上文是 category/impulse 但缺维度元数据 → 无从继承, 回落
    if (kind === 'savings') return { kind: 'savings', window: nextWindow };
    if (kind === 'category' && prev.category) return { kind: 'category', window: nextWindow, category: prev.category };
    if (kind === 'impulse' && prev.impulseWindow) return { kind: 'impulse', window: nextWindow, impulseWindow: prev.impulseWindow };
    return null;
  }
  return null;
}
