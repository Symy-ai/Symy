/**
 * green-query-normalize — zh 口语插入语归一化 (batch69-a, 纯函数)
 *
 * zh 口语高频在动宾之间插量词/指示词/新旧形容词: "买个沙发 / 想买个新沙发 /
 * 买新沙发 / 囤点洗衣液"。green-alternatives 的 trigger 是动宾连写 ("买沙发" /
 * "囤洗衣液"), 刚性子串匹配会静默漏检 (QA wool-report 发现 #1; 囤系为
 * batch76-a 补入)。这里把购买动词与名词之间的这类插入成分剥掉, 产出仅供
 * 匹配用的查询串:
 *   normalizeGreenQuery("想买个新沙发") === "想买沙发"
 *   normalizeGreenQuery("囤点洗衣液") === "囤洗衣液"
 *
 * 红线:
 * - 只服务匹配, 不改用户原文、不产出任何文案。
 * - 仅 zh: 查询不含 CJK 时原样返回 (en 无该结构); 中英混排按 zh 处理。
 * - 插入成分后必须还有名词残余 (lookahead), "以旧换新 / 买单 / 想买个 / 不想买"
 *   不受影响; "新" 在 "买新课 / 换新机" 里是语义负载词, 由调用方
 *   (green-alternatives 先原文后归一化的两遍匹配) 兜住, 本函数不做取舍。
 */

/** 购买/置换/囤货动词 (长词在前, 防 "想买" 被 "买" 抢切) */
const PURCHASE_VERB = "(?:想买|要买|置换|囤|换|买)";

/** 动宾间高频插入成分: 量词/指示词/新旧形容词 (长词在前; "点/些" 为囤货系约量, batch76-a) */
const INSERTION_TOKEN =
  "(?:一个|这个|那个|新的|全新|二手|一只|一台|一部|一件|一张|一套|一副|一双|一辆|一批|一箱|一门|个|只|台|部|件|张|套|副|双|新|辆|批|箱|门|点|些)";

/** 动词 + 插入语连串 + 至少一名词残余; g: 一句里多组动宾各自剥离 */
const INSERTION_BETWEEN_RE = new RegExp(
  `(${PURCHASE_VERB})${INSERTION_TOKEN}+(?=.)`,
  "g",
);

/** 含 CJK 才视为 zh 查询 */
const CJK_RE = /[\u4e00-\u9fff]/;

export function normalizeGreenQuery(query: string): string {
  if (typeof query !== "string" || !CJK_RE.test(query)) return query;
  return query.replace(INSERTION_BETWEEN_RE, "$1");
}
