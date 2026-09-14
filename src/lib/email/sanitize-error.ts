/**
 * Sanitize IMAP error messages — redact credentials before storing to DB or logging.
 *
 * ImapFlow error messages can include connection parameters like:
 *   "auth: user=foo, pass=bar"
 *   "authCode=abc123 authentication failed"
 *   "access_token=ya29.xxx invalid_grant"
 *
 * Without sanitization, these get stored to email_connections.error_message column,
 * leaking credentials to the database (accessible via admin UI / Supabase dashboard).
 *
 * 🔧 ARCH fix (Round 51 R51-Bug1 — resync route 未脱敏, imap-connect 已脱敏):
 *    旧代码: imap-connect/route.ts 有脱敏, resync/route.ts 没有 → 不一致 + 安全漏洞。
 *    根因修复: 提取共享 helper, 两个 route 统一使用。
 */

/**
 * Patterns that may appear in IMAP error messages and contain credentials.
 * Order matters — more specific patterns first.
 *
 * 🔧 ARCH fix (Round 52 REVIEW-A-4/5):
 *   - 用 \b word boundary 防 "compass=" / "passport=" / "passphrase=" 误匹配
 *   - 用 \S+ (而非 [^\s,;)]+) 确保完整匹配凭证值 (含逗号的凭证不会被部分泄漏)
 *   - ImapFlow "auth: user=foo, pass=bar" 格式单独处理 (结构化, 需精确匹配)
 */
const CREDENTIAL_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\bpass[=:]\s*\S+/gi, replacement: 'pass=***REDACTED***' },
  { regex: /\bpassword[=:]\s*\S+/gi, replacement: 'password=***REDACTED***' },
  { regex: /\bauthCode[=:]\s*\S+/gi, replacement: 'authCode=***REDACTED***' },
  { regex: /\baccess_token[=:]\s*\S+/gi, replacement: 'access_token=***REDACTED***' },
  { regex: /\brefresh_token[=:]\s*\S+/gi, replacement: 'refresh_token=***REDACTED***' },
  // ImapFlow "auth: user=foo, pass=bar" format (结构化, 单独处理)
  { regex: /auth:\s*user=[^\s,]+,?\s*pass=[^\s,)]+/gi, replacement: 'auth: ***REDACTED***' },
];

/**
 * Redact credentials from an IMAP error message.
 *
 * @param errorMsg - Raw error message from ImapFlow or IMAP client
 * @returns Sanitized message safe for DB storage / logging
 */
export function sanitizeImapError(errorMsg: string): string {
  if (!errorMsg || typeof errorMsg !== 'string') return String(errorMsg || '');

  let sanitized = errorMsg;
  for (const { regex, replacement } of CREDENTIAL_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}
