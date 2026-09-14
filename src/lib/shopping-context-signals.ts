/**
 * shopping-context-signals — 购物场景弱信号词表 (SSOT, batch61-b)
 *
 * 面子: 小象听得懂生活语言 — "想奖励自己 / 直播间说最后三单 / 家里那台快坏了"
 * 这类没有标准购物关键词、却有明确消费决策信号的表述。
 * 里子: 命中后路由到既有能力 (60-c 情绪卡 / 48-b 冷静卡 / 50-a 三问 + 绿色替代),
 * 高价值对话不再漏接; 词表集中本文件, detector 不散落复制。
 *
 * 设计红线:
 * - 纯数据文件: 只词条 + 匹配模式 + 展示词, 无行为无 IO
 * - 三类信号 (emotion_reward / scarcity_promo / wear_replace) 各覆盖直说
 *   (direct) 与含蓄 (implicit) 表达; weak 档是"疑似但不敢断定"的表达 —
 *   可被识别但置信度低于触发线 (0.6), 不触发不展示
 * - 展示词 (wordZh/wordEn) 会下发到卡面: 禁金额/禁碳数值/禁物品名, 只用
 *   "信号"本身的词 (如 "最后三单"), 展示词含数字时写汉字 (最后三单 ✓)
 * - en 模式一律词边界 (\b), 防 "heartbroken" 类子串误中; zh 模式包含式;
 *   歧义生活短语 (最后一件事/直播间讲段子/不想花钱) 必须不命中 — 由
 *   detector 排除表与本表的模式收窄共同保证, 测试锁定
 * - mood 只属于 emotion_reward 词条, 是稳定感受标签 (60-c 同枚举), 非诊断
 */

import type { EmotionMood } from '@/types/emotion-guard';
import type { ShoppingContextSignalType } from '@/types/context-signal';

/** 置信档位: direct=直说, implicit=含蓄, weak=疑似 (低于触发线) */
export type ContextSignalTier = 'direct' | 'implicit' | 'weak';

export interface ShoppingContextSignalEntry {
  /** 稳定词条 id — 会话纠正 (dismissedContextSignals) 上行的排除键 */
  id: string;
  signal: ShoppingContextSignalType;
  tier: ContextSignalTier;
  /** zh 展示信号词 (卡面 chips 用, 无数字) */
  wordZh: string;
  /** en 展示信号词 */
  wordEn: string;
  /** zh 匹配模式 (包含式, 对 lowercase 后的文本) */
  zh: RegExp;
  /** en 匹配模式 (词边界, 对 lowercase 后的文本) */
  en: RegExp;
  /** emotion_reward 专属: 词条自带的 mood 提示 (60-c 同枚举); 缺省由 detector 兜底 */
  mood?: EmotionMood;
}

/**
 * 三类弱信号词表。匹配时 zh/en 双表都跑 (用户中英混写常见), locale 只影响
 * 绿色品类让路; 命中多词条时取置信度最高档, 展示词按置信度降序最多 3 个。
 * 词条顺序即同档 tie-break 顺序 — 新词条加在对应信号组的末尾, 不重排既有 id。
 */
export const SHOPPING_CONTEXT_SIGNALS: readonly ShoppingContextSignalEntry[] = [
  // ── 情绪奖励型: 用消费奖赏/安抚自己 (直说) ──
  {
    id: 'emotion_reward.treat_self',
    signal: 'emotion_reward',
    tier: 'direct',
    wordZh: '奖励自己',
    wordEn: 'treat myself',
    zh: /奖励自己|犒劳自己|犒赏自己|犒劳一下|犒劳下|得犒劳|要犒劳/,
    en: /\breward myself\b|\btreat myself\b|\btreating myself\b|\bas a (?:little )?treat\b/,
    mood: 'celebratory',
  },
  {
    id: 'emotion_reward.comfort_self',
    signal: 'emotion_reward',
    tier: 'direct',
    wordZh: '哄哄自己',
    wordEn: 'cheer myself up',
    zh: /哄哄自己|哄自己|哄哄我|买开心|让自己开心点/,
    en: /\bcheer myself up\b|\blittle pick.?me.?up\b|\bneed a pick.?me.?up\b/,
    mood: 'sad',
  },
  {
    id: 'emotion_reward.compensate_self',
    signal: 'emotion_reward',
    tier: 'direct',
    wordZh: '补偿自己',
    wordEn: 'make it up to myself',
    zh: /补偿自己|补偿一下自己|给自己补偿/,
    en: /\bmake it up to myself\b|\bcompensate myself\b/,
    mood: 'stressed',
  },
  {
    id: 'emotion_reward.retail_therapy',
    signal: 'emotion_reward',
    tier: 'direct',
    wordZh: '购物疗愈',
    wordEn: 'retail therapy',
    zh: /购物疗法|血拼疗法|购物疗愈/,
    en: /\bretail therapy\b/,
    mood: 'stressed',
  },
  // ── 情绪奖励型 (含蓄) ──
  {
    id: 'emotion_reward.be_good_to_self',
    signal: 'emotion_reward',
    tier: 'implicit',
    wordZh: '对自己好一点',
    wordEn: 'something nice for myself',
    zh: /对自己好一?点|对自己好点/,
    en: /\bsomething nice for myself\b|\bgood to myself\b/,
    mood: 'celebratory',
  },
  {
    id: 'emotion_reward.urge_to_spend',
    signal: 'emotion_reward',
    tier: 'implicit',
    wordZh: '想花点钱',
    wordEn: 'itching to spend',
    zh: /想花(?:一)?点(?:钱)?|想花钱|手痒/,
    en: /\bitch(?:ing)? to spend\b|\bwanna spend\b|\bfeel like spending\b/,
    mood: 'celebratory',
  },
  {
    id: 'emotion_reward.i_deserve_it',
    signal: 'emotion_reward',
    tier: 'implicit',
    wordZh: '我值得',
    wordEn: 'I deserve it',
    zh: /我值得|我配得上/,
    en: /\bi deserve (?:it|this|a|something|better)\b/,
    mood: 'celebratory',
  },
  {
    id: 'emotion_reward.little_indulgence',
    signal: 'emotion_reward',
    tier: 'implicit',
    wordZh: '放纵一下',
    wordEn: 'little splurge',
    zh: /小小奢侈|奢侈一下|放纵一下|小挥霍/,
    en: /\b(?:little|small) (?:splurge|luxury|indulgence)\b|\bindulge (?:a little|myself|tonight)\b/,
    mood: 'celebratory',
  },
  // ── 情绪奖励型 (weak — 识别但不触发) ──
  {
    id: 'emotion_reward.mood_change',
    signal: 'emotion_reward',
    tier: 'weak',
    wordZh: '换换心情',
    wordEn: 'change of pace',
    zh: /换换心情|换个心情|换下心情/,
    en: /\bchange of pace\b|\blift my (?:mood|spirits)\b/,
    mood: 'stressed',
  },

  // ── 稀缺促销型: 逼单/限时/稀缺话术 (直说) ──
  {
    id: 'scarcity_promo.last_units',
    signal: 'scarcity_promo',
    tier: 'direct',
    wordZh: '最后三单',
    wordEn: 'last chance',
    // 不收裸 "最后一件/最后一天" — 日常生活高频歧义 ("最后一件事/假期最后一天");
    // 单/件要带数字, "最后一天"须与优惠词同现
    zh: /最后[一二两三五六七八九\d]+单|最后几单|最后\d+件|最后机会|最后的机会|(?:优惠|秒杀|特价|活动)最后一天|最后一天(?:的)?(?:优惠|秒杀|特价|活动)/,
    en: /last (?:\d+|two|three|few) (?:orders?|pieces?|spots?|slots?|items?|units?)|\blast chance\b|\bfinal call\b|\bfinal hours?\b/,
  },
  {
    id: 'scarcity_promo.flash_window',
    signal: 'scarcity_promo',
    tier: 'direct',
    wordZh: '限时秒杀',
    wordEn: 'flash sale',
    zh: /限时|限量|秒杀|闪购|闪促|开抢|抢购开始/,
    en: /\bflash (?:sale|deal|offer)\b|\blimited.?time\b|\blimited.?stock\b|\btime.?limited\b/,
  },
  {
    id: 'scarcity_promo.low_stock',
    signal: 'scarcity_promo',
    tier: 'direct',
    wordZh: '快抢完了',
    wordEn: 'almost sold out',
    zh: /仅剩|库存告急|要售罄|快售罄|即将售罄|断货了?|快抢完|被抢光/,
    en: /\balmost (?:gone|sold out)\b|\bselling (?:out|fast)\b|\bonly \d+ left\b|\blow stock\b/,
  },
  {
    id: 'scarcity_promo.livestream_push',
    signal: 'scarcity_promo',
    tier: 'direct',
    wordZh: '直播间上链接',
    wordEn: 'livestream push',
    // "直播间" 单说不构成逼单 ("直播间讲段子"), 须带销售语境
    zh: /直播间.{0,12}(?:说|上链接|喊|逼单|憋单|最后|秒杀|优惠|包邮)|上链接|憋单|逼单|主播(?:说|喊)/,
    en: /\blive(?:stream)? (?:host|sale|event|shopping)\b|\bthe host said\b|\badd to cart now\b|\bdrop(?:ping)? (?:now|today)\b/,
  },
  {
    id: 'scarcity_promo.loss_framing',
    signal: 'scarcity_promo',
    tier: 'direct',
    wordZh: '不买就亏',
    wordEn: "don't miss out",
    zh: /不买就亏|错过等一?年|错过不再|再不买就|手慢无|先到先得|过时不候|错过这个村/,
    en: /\bdon'?t miss out\b|\bmiss out\b|\bact now\b|\bwhile (?:supplies|stocks) last\b|\bbefore it'?s gone\b|\btoday only\b/,
  },
  {
    id: 'scarcity_promo.near_checkout',
    signal: 'scarcity_promo',
    tier: 'direct',
    wordZh: '差一点就买完了',
    wordEn: 'almost checked out',
    zh: /差(?:不多|一点|点)就买完|就差付款|就差一步就付/,
    en: /\balmost (?:bought|checked out)\b|\bone click away\b|\bone step from checkout\b/,
  },
  // ── 稀缺促销型 (含蓄) ──
  {
    id: 'scarcity_promo.threshold_push',
    signal: 'scarcity_promo',
    tier: 'implicit',
    wordZh: '凑单满减',
    wordEn: 'free shipping threshold',
    zh: /凑单|满减|折上折|优惠券?快过期|券要过期/,
    en: /\bfree shipping (?:threshold|minimum)\b|\bmore (?:for|to get) free shipping\b|\bcoupon (?:is )?expir(?:ing|es|ed)\b|\bextra \d+% off\b/,
  },
  {
    id: 'scarcity_promo.sale_season',
    signal: 'scarcity_promo',
    tier: 'implicit',
    wordZh: '大促到了',
    wordEn: 'big sale season',
    zh: /双十一|双11|双十二|黑五|黑星期五|年货节|大促/,
    en: /\bblack friday\b|\bcyber monday\b|\bprime day\b|\bboxing day sale\b|\bholiday sale\b/,
  },
  {
    id: 'scarcity_promo.fomo_crowd',
    signal: 'scarcity_promo',
    tier: 'implicit',
    wordZh: '大家都在抢',
    wordEn: 'everyone is grabbing it',
    zh: /都在抢|再不抢就|抢不到|人人都在买/,
    en: /\beveryone'?s (?:buying|grabbing|snatching)\b|\bselling like hotcakes\b|\bflying off the shelves?\b/,
  },
  // ── 稀缺促销型 (weak) ──
  {
    id: 'scarcity_promo.bare_discount',
    signal: 'scarcity_promo',
    tier: 'weak',
    wordZh: '打折了',
    wordEn: 'on sale',
    zh: /打折了|在打折|有优惠了|降价了/,
    en: /\bon sale\b|\bdiscounted\b|\bprice dropped\b/,
  },

  // ── 耗损替换型: 物件耗损引发的替换念头 (直说) ──
  {
    id: 'wear_replace.broken',
    signal: 'wear_replace',
    tier: 'direct',
    wordZh: '快坏了',
    wordEn: 'stopped working',
    zh: /快坏了|要坏了|坏掉了?|摔坏了|用坏了|开不了机/,
    en: /\bstopped working\b|\bbroke down\b|\bquit (?:on me|working)\b|\bwon'?t turn on\b|\bnot turning on\b|\bis broken\b|\bare broken\b|\bis dead\b/,
  },
  {
    id: 'wear_replace.worn',
    signal: 'wear_replace',
    tier: 'direct',
    wordZh: '穿破了',
    wordEn: 'worn out',
    zh: /磨破了|穿破了|起球了?|开线了?|掉漆|生锈|破了个洞|鞋底磨|磨损/,
    en: /\bworn out\b|\bworn through\b|\bfrayed\b|\bhole in my\b|\bfalling apart\b|\bscuffed\b|\bgot rusted?\b|\bis rusted?\b/,
  },
  {
    id: 'wear_replace.used_up',
    signal: 'wear_replace',
    tier: 'direct',
    wordZh: '用完了',
    wordEn: 'ran out',
    zh: /空瓶了?|见底了?|用完了|用光了|快用完/,
    en: /\bran out(?: of)?\b|\brunning out(?: of)?\b|\ball out of\b|\brunning low on\b|\bis almost empty\b/,
  },
  {
    id: 'wear_replace.battery',
    signal: 'wear_replace',
    tier: 'direct',
    wordZh: '电池不行了',
    wordEn: 'battery dying',
    zh: /电池不耐用|电池不行|续航不行|续航崩了?|电池鼓包|电池老化/,
    en: /\bbattery (?:is )?(?:draining|dying|dead|shot)\b|\bbattery doesn'?t last\b|\bkeeps (?:dying|shutting down)\b/,
  },
  {
    id: 'wear_replace.due_replace',
    signal: 'wear_replace',
    tier: 'direct',
    wordZh: '该换了',
    wordEn: 'time to replace it',
    zh: /该换了?|该换新了|是时候换了|该退休了/,
    en: /\btime to (?:replace|retire) (?:it|this|mine|my)\b|\bneeds? replacing\b/,
  },
  // ── 耗损替换型 (含蓄) ──
  {
    id: 'wear_replace.broke_again',
    signal: 'wear_replace',
    tier: 'implicit',
    wordZh: '又坏了',
    wordEn: 'broken again',
    zh: /又坏了|老是坏|三天两头坏|修了又坏|修了[好几两三四]次/,
    en: /\bbroken again\b|\bbroke again\b|\balways breaking\b|\bfixed it (?:twice|three times|\d+ times)\b/,
  },
  {
    id: 'wear_replace.slow_aging',
    signal: 'wear_replace',
    tier: 'implicit',
    wordZh: '越来越卡',
    wordEn: 'getting slow',
    zh: /越来越卡|越来越慢|反应越来越慢|越来越钝/,
    en: /\b(?:getting|so|really) (?:slow|laggy|sluggish)\b|\bslower than it used to\b/,
  },
  {
    id: 'wear_replace.years_old',
    signal: 'wear_replace',
    tier: 'implicit',
    wordZh: '用了好几年',
    wordEn: 'had it for years',
    zh: /用了[一两二三四五六七八九十几\d]+年|用了好久|服役多年|用了太多年/,
    en: /\b(?:had|owned|used) (?:it|this|mine) for (?:\d+|years)\b|\bfor years now\b|\bgoing on \d+ years\b/,
  },
  {
    id: 'wear_replace.expired',
    signal: 'wear_replace',
    tier: 'implicit',
    wordZh: '过期了',
    wordEn: 'expired',
    zh: /过期了|临期了?|到保质期了/,
    en: /\bexpired\b|\bpast the expir(?:y|ation)\b/,
  },
  // ── 耗损替换型 (weak) ──
  {
    id: 'wear_replace.getting_old',
    signal: 'wear_replace',
    tier: 'weak',
    wordZh: '有点旧了',
    wordEn: 'getting old',
    zh: /有点旧了|挺旧了|很旧了|变旧了/,
    en: /\b(?:kinda|kind of|pretty|getting) old\b|\bseen better days\b/,
  },
];

/** SSOT 自检 (编译期不变量, import 即校验):
 *  1. 词条 id 唯一 (会话纠正上行以 id 为键, 重复会误伤)
 *  2. 展示词无阿拉伯数字 (卡面红线: 数字只允许出现在既有 private 数据卡)
 */
const _seenIds = new Set<string>();
for (const entry of SHOPPING_CONTEXT_SIGNALS) {
  if (_seenIds.has(entry.id)) {
    throw new Error(`shopping-context-signals: duplicate entry id "${entry.id}"`);
  }
  _seenIds.add(entry.id);
  if (/\d/.test(entry.wordZh) || /\d/.test(entry.wordEn)) {
    throw new Error(`shopping-context-signals: display word must be digit-free ("${entry.id}")`);
  }
}
