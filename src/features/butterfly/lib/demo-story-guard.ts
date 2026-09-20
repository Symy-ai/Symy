/**
 * 🔒 wool v6 §十二.4 D7: demo-story 客户端输入边界守卫
 *
 * 客户端可控的 choices / decisionDescription 在进入章节内容模板前,
 * 统一过既有 fencing sanitizeText（剥离不可见字符/控制符/围栏标记/轮次伪造）。
 *
 * 语义说明:
 * - 章节模板是服务端 TS 模板字面量, 插值无 eval 语义, {{}}/${} 本身惰性;
 *   危险载体是不可见字符与角色伪造, 由 sanitizeText 剥离。
 * - choices 值在 generateDemoChapterContent 中只与 "A"/"B" 严格比较, 不插值 —
 *   此净化是纵深防御, 防未来插值面扩大时把注入带进故事文本。
 */
import { sanitizeText } from '@/lib/fencing';

/** choices 值 schema 已限 50 字符且净化只删不增, 上限留余量 */
const DEMO_CHOICE_MAX_CHARS = 100;

/** decisionDescription schema 上限, 净化不再放大长度 */
const DEMO_DESCRIPTION_MAX_CHARS = 1000;

/** 客户端 choices（chapterIndex 字符串键 → 选项值）进模板前的净化收口 */
export function sanitizeDemoChoices(raw: Record<string, string>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const chapterIndex = Number(key);
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) continue;
    out[chapterIndex] = sanitizeText(value, DEMO_CHOICE_MAX_CHARS);
  }
  return out;
}

/** decisionDescription 是唯一直接插值进大纲/章节文本的客户端字段, 同过净化 */
export function sanitizeDemoDescription(raw: string): string {
  return sanitizeText(raw, DEMO_DESCRIPTION_MAX_CHARS);
}
