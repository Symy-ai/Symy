/**
 * prepurchase-detect — 「买前三问」求问意图检测 (纯函数, batch50-a)
 *
 * 场景: 用户自己拿不定主意, 主动来找小象 — "我该买这双鞋吗 / 这个值得买吗 /
 * should I buy this"。命中时上层不走 Letta 泛泛建议, 改走 canned 迎接回复 +
 * 三问决策卡 (见 parts/prepurchase-turn.ts)。
 *
 * 触发克制 (红线):
 * - 只匹配「求判断」语义 (该买吗/值得买吗/要不要买/该不该买), 普通商品
 *   咨询 ("帮我找个包"/"买什么耳机好") 不命中
 * - "我就要买" 是 48-b 反驳 (pushback) 语义, 在此必须不命中 (两流互斥)
 * - zh 走包含匹配, en 走词边界匹配 (防 "buyer" 类误中)
 */

export interface PrepurchaseIntent {
  /** 命中意图即可; 物品主题不做提取 (卡片用通用文案) */
  kind: 'should_i_buy';
}

/** 求问意图模式 — 「帮我判断该不该买」语义 (咨询, 不是顶回)。
 *  zh 用正则容许物品插在中间 ("该买这双鞋吗"), 但要求疑问形态
 *  (该不该 / …吗 / 要不要) — "该买什么好" 类求推荐不命中。 */
const SHOULD_BUY_ZH: readonly RegExp[] = [
  /该不该(?:买|入手)/,
  /该(?:买|入手).{0,12}吗/,
  /值得(?:买|入手)吗/,
  /要不要买/,
  /买它值不值/,
];

const SHOULD_BUY_EN: readonly RegExp[] = [
  /(?<![\w-])should i buy(?![\w-])/i,
  /(?<![\w-])should i get (?:it|this|the)(?![\w-])/i,
  /(?<![\w-])is it worth buying(?![\w-])/i,
  /(?<![\w-])worth buying(?![\w-])/i,
  /(?<![\w-])should i pull the trigger(?![\w-])/i,
];

/**
 * 检测买前三问求问意图。命中返回 {kind}, 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectPrepurchaseIntent(userContent: string): PrepurchaseIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();

  // 反驳语义 ("我就要买") 属于 48-b 冷静卡流, 优先排除 — 两流互斥
  if (/(我就要买|我就要下单|让我买|leave me alone|let me buy)/i.test(normalized)) {
    return null;
  }

  const matched =
    SHOULD_BUY_ZH.some((p) => p.test(normalized)) ||
    SHOULD_BUY_EN.some((p) => p.test(normalized));
  return matched ? { kind: 'should_i_buy' } : null;
}
