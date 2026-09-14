/**
 * emotion-shopping-detector — 情绪×购物共现检测 (纯函数, batch60-c)
 *
 * 场景: 用户带着情绪提起购买 ("今天好累，想买点东西哄自己" / "rough day,
 * I want to treat myself")。旧链路会把这种消息直接当普通购买意图拦截/推荐,
 * 缺少先接住情绪的对话体验。命中时上层走情绪守护卡 (见 parts/emotion-guard-turn.ts),
 * 帮用户在「花钱安慰 / 免费安抚 / 先等 10 分钟」三条路里自己选。
 *
 * 触发克制 (红线):
 * - 双条件共现: 只有情绪无购物、只有购物无情绪 → null, 继续既有路由
 * - 更高优先级规则让路: BNPL 支付风险、绿色替代品类词、数据问答形态 → null
 *   (情绪路径绝不绕过这些既有规则; 路由 source-order 由测试另行锁定)
 * - 高风险语义排除: 自伤/临床词汇 (抑郁/depressed 等) → null, 自然降级到
 *   通用聊天与既有安全原则 — 本流绝不做心理健康诊断/治疗
 * - 输出稳定 mood id (tired/stressed/anxious/sad/celebratory), 不输出病理化标签
 */

import { detectBNPL } from '@/lib/bnpl-detector';
import { suggestAlternative } from '@/lib/green-alternatives';
import type { EmotionMood } from '@/types/emotion-guard';

export interface EmotionShoppingDetection {
  mood: EmotionMood;
}

export interface DetectEmotionShoppingOptions {
  /** 会话 locale — 绿色品类让路需按语言匹配词库 (en 的 takeout/milk tea 也要让); 缺省 zh */
  locale?: 'en' | 'zh';
  /** 绿色守护开关 (与 chat 请求 body.greenPref 同源): 'off' 时绿色品类让路不生效 */
  greenPref?: 'on' | 'off';
}

/**
 * 情绪词表 — zh 与 en 分表, mood 按固定优先级取首个命中 (确定性输出)。
 * 优先级: tired → stressed → anxious → sad → celebratory ("不开心" 先被
 * sad 捕获, 不会落进 celebratory 的裸 "开心")。
 */
const MOOD_PATTERNS: ReadonlyArray<readonly [EmotionMood, RegExp, RegExp]> = [
  ['tired',
    /好累|太累|真累|超累|累死了?|累坏了?|累惨|(?<![积攒])累了|疲惫|疲倦|精疲力尽|筋疲力尽|身心俱疲|困得|睁不开眼/,
    /\btired\b|\bexhausted\b|worn out|\bdrained\b|no energy|so sleepy|long day|rough day|\bweary\b/],
  ['stressed',
    /压力山大|压力大|压力好大|压力太|压得喘不过|喘不过气|透不过气|烦躁|烦死了|好烦|心烦意乱|心累|快崩溃|要崩溃|焦头烂额/,
    /\bstressed\b|\bstressful\b|overwhelmed|burn(?:t|ed) out|too much pressure|can'?t catch a break/],
  ['anxious',
    /焦虑|焦躁|心里不安|不安|忐忑|紧张|心慌|静不下心/,
    /\banxious\b|\banxiety\b|\bnervous\b|\bworried\b|\bon edge\b|panick(?:ing|y)|\buneasy\b/],
  ['sad',
    /难过|伤心|不开心|不高兴|低落|沮丧|失落|委屈|心里难受|心情不好|心情差|心情糟|想哭|郁闷|emo了|好emo|很emo/,
    /\bsad\b|feeling down|feeling low|so down|really down|\bupset\b|\bunhappy\b|\bmiserable\b|\blonely\b|heartbroken|wanna cry|want to cry|feeling blue/],
  ['celebratory',
    /好开心|很开心|太开心|超开心|真开心|开心了|高兴|庆祝|值得庆祝|升职|加薪|发工资|发奖金|发年终|好消息|考试过了?|考过了|面试通过|拿下offer|生日快乐|值得纪念/,
    /\bcelebrat\w*|good news|great news|got the job|got a promotion|got a raise|payday|my birthday|passed the exam|\baced\b|so happy|really happy|worth celebrating/],
];

/** 购物意图词表 (正Intent, 与情绪共现才命中) */
const SHOPPING_INTENT_ZH = /想买|要买|去买|买点|买个|买些|剁手|下单|购物|犒劳|犒赏|奖励自己|哄哄自己|哄自己|给自己买|买给自己|补偿自己|对自己好一点/;
const SHOPPING_INTENT_EN = /\bbuy\b|\bbuying\b|\bshop\b|\bshopping\b|\bsplurge\b|\bretail therapy\b|\btreat(?:ing)? myself\b|\bget(?:ting)? myself\b|\border something\b|\bpick something up\b/;

/** 购物否定形态 — "不想买了" 不是购物意图 (守护体验: 用户已经在说不买) */
const SHOPPING_NEGATION_ZH = /不想买了?|不想再买|别买|先不买|不剁手|不购物/;
const SHOPPING_NEGATION_EN = /don'?t want to (?:buy|shop|get)|not (?:going to |gonna )?(?:buy|shop)|no (?:buying|shopping)|skip (?:the )?shopping|stopped shopping/;

/** zh 支付风险词 — BNPL 流更高优先级 (en 侧复用 detectBNPL 词库) */
const BNPL_ZH = /先买后付|花呗|白条|分期付款|分期买/;

/** 高风险语义 — 自伤/临床词汇不由本流处理, 自然降级到通用聊天 */
const HIGH_RISK = /自杀|自残|轻生|不想活|活不下去|想死|伤害自己|抑郁|自杀倾向|suicide|self.?harm|kill myself|end my life|don'?t want to (?:live|be alive)|hurt myself|depress(?:ed|ion|ing)/i;

/**
 * 检测情绪×购物共现。命中返回 {mood}, 未命中/被更高优先级规则接管返回 null。
 * 纯函数: 只做字符串匹配与既有纯检测器复用, 不读库不抛异常,
 * 非字符串/空输入恒 null。
 */
export function detectEmotionShopping(
  userContent: string,
  options: DetectEmotionShoppingOptions = {},
): EmotionShoppingDetection | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  // 高风险语义最先排除 — 情绪守护卡不做心理安全响应, 保持通用聊天降级
  if (HIGH_RISK.test(normalized)) return null;

  // 情绪词 → 固定优先级取首个 mood
  const mood = MOOD_PATTERNS.find(([, zh, en]) => zh.test(normalized) || en.test(normalized))?.[0];
  if (!mood) return null;

  // 购物意图 (否定形态先行排除) — 只有情绪无购物 → null
  if (SHOPPING_NEGATION_ZH.test(normalized) || SHOPPING_NEGATION_EN.test(normalized)) return null;
  if (!SHOPPING_INTENT_ZH.test(normalized) && !SHOPPING_INTENT_EN.test(normalized)) return null;

  // BNPL 支付风险让路 — 支付工具诱导拦截优先于情绪安抚
  if (BNPL_ZH.test(normalized) || detectBNPL(userContent).detected) return null;

  // 绿色替代让路 — 情绪消息点名具体品类时, 既有绿色推荐继续负责 (开关关时绿色不接管)
  if (options.greenPref !== 'off' && suggestAlternative(userContent, options.locale)) return null;

  return { mood };
}
