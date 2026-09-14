/**
 * shopping-context-intent — 购物场景弱信号检测 (纯函数, batch61-b)
 *
 * 场景: 用户用生活语言表达消费决策, 但消息里没有标准购物关键词 —
 *   情绪奖励型 "想奖励自己 / 犒劳一下自己", 稀缺促销型 "直播间说最后三单 /
 *   不买就亏了", 耗损替换型 "家里那台快坏了 / 又修了三次"。
 * 旧链路对这类表述全部漏接, Letta 自由回复容易错过守护时机; 命中时上层按
 * 信号类型路由到既有能力 (见 parts/context-signal-turn.ts), 不新建流程。
 *
 * 触发克制 (红线):
 * - 只识别消费场景, 不做心理诊断/情绪评分/敏感画像 — 高风险语义 (自伤/临床
 *   词汇) 最先排除, 自然降级到通用聊天
 * - 明确购物意图 (想买/下单/购物车…) → null, 让路 loadLettaTurnContext 内的
 *   BNPL/green/reuse/micro 通用购买预检; 本层只接"没有标准购物关键词"的消息
 * - 完整数据问句 / 问朋友求建议 / 明确拒绝守护 / 不买了 → null
 * - 绿色品类让路: 词表命中 suggestAlternative 时交给既有绿色替代流 (与 60-c
 *   同一款让路); BNPL 支付风险让路; greenPref==='off' 整体静默
 * - 会话纠正: dismissedEntryIds 里的词条本轮不再参与匹配 (用户纠正一次后,
 *   本会话不再重复同信号)
 * - 输出 confidence 与 signal type; 低于触发线 (weak 档) 由调用方放行回
 *   既有 chat 流程, 本函数照样返回识别结果供测试与日志
 */

import { detectBNPL } from '@/lib/bnpl-detector';
import { suggestAlternative } from '@/lib/green-alternatives';
import {
  SHOPPING_CONTEXT_SIGNALS,
  type ShoppingContextSignalEntry,
} from '@/lib/shopping-context-signals';
import type { EmotionMood } from '@/types/emotion-guard';
import type { ShoppingContextSignalType } from '@/types/context-signal';

export type { ShoppingContextSignalType };

/** 触发线 — 置信度达到才路由; weak 档 (0.52) 在线下, direct (0.9) / implicit (0.68) 在线上 */
export const CONTEXT_SIGNAL_TRIGGER_THRESHOLD = 0.6;

/** 置信档位 — direct 直说 / implicit 含蓄 / weak 疑似 (低于触发线, 不触发) */
const TIER_CONFIDENCE: Record<'direct' | 'implicit' | 'weak', number> = {
  direct: 0.9,
  implicit: 0.68,
  weak: 0.52,
};

/** 展示信号词数量上限 — chips 一行放得下 */
export const CONTEXT_SIGNAL_MAX_WORDS = 3;

export interface ShoppingContextIntentDetection {
  signal: ShoppingContextSignalType;
  /** 0~1, 命中词条的最高档位置信度 (保留两位) */
  confidence: number;
  /** 命中词条 (置信度降序, 同档按词表顺序, 最多 MAX_WORDS 个) */
  entries: ShoppingContextSignalEntry[];
  /** emotion_reward 专属: mood 标签 (词条自带提示优先, 缺省 celebratory) */
  mood?: EmotionMood;
}

export interface DetectShoppingContextIntentOptions {
  /** 会话 locale — 绿色品类让路按语言匹配词库 (en 的 takeout 也要让); 缺省 zh */
  locale?: 'en' | 'zh';
  /** 绿色守护开关 (与 chat 请求 body.greenPref 同源): 'off' 时整体静默 */
  greenPref?: 'on' | 'off';
  /** 会话内已被用户纠正的词条 id — 本轮不再参与匹配 (一次纠正, 全会话生效) */
  dismissedEntryIds?: readonly string[];
}

/** 高风险语义 — 自伤/临床词汇不由本流处理 (不做心理评估), 降级通用聊天 */
const HIGH_RISK = /自杀|自残|轻生|不想活|活不下去|想死|伤害自己|抑郁|自杀倾向|suicide|self.?harm|kill myself|end my life|don'?t want to (?:live|be alive)|hurt myself|depress(?:ed|ion|ing)/i;

/** 完整数据问句形态 — 问账是 57-c/58-c/59-c 的地盘, 本层绝不吞 (双保险) */
const QUERY_FORM_ZH = /省了多少|省了几|花了多少|花了几|用了多少|多少钱|几块钱|打几折|拦截了几|拦截过几次/;
const QUERY_FORM_EN = /\bhow (?:much|many) (?:did|have|is|was|do|saved|spent|left|times)\b|\bhow much (?:money|is it)\b|\bwhat'?s the (?:price|total)\b|\bhow many times\b/;

/** 问别人求建议 — 决策主体不在小象, 不触发守护 */
const ADVICE_SEEKING_ZH = /问大家|大家觉得|大家怎么看|你们说|帮我参谋|帮我拿主意|问朋友|问闺蜜|发帖问/;
const ADVICE_SEEKING_EN = /\bask (?:my |the )?(?:friends?|mom|partner|family|group)\b|\bwhat do you (?:guys )?think\b|\bhelp me decide\b|\bpoll (?:my )?friends\b/;

/** 明确拒绝守护 — 用户已经说不, 本层不再插手 */
const REFUSAL_ZH = /别管我|不用管我|别拦我|不用你管|别再拦|别再提建议|别提醒我|别再管/;
const REFUSAL_EN = /\bleave me alone\b|\bstop (?:guarding|nagging|reminding|telling me)\b|\bdon'?t remind me\b|\bstop watching my\b/;

/** 购物否定形态 — 用户已经在说不买不花 ("先不买了"), 不是决策信号 */
const NEGATION_ZH = /不想买|先不买|别买|不剁手|不打算买|暂时不买|不购物|不想花|不乱花/;
const NEGATION_EN = /don'?t want to (?:buy|shop|get|spend)|don'?t wanna (?:buy|spend)|not (?:going to |gonna )?(?:buy|shop)|no (?:buying|shopping)|not buying|won'?t (?:buy|get it)|skip(?:ping)? (?:the )?(?:sale|shopping)/;

/** 明确购物意图 (强动词) — 有标准关键词的消息归通用购买预检 (BNPL/green/reuse/micro) */
const EXPLICIT_INTENT_ZH = /想买|要买|去买|买点|买个|买些|买台|买支|买件|买双|买盒|买瓶|买袋|剁手|下单|购物车|结算|入手|想换新|想换(?:个|台|部|只|副)?新/;
const EXPLICIT_INTENT_EN = /\bbuy\b|\bbuying\b|\bbought\b|\bshop\b|\bshopping\b|\bcheckout\b|\bcheck(?:ing)? out\b|\bpurchas\w|\badd to cart\b|\bin (?:my|the) cart\b|\bpick(?:ing)? (?:something )?up\b|\border(?:ed|ing)? (?:it|one|another|something|this|that|more)\b|\bthinking of (?:buying|getting|ordering)\b/;

/** zh 支付风险词 — BNPL 流更高优先级 (与 60-c 同款让路; en 侧复用 detectBNPL 词库) */
const BNPL_ZH = /先买后付|花呗|白条|分期付款|分期买/;

/** 非物件耗损的同形表达 — 预算/耐心/会员过期不是替换信号 */
const NOT_WEAR_ZH = /(?:预算|额度|余额|耐心|话费|流量|次数|工资|零花钱|钱)[^，。]{0,6}(?:用完|用光|见底)|会员[^，。]{0,4}过期|vip[^，。]{0,4}过期|套餐[^，。]{0,4}过期/;
const NOT_WEAR_EN = /\b(?:ran out of|out of) (?:budget|money|patience|savings|data|spending money)\b|\brunning out of time\b|\btime is running out\b|\bmembership expired\b|\bsubscription (?:has )?expired\b|\bpatience (?:is |has )?(?:run out|used up)\b/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 检测购物场景弱信号。命中返回 {signal, confidence, entries, mood?}, 无信号
 * 返回 null。纯函数: 只做字符串匹配与既有纯检测器复用, 不读库不抛异常,
 * 非字符串/空输入恒 null。是否触发由调用方对照 CONTEXT_SIGNAL_TRIGGER_THRESHOLD。
 */
export function detectShoppingContextIntent(
  userContent: string,
  options: DetectShoppingContextIntentOptions = {},
): ShoppingContextIntentDetection | null {
  const { locale = 'zh', greenPref, dismissedEntryIds } = options;
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = normalize(userContent);

  // 高风险语义最先排除 — 弱信号层不做心理安全响应
  if (HIGH_RISK.test(normalized)) return null;
  // 数据问句/问人/拒绝/否定 → 交还既有链路
  if (QUERY_FORM_ZH.test(normalized) || QUERY_FORM_EN.test(normalized)) return null;
  if (ADVICE_SEEKING_ZH.test(normalized) || ADVICE_SEEKING_EN.test(normalized)) return null;
  if (REFUSAL_ZH.test(normalized) || REFUSAL_EN.test(normalized)) return null;
  if (NEGATION_ZH.test(normalized) || NEGATION_EN.test(normalized)) return null;
  // 明确购物意图 → 让路通用购买预检 (本层只接无标准购物关键词的消息)
  if (EXPLICIT_INTENT_ZH.test(normalized) || EXPLICIT_INTENT_EN.test(normalized)) return null;
  // 非物件耗损同形表达 (预算/耐心/会员过期) → 不是替换信号
  if (NOT_WEAR_ZH.test(normalized) || NOT_WEAR_EN.test(normalized)) return null;
  // BNPL 支付风险让路 — 支付工具诱导拦截优先
  if (BNPL_ZH.test(normalized) || detectBNPL(userContent).detected) return null;
  // 绿色品类让路 — 点名具体品类时既有绿色替代流继续负责 (开关关时绿色不接管, 本层随之静默)
  if (greenPref !== 'off' && suggestAlternative(userContent, locale)) return null;

  const dismissed = new Set(dismissedEntryIds ?? []);
  const hits = SHOPPING_CONTEXT_SIGNALS.filter(
    (entry) => !dismissed.has(entry.id) && (entry.zh.test(normalized) || entry.en.test(normalized)),
  );
  if (hits.length === 0) return null;

  // 词条排序: 置信档降序, 同档按词表顺序 (确定性输出)
  const tierRank = (entry: ShoppingContextSignalEntry) =>
    entry.tier === 'direct' ? 2 : entry.tier === 'implicit' ? 1 : 0;
  const ranked = [...hits].sort(
    (a, b) =>
      tierRank(b) - tierRank(a) ||
      SHOPPING_CONTEXT_SIGNALS.indexOf(a) - SHOPPING_CONTEXT_SIGNALS.indexOf(b),
  );
  const best = ranked[0];
  const entries = ranked
    .filter((entry) => entry.signal === best.signal)
    .slice(0, CONTEXT_SIGNAL_MAX_WORDS);

  const detection: ShoppingContextIntentDetection = {
    signal: best.signal,
    confidence: TIER_CONFIDENCE[best.tier],
    entries,
  };
  if (detection.signal === 'emotion_reward') {
    detection.mood = entries.find((entry) => entry.mood)?.mood ?? 'celebratory';
  }
  return detection;
}
