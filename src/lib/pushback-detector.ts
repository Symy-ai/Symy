/**
 * pushback-detector — 拦截后的反驳意图检测 (纯函数, batch48-b)
 *
 * 场景: 小象刚发出守护卡 (green_alt / reuse_hint / micro_challenge) 后的下一轮,
 * 用户说"我就要买/别拦我/就这一次/leave me alone"。命中时上层不走 Letta 的
 * 重复拦截话术, 改走降温回复 + 24h 冷静卡 (见 parts/cooldown-turn.ts)。
 *
 * 触发克制 (红线):
 * - 本文件只做关键词检测; "上一轮是否发过守护卡"由调用方判断 (afterGuardCard),
 *   普通商品咨询/对比问题即使含"买"也不在此误触发
 * - zh 走包含匹配, en 走词边界匹配 (防 "buyer" 类误中)
 * - tone: annoyed = 用户表达不耐烦 (烦/啰嗦/别说了), 否则 firm
 */

export interface PushbackResult {
  tone: 'firm' | 'annoyed';
}

/** 反驳意图词 — "我决定了, 别拦我" 语义 (不是咨询, 是顶回) */
const PUSHBACK_ZH: readonly string[] = [
  '我就要买',
  '我就要下单',
  '别拦我',
  '别管我',
  '别劝我',
  '就这一次',
  '说了我要买',
  '让我买',
  '我偏要买',
];

const PUSHBACK_EN: readonly RegExp[] = [
  /(?<![\w-])leave me alone(?![\w-])/i,
  /(?<![\w-])just this once(?![\w-])/i,
  /(?<![\w-])(?:don'?t|do not|stop)\s+(?:stop\s+)?me(?![\w-])/i,
  /(?<![\w-])let me (?:buy|order|get) it(?![\w-])/i,
  /(?<![\w-])i (?:really |just )?want (?:to buy|it|this)(?![\w-])/i,
  /(?<![\w-])i'?m (?:still )?(?:buying|getting) (?:it|this)(?![\w-])/i,
];

/** 不耐烦信号 — 命中任意一条则 tone='annoyed' (回复更短更顺从, 少说一个字) */
const ANNOYED_ZH: readonly string[] = ['烦', '啰嗦', '唠叨', '别说了', '闭嘴', '再说我'];
const ANNOYED_EN: readonly RegExp[] = [
  /(?<![\w-])(?:annoying|lecturing|nagging)(?![\w-])/i,
  /(?<![\w-])(?:stop|quit) (?:saying|lecturing|nagging)(?![\w-])/i,
];

/**
 * 检测反驳意图。命中返回 {tone}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectPushback(userContent: string): PushbackResult | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  const isPushback =
    PUSHBACK_ZH.some((w) => normalized.includes(w)) ||
    PUSHBACK_EN.some((p) => p.test(normalized));
  if (!isPushback) return null;

  const isAnnoyed =
    ANNOYED_ZH.some((w) => normalized.includes(w)) ||
    ANNOYED_EN.some((p) => p.test(normalized));
  return { tone: isAnnoyed ? 'annoyed' : 'firm' };
}
