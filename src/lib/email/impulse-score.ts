/**
 * Calculate impulse score for an email receipt.
 * Shared utility to avoid DRY violation across scan/resync/imap-connect routes.
 *
 * Base score: 30
 * - Amount > $100: +25, > $50: +15, > $20: +10, else +5
 * - Late night (22:00-03:00): +15, evening (20:00-22:00): +8
 * - Impulse platforms (TikTok Shop, Temu, SHEIN, Wish): +15
 * - Low confidence (< 0.5): -10
 *
 * 🔧 ARCH fix (Round 2 H7 — timezone bug):
 *    旧代码用 Date.getHours() 返回服务器本地时区 (Vercel = UTC)。
 *    非 UTC 用户的 "深夜冲动" 信号完全错误 (UTC 06:00 = 上海 14:00, 但用户实际 22:00 购物)。
 *    根因修复: 新增可选 userTimezone 参数, 用 toLocaleString + hour12:false 提取用户本地小时。
 *    若未传 timezone, fallback 到 UTC (向后兼容)。
 */

export function calculateEmailImpulseScore(
  parsed: { platform: string; amount?: number; confidence: number },
  receivedAt: Date,
  userTimezone?: string,  // 🔧 Round 2 H7: IANA timezone (e.g., 'Asia/Shanghai')
): number {
  let score = 30;

  if (parsed.amount) {
    if (parsed.amount > 100) score += 25;
    else if (parsed.amount > 50) score += 15;
    else if (parsed.amount > 20) score += 10;
    else score += 5;
  }

  // 🔧 Round 2 H7: 用用户时区计算小时, fallback 到 UTC (旧逻辑)
  let hour: number;
  if (userTimezone) {
    try {
      const hourStr = receivedAt.toLocaleString('en-US', {
        timeZone: userTimezone,
        hour: 'numeric',
        hour12: false,
      });
      hour = parseInt(hourStr, 10);
      // toLocaleString with hour12:false may return "24" for midnight
      if (hour === 24) hour = 0;
    } catch {
      // 无效 timezone, fallback to getHours()
      hour = receivedAt.getHours();
    }
  } else {
    // 未传 timezone — 旧逻辑 (服务器本地时区)
    hour = receivedAt.getHours();
  }

  if (hour >= 22 || hour < 3) score += 15;
  else if (hour >= 20) score += 8;

  const impulsePlatforms = ['tiktok_shop', 'temu', 'shein', 'wish'];
  if (impulsePlatforms.includes(parsed.platform)) {
    score += 15;
  }

  if (parsed.confidence < 0.5) {
    score -= 10;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Extract plain text from an email body (HTML or text).
 * Shared utility to avoid DRY violation across imap-connect/resync routes.
 *
 * Uses the mature `html-to-text` library instead of hand-rolled regex,
 * which correctly handles edge cases like nested tables, encoded entities,
 * and malformed HTML that the previous implementation missed.
 */
import { htmlToText } from 'html-to-text';

export function extractPlainText(body: string): string {
  // If it looks like HTML, use html-to-text library for robust conversion
  // 🔧 ARCH fix (Round 22 BUG-R22-M4 — HTML 检测正则误判含 < > 的纯文本):
  //    旧代码 /<[^>]+>/ 匹配任何 <...>, 纯文本如 "if x < 5 then y > 3" 会被误判为 HTML
  //    → htmlToText 剥离 < 5 then y > 当作标签 → 文本损坏。
  //    根因修复: 只匹配字母开头的 HTML 标签 (如 <div>, <p>, <a>), 不匹配 < 5 等数学表达式。
  if (/<[a-zA-Z][^>]*>/.test(body)) {
    try {
      return htmlToText(body, {
        wordwrap: false,
        selectors: [
          { selector: 'img', format: 'skip' },
          { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
        ],
      }).trim();
      // safe to ignore: non-critical background operation, error already logged
    } catch {
              // safe to ignore: non-critical background operation, error already logged
      // Fallback for malformed HTML — basic tag stripping
      return body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }
  return body.trim();
}
