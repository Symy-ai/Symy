/**
 * reasoning-leak-guard — 气泡正文「思考链泄漏」兜底过滤器 (P0 信任修复)
 *
 * 背景: 个别模型/网关组合会把英文推理全文 ("The user says… I should respond in Chinese…")
 *   作为 content delta 吐进正文气泡。上游分流 (letta.ts reasoning vs token) 之外的最后防线。
 *
 * 设计原则 — 保守, 宁可漏放不可误伤:
 *   同时满足 4 个条件才动手:
 *     1. 多行 (≥3 非空行) — 正常回复极少是长篇多行英文推理
 *     2. 整段 >80% 英文字母 — 中文回复场景下正文不应是英文主导
 *     3. ≥2 行命中已知推理句式行首 ("The user" / "I should" / "Let me" …)
 *     4. 段内含中文 — 说明是「英文 CoT + 中文正文」多头泄漏;
 *        纯英文文本无法与合法英文回复区分, 不动 (交给 use-chat-actions 的高确定性兜底)
 *   动作: 截到首个中文字符之后的部分 (即保留中文正文, 丢弃前置英文推理)。
 *
 * 纯函数, 无 DOM/React 依赖 — 渲染层 (chat-bubble) 与状态层均可调用。
 */

/** 已知推理句式行首 (连续英文推理的开场白) */
const REASONING_OPENER_PATTERN =
  /^(?:the user|i should|i need to|let me|i'll|i will|okay,|alright,|first,|now i|the assistant|i am going to|based on|according to)\b/i;

/** 非空行数下限 — 低于此行数不判定为泄漏 */
const MIN_LEAK_LINES = 3;

/** 行首推理句式命中行数下限 */
const MIN_OPENER_LINES = 2;

/** 英文字母占比阈值 (所有字母中 ASCII 英文字母的比例) */
const ENGLISH_RATIO_THRESHOLD = 0.8;

function isEnglishChar(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isCJK(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意
    (code >= 0x3400 && code <= 0x4dbf) || // 扩展 A
    (code >= 0x3000 && code <= 0x303f) || // CJK 标点
    (code >= 0xff00 && code <= 0xffef)    // 全角形式
  );
}

export function sanitizeLeakedReasoning(text: string): string {
  if (!text) return text;

  const lines = text.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length < MIN_LEAK_LINES) return text;

  let englishLetters = 0;
  let totalLetters = 0;
  for (const ch of text) {
    if (isEnglishChar(ch)) englishLetters += 1;
    if (isEnglishChar(ch) || isCJK(ch)) totalLetters += 1;
  }
  if (totalLetters === 0 || englishLetters / totalLetters <= ENGLISH_RATIO_THRESHOLD) return text;

  const openerLines = nonEmptyLines.filter((line) => REASONING_OPENER_PATTERN.test(line.trim()));
  if (openerLines.length < MIN_OPENER_LINES) return text;

  const firstCjkIndex = [...text].findIndex((ch) => isCJK(ch));
  if (firstCjkIndex < 0) return text; // 纯英文: 无法与合法英文回复区分, 不动

  return text.slice(firstCjkIndex).trimStart();
}
