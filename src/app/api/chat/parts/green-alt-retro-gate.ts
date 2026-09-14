/**
 * green-alt-retro-gate — 复盘触发让位检测 (纯函数, batch68-a)
 *
 * 复盘追问只落在「轻量对话轮」: 用户下一轮输入是新购买意图、紧急求助、
 * 数据问句、或再次点名绿色替代品类时整体让位 (pending 由客户端一次性消费,
 * 不顺延 — 严格满足 "仅采纳后下一轮" 与 "每条采纳只追问一次")。自由文本
 * 回答判定共用同一让位词面 (命中让位 = 用户没在回答, 静默温和结束)。
 *
 * 让位词面全部复用既有 detector (互斥由 detector 内排除 + route 链序双保险):
 * - 新购买意图: classifyShoppingIntent (非 not_purchase) / detectDuplicatePurchase
 * - 数据问句: 问账/分类/时段/预报/守护脉搏/追问跟随六族 detector
 * - 紧急求助: 本模块窄词表 (急用/马上要/urgent...) + 自伤临床词直接让位
 * - 绿色替代再请求: suggestAlternative 命中 (新推荐轮优先, 不与追问抢话)
 */

import { classifyShoppingIntent } from '@/lib/shopping-intent-clarify';
import { suggestAlternative } from '@/lib/green-alternatives';
import { detectDuplicatePurchase } from './duplicate-purchase-detect';
import { detectSavingsQuery } from './savings-query-detector';
import { detectCategoryQuery } from './category-query-detector';
import { detectImpulseTimeQuery } from './impulse-time-query-detector';
import { detectForecastQuery } from './impulse-forecast-detector';
import { detectFollowUpQuery } from './follow-up-query';
import { detectGuardPulseQuery } from './guard-pulse-detector';

/** 紧急求助 (zh/en 窄词表 — 只收时间压力与突发损坏, 日常聊天不误伤) */
const URGENT_ZH = /紧急|急用|很急|好急|加急|马上就要|马上要|今晚就要|今天就要|等着用|等着要|急死了|十万火急/;
const URGENT_EN = /\burgent(?:ly)?\b|\basap\b|\bemergenc\w+\b|need it (?:right )?now|need (?:it|one) today|right away|\bbroken\b.*\bneed\b/i;

/** 高风险语义 — 复盘追问绝不在自伤/临床语境出现 (与 emotion-shopping-detector 同红线) */
const HIGH_RISK = /自杀|自残|轻生|不想活|活不下去|想死|伤害自己|抑郁|自杀倾向|suicide|self.?harm|kill myself|end my life|don'?t want to (?:live|be alive)|hurt myself|depress(?:ed|ion|ing)/i;

/**
 * 购买意图窄词表 — classifyShoppingIntent 要求第一人称标记, "想买一个新水杯"
 * 这类无主语购买句会漏; 复盘让位宁可保守 (有购买语义就不追问)。否定形态
 * ("不想买了 / 别买了") 是守护胜利不是购买意图, 排除。
 */
const PURCHASE_ZH = /想买|要买|打算买|准备买|去买|买个|买一个|买一点|来一[套份]|下单|剁手|入手/;
const PURCHASE_EN = /\bbuy\b|\bbuying\b|\bpurchas\w+\b|\bshop(?:ping)? for\b|\border(?:ing)?\b/i;
const PURCHASE_NEGATION_ZH = /不想买了?|不想再买|别买了?|不再买|不剁手/;
const PURCHASE_NEGATION_EN = /don'?t want to (?:buy|shop)|not (?:buying|going to buy)|no more buying|stopped shopping/;

function isUrgentHelp(text: string): boolean {
  return URGENT_ZH.test(text) || URGENT_EN.test(text) || HIGH_RISK.test(text);
}

function isDataQuery(text: string): boolean {
  return (
    detectSavingsQuery(text) !== null ||
    detectCategoryQuery(text) !== null ||
    detectImpulseTimeQuery(text) !== null ||
    detectForecastQuery(text) ||
    detectFollowUpQuery(text) !== null ||
    detectGuardPulseQuery(text)
  );
}

function isPurchaseIntent(text: string, locale: 'en' | 'zh'): boolean {
  if (PURCHASE_NEGATION_ZH.test(text) || PURCHASE_NEGATION_EN.test(text)) return false;
  if (PURCHASE_ZH.test(text) || PURCHASE_EN.test(text)) return true;
  if (detectDuplicatePurchase(text)) return true;
  return classifyShoppingIntent({ message: text, locale }).confidence !== 'not_purchase';
}

/**
 * 复盘是否应让位 (true = 本轮不追问/不把消息当回答)。
 * 纯函数: 只做字符串匹配与既有纯 detector 复用, 不读库不抛异常;
 * 非字符串/空白输入恒 true (不问)。
 */
export function shouldDeferGreenAltRetro(userContent: string, locale: 'en' | 'zh'): boolean {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return true;
  const text = userContent.trim();
  if (isUrgentHelp(text)) return true;
  if (isDataQuery(text)) return true;
  if (isPurchaseIntent(text, locale)) return true;
  // 绿色替代再请求: 新推荐轮优先 — 追问不给新建议抢话
  if (suggestAlternative(text, locale)) return true;
  return false;
}
