/**
 * alt-footprint-intent — "我的替代足迹"召回意图检测 (纯函数, 零 IO)
 *
 * 用户在 chat 里问自己采纳过哪些绿色替代 ("我做过哪些绿色替代") 时,
 * chat route 返回足迹卡 (alt_footprint 事件)。与 green-knowledge-query
 * (求懂) / green-alt-detect (想买→拦) 互补: 这是"求回忆"。
 *
 * 词表刻意避开裸 "绿色替代"/"alternative" (会被购买/知识链路吞掉),
 * 只收召回问法。zh/en 双语同时匹配 (与 locale 无关)。
 */

const FOOTPRINT_TRIGGERS = {
  zh: [
    '我的替代足迹',
    '替代足迹',
    '我做过哪些绿色替代',
    '我采纳过哪些替代',
    '采纳过哪些绿色替代',
    '采纳了哪些替代',
    '我的绿色替代记录',
    '绿色替代记录',
    '替代记录',
    '我的替代记录',
  ],
  en: [
    'my alternative footprint',
    'alternative footprint',
    'alternatives i took',
    'alternatives i adopted',
    'green alternatives i',
    'green swaps i',
    'my green swaps',
    'swaps i made',
    'my alt adoptions',
    'adoptions so far',
    'my green track record',
  ],
} as const;

/**
 * 检测用户消息是否为替代足迹召回提问。命中 true / 未命中 false。
 * 纯函数: 只做子串匹配, 空输入 false。
 */
export function detectAltFootprintQuery(userContent: string): boolean {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return false;
  const normalized = userContent.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return false;
  return (
    FOOTPRINT_TRIGGERS.zh.some((t) => normalized.includes(t.toLowerCase()))
    || FOOTPRINT_TRIGGERS.en.some((t) => normalized.includes(t))
  );
}
