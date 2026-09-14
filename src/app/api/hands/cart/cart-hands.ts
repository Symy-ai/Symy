/**
 * cart-hands — symy_cart 真契约组装 + MCP envelope 解包 (纯函数, 可单测)
 *
 * 契约 (coordinator 侦察确认): hands MCP 只有单一工具 `symy_cart`,
 *   arguments = { action, context: { user_ref, session_ref, lang, currency }, item? }
 *   (旧代码拼 `symy_cart_${action}` 工具名 → upstream "Invalid request"。
 *    `item` 是 arguments 顶层字段, 不在 context 里; remove 语义 = { product_ref, qty: 0 }。)
 *
 * 响应是 JSON-RPC envelope, 业务数据在 result.content[0].text (JSON 字符串
 *   { trace_id, ok, data }) 里 — unwrapCartEnvelope 负责解包成 { ok, data, error }。
 */

export type CartAction = 'add' | 'list' | 'remove';
export type CartLang = 'zh' | 'en';
export type CartCurrency = 'CNY' | 'USD';

export interface CartItem {
  product_ref: string;
  qty?: number;
  [key: string]: unknown;
}

export interface CartCallContext {
  userRef: string;
  sessionRef: string;
  lang: CartLang;
  currency: CartCurrency;
}

/** session_ref — 'web-' + userId 前 8 位的稳定值 (upstream 用来关联同一浏览器会话) */
export function sessionRefFor(userId: string): string {
  return `web-${userId.slice(0, 8)}`;
}

/**
 * 从请求 cookie / Accept-Language 判 UI 语言。
 * 应用当前把 locale 存 localStorage (服务端读不到), cookie NEXT_LOCALE 是预留位;
 * 都没有时退回 Accept-Language, 含 zh 即 zh, 否则 en。
 */
export function langFromRequest(cookieHeader: string | null, acceptLanguage: string | null): CartLang {
  const cookieMatch = cookieHeader?.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  if (cookieMatch?.[1]) return cookieMatch[1].toLowerCase().startsWith('zh') ? 'zh' : 'en';
  if (acceptLanguage && /(^|[,;\s-])zh/i.test(acceptLanguage)) return 'zh';
  return 'en';
}

/** lang → currency (zh 站 CNY, en 站 USD — 与 hands 商品库定价货币一致) */
export function currencyForLang(lang: CartLang): CartCurrency {
  return lang === 'zh' ? 'CNY' : 'USD';
}

/** 组装 symy_cart tools/call 的 params (name + arguments, 真契约) */
export function buildCartToolCall(
  action: CartAction,
  context: CartCallContext,
  item?: CartItem,
): { name: string; arguments: Record<string, unknown> } {
  const args: Record<string, unknown> = {
    action,
    context: {
      user_ref: context.userRef,
      session_ref: context.sessionRef,
      lang: context.lang,
      currency: context.currency,
    },
  };
  if (item) args.item = item;
  return { name: 'symy_cart', arguments: args };
}

export interface UnwrappedCartResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** 从一段响应文本里抽出可 JSON.parse 的载荷: 整体 JSON 优先, 否则扫 SSE data: 行 */
function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data:')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // 整体不是 JSON — 落到下面的 SSE data: 行扫描
    }
  }
  for (const line of trimmed.split('\n')) {
    const candidate = line.trim();
    if (!candidate.startsWith('data:')) continue;
    const payload = candidate.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      return JSON.parse(payload);
    } catch {
      // 不是 JSON 的 data: 行 (注释/心跳) — 继续扫
    }
  }
  throw new Error('no parsable data: line');
}

/**
 * 解包 MCP JSON-RPC envelope → { ok, data, error }。
 * 容错: JSON 或 SSE 两种响应形态; JSON-RPC error; result.isError;
 * 业务层 { trace_id, ok, data } 包在 result.content[0].text 里。
 * 任何解不开的形态都返回 { ok: false, error } — 绝不把 envelope 本体透传给前端假装购物车数据。
 */
export function unwrapCartEnvelope(rawText: string): UnwrappedCartResult {
  let envelope: {
    error?: { message?: string };
    result?: {
      isError?: boolean;
      content?: Array<{ text?: string }>;
      [key: string]: unknown;
    };
  };
  try {
    envelope = extractJsonPayload(rawText) as typeof envelope;
  } catch {
    // safe to ignore: unparseable upstream payload is recovered as ok:false below
    return { ok: false, error: 'Cart service returned an unreadable response' };
  }

  if (envelope?.error) {
    return { ok: false, error: envelope.error.message || 'Cart request failed' };
  }

  const result = envelope?.result;
  if (!result) {
    return { ok: false, error: 'Cart service response missing result' };
  }

  const innerText = result.content?.[0]?.text;
  if (typeof innerText === 'string') {
    try {
      const inner = JSON.parse(innerText) as { ok?: boolean; data?: unknown; error?: string };
      if (inner && typeof inner === 'object' && 'ok' in inner) {
        return { ok: !!inner.ok, data: inner.data, error: inner.error };
      }
    } catch {
      // safe to ignore: content[0].text 不是业务 JSON — 落到下面的兜底分支处理
    }
  }

  if (result.isError) {
    return { ok: false, error: typeof innerText === 'string' ? innerText : 'Cart tool reported an error' };
  }

  // 兜底: envelope 没有 content[0].text 包装时, result 本体若形如 { ok, data } 直接采用
  if (typeof (result as { ok?: unknown }).ok !== 'undefined') {
    const r = result as unknown as { ok: boolean; data?: unknown; error?: string };
    return { ok: r.ok, data: r.data, error: r.error };
  }

  return { ok: false, error: 'Cart service response missing payload' };
}
