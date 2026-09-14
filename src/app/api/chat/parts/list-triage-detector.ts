/**
 * list-triage-detector — 购物清单批量分诊检测 (纯函数, batch57-a)
 *
 * 场景: 用户一次甩出一张购物清单 — "周末要买这些：洗衣液、一双跑鞋、
 * 给爸妈的礼物、一个新键盘"。多对象消息不命中任何单对象 detector,
 * 这里识别列举句式并抽出 ≥2 个对象词, 上层改走 canned 迎接回复 +
 * 清单分诊卡 (见 parts/list-triage-turn.ts)。
 *
 * 触发克制 (红线):
 * - 单对象消息不触发 (留给 50-a 三问 / 56-a 对比等既有单对象流)
 * - 更强意图让路: 反驳 (48-b) / 承诺 (53-a) / 单对象求问 (50-a) / 对比
 *   (56-a) 在 detector 内排除 + route 链序在后, 双保险
 * - 陈述已买完的回顾句 ("昨天买了A、B、C 都到了") 不是决策时刻, 不触发
 * - 列举本身不足: 还需购物语境信号 (买/购/清单/these/帮我看), 纯爱好
 *   列举 ("我喜欢跑步、游泳、爬山") 不触发
 */

export interface ListTriageIntent {
  /** 清单条目对象词 (已去前缀量词/动词, 2~12 条) */
  items: string[];
}

/** 更强意图让路 — 反驳 / 承诺 / 单对象求问 / 对比 (与 compare-detector 同源) */
const YIELD_PATTERNS: readonly RegExp[] = [
  /(我就要买|我就要下单|让我买|别拦我|别劝我)/,
  /(不买|不囤).{0,12}(了|啦)/,
  /(该不该买|该不该入手|值得买吗|要不要买)/,
  /(还是|或者|或是)/, // 对比连接词 → 56-a 对比流
  /(?<![\w-])(?:leave me alone|let me buy|no more|not buying|won'?t buy|stop buying)(?![\w-])/i,
  /(?<![\w-])(?:should i buy|is it worth)(?![\w-])/i,
  /\s+vs\.?\s+/i,
];

/** 陈述已买 / 回顾句 — 已下单的清单不是决策时刻 */
const BOUGHT_PATTERNS: readonly RegExp[] = [
  /(已经买了|已经下单|刚买了|已下单|买回来了|买完了|都买了|上次买|昨天买|上周买)/,
  /(?<![\w-])(?:i (?:already )?(?:bought|ordered|got)|just bought|already ordered)(?![\w-])/i,
];

/** 购物语境信号 — 列举之外还需要"要买"的意图, 排除纯爱好列举 */
const SHOPPING_CONTEXT: readonly RegExp[] = [
  /(买|购|清单|这些|下单|补货|囤)/,
  /(?<![\w-])(?:buy|buying|get|getting|order|ordering|shopping|list|these|restock|stock up)(?![\w-])/i,
];

/** 条目分割: 换行 / 顿号 / 分号 / 序号 / 明确连接词 (zh 逗号不在内 — 单句逗号不是列举) */
const SPLIT_RE_ZH = /[\n、；;]+|(?:，|,)?\s*(?:然后|还有|以及|再加上)|\s+(?:and then|and also|then also|plus)\s+/gi;
/** en 补充: 逗号 + " and " 分割 (仅当语境是购物清单时) */
const SPLIT_RE_EN = /[\n;]+|,\s*|\s+\band\b\s+/gi;
/** 序号前缀 (1. / 1、 / 1) / - / * / •) */
const ORDINAL_PREFIX_RE = /^(?:\d+[.、)．]?\s*|[-*•]\s*|①②③④⑤⑥⑦⑧⑨⑩)/;

/** zh 数量+量词前缀 ("一双/一个/两瓶") — 条目词只要对象本身 */
const ZH_MEASURE_PREFIX_RE = /^(?:[一二两三四五六七八九十几\d]+(?:个|只|支|件|双|条|款|台|部|包|瓶|箱|杯|张|把|套|本|盒|袋|罐|块|头|匹|辆|副|双))+/u;
/** 条目前缀动词/主语闲词 */
const LEADING_FILLER_RE = /^(?:我|我们|帮我|帮忙|还|也|又|再|要|想|想要|需要|去|买|购|采购|补)\s*/u;
/** 量词残根 (数词已被量词前缀吃掉时的光杆量词, "个键盘") */
const BARE_MEASURE_RE = /^(?:个|只|支|件|双|条|款|台|部|包|瓶|箱|杯|张|把|套|本|盒|袋|罐|块|辆|副)+/u;
const EN_LEADING_FILLER_RE = /^(?:i\s+(?:want|need|would like)\s+to\s+|help\s+me\s+|buy\s+|get\s+|order\s+|some\s+|a\s+|an\s+|the\s+|new\s+)/i;
/** 条目尾缀清理 */
const TRAILING_RE = /[。．.!！?？~～,，、;；\s]+$/u;

function cleanItem(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // 清单引语冒号 ("周末要买这些：洗衣液") — 取最后一个冒号后的对象词
  const colonIdx = Math.max(s.lastIndexOf('：'), s.lastIndexOf(':'));
  if (colonIdx >= 0) s = s.slice(colonIdx + 1);
  s = s.replace(ORDINAL_PREFIX_RE, '');
  // 前缀闲词逐层剥离 ("要买个键盘" → 要 → 买 → 个(量词) → 键盘), 最多 4 轮防死循环
  for (let i = 0; i < 4; i++) {
    const stripped = s
      .replace(ZH_MEASURE_PREFIX_RE, '')
      .replace(LEADING_FILLER_RE, '')
      .replace(BARE_MEASURE_RE, '')
      .replace(EN_LEADING_FILLER_RE, '');
    if (stripped === s) break;
    s = stripped;
  }
  s = s.replace(TRAILING_RE, '');
  s = s.trim();
  if (!s || s.length < 2 || s.length > 24) return null;
  // 纯疑问/客套尾巴 ("呢/吗/谢谢") 不是条目
  if (/^(?:呢|吗|哈|嗯|好|谢谢|多谢|thanks|ok)$/.test(s.toLowerCase())) return null;
  return s;
}

/**
 * 检测购物清单批量意图。命中返回 {items} (≥2 条去重条目), 未命中返回 null。
 * 纯函数: 只做字符串匹配, 不读状态不抛异常, 非字符串/空输入恒 null。
 */
export function detectListTriage(userContent: string): ListTriageIntent | null {
  if (typeof userContent !== 'string' || userContent.trim().length === 0) return null;
  const normalized = userContent.replace(/\r\n/g, '\n').trim();
  const lower = normalized.toLowerCase();

  // 更强意图让路 + 已买回顾句不触发
  if (YIELD_PATTERNS.some((p) => p.test(lower))) return null;
  if (BOUGHT_PATTERNS.some((p) => p.test(lower))) return null;
  // 购物语境信号: 没有买卖意图的列举不是购物清单
  if (!SHOPPING_CONTEXT.some((p) => p.test(lower))) return null;

  // 先按 zh 强列举分割 (换行/顿号/序号/连接词); 命中 ≥2 条即清单
  const zhSegments = normalized.split(SPLIT_RE_ZH).map(cleanItem).filter((s): s is string => !!s);
  // zh 未成清单时, en 形态再试 (逗号/and 分割)
  const segments =
    zhSegments.length >= 2
      ? zhSegments
      : normalized.split(SPLIT_RE_EN).map(cleanItem).filter((s): s is string => !!s);

  if (segments.length < 2) return null;
  const seen = new Set<string>();
  const items: string[] = [];
  for (const seg of segments) {
    const key = seg.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(seg);
    if (items.length >= 12) break; // 超长清单截断, 防滥用
  }
  if (items.length < 2) return null;
  return { items };
}
