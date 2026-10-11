/**
 * Sentry beforeSend PII 清洗 — 隐私政策断言的实现支撑
 *
 * 🔧 R592 (2026-10-11): 隐私政策第 10 节断言「Sentry 已启用 PII 清洗」。
 *    核实发现三个激活的 Sentry.init（server/client/edge）均无 beforeSend 钩子 —
 *    错误对象里携带的邮箱/电话（如 `logger.error('user foo@bar.com not found')`）
 *    会明文进 Sentry 事件。本模块补齐实现，使断言名实相符。
 *
 * 清洗面（与 src/lib/pii-redact.ts 的 redactBasicPII 同源正则）:
 * - 邮箱 → [email]
 * - 电话（宽松模式，防误杀时间戳: 须 7 位以上且含分隔或 11 位手机格式）→ [phone]
 *
 * 不洗: URL/用户 ID (UUID 无可识别性，排障需要)。
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// 11 位手机号 (1xx-xxxx-xxxx) 或带分隔的长号码; 不匹配 4 位年份/时间戳
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:1[3-9]\d{9}|\d{3}[-.\s]\d{3,4}[-.\s]\d{4})/g;

export function scrubPii(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]');
}

/** 递归清洗事件里的字符串值 (message/exception values/extra) */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return value; // 深度保险
  if (typeof value === 'string') return scrubPii(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, depth + 1);
    return out;
  }
  return value;
}

/**
 * beforeSend 钩子 — 清洗 event 中的 PII。
 * 用法: `beforeSend: scrubSentryEvent` (返回 null 会丢弃事件, 本实现从不丢弃)
 * 泛型宽松: 兼容 Sentry ErrorEvent 与测试自定义结构 (tags 值可为 number/boolean)
 */
export function scrubSentryEvent<T extends {
  message?: string;
  exception?: { values?: Array<{ value?: string; type?: string }> | null } | null;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}>(event: T): T | null {
  if (event.message) event.message = scrubPii(event.message);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubPii(ex.value);
      if (ex.type) ex.type = scrubPii(ex.type);
    }
  }
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.tags) {
    for (const [k, v] of Object.entries(event.tags)) {
      event.tags[k] = typeof v === 'string' ? scrubPii(v) : v;
    }
  }
  return event;
}
