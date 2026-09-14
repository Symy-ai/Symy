/**
 * content-gate — 社区信息流 QA 测试数据过滤 (纯显示层)
 *
 * 背景: 内部 QA 回归时插的测试条目 ("QA138-GRANT后UI提交验证" 等) 泄漏进
 *   守护林「今日觉察」社区流。数据库铁律: 只能由用户自己删 — 这里只做
 *   「不返回/不渲染」, 不动任何行。
 *
 * 判定 (保守, 宁漏勿伤):
 *   1. 行首编号前缀: QA|TEST + 编号, 或「测试」+ 数字/分隔符
 *      → "QA138-GRANT验证-直插" / "TEST_02 add flow" / "测试-不要显示"
 *      拉丁前缀必须带编号 — "qa quality time" / "test new recipe" 不受影响。
 *   2. 编号模式: 词边界 QA|TEST + ≥2位数字嵌在句中
 *      → "验证 QA138 直插" 这类编号
 */

/** QA/TEST 编号条目判定 — 命中即不进社区流 */
export function isQaTestData(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 行首拉丁前缀必须紧跟编号 (QA138-… / TEST_02 … / test:3 …), 避免 "qa quality time" 误伤
  if (/^(?:QA|TEST)\d+[-_: ]?/i.test(trimmed)) return true;
  if (/^(?:QA|TEST)[-_: ]\d+/i.test(trimmed)) return true;
  // 行首「测试」+ 数字/分隔符 (测试-… / 测试5 …)
  if (/^测试[\d\-_: ]/.test(trimmed)) return true;
  // 词边界编号嵌在句中: "验证 QA138 直插"
  if (/\b(?:QA|TEST)\d{2,}\b/i.test(trimmed)) return true;
  return false;
}

/** 一条社区流条目的所有文案字段都过一遍 gate (text / text_zh 任一命中即滤掉) */
export function isGatedFeedEntry(fields: Array<string | null | undefined>): boolean {
  return fields.some((field) => isQaTestData(field ?? ''));
}
