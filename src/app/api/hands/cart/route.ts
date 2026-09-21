import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { warnMissingEnvOnce } from '@/lib/env-consumers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  buildCartToolCall,
  currencyForLang,
  langFromRequest,
  sessionRefFor,
  unwrapCartEnvelope,
  type CartAction,
  type CartItem,
} from './cart-hands';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  action: z.enum(['add', 'list', 'remove']),
  // remove 语义 = { product_ref, qty: 0 } — symy_cart 契约里 item 是 arguments 顶层字段
  item: z.record(z.string(), z.unknown()).optional(),
});

// 502 细分码 — 前端据此选文案, 管理端据此诊断。不携带任何 upstream 细节/secret。
// HANDS_AUTH_FAILED: upstream 401 — 部署层 Caddy Bearer 与本侧 SYMY_HANDS_SECRET 不匹配
//   (deploy/hands/Caddyfile)。error 级日志 → Sentry 通知管理员, 前端文案承诺「已通知管理员」。
// HANDS_UNAVAILABLE: 其他 upstream 5xx / 网络失败 — 部署侧问题, 代码重试无意义, 不重试。
type HandsCartFailureCode = 'HANDS_AUTH_FAILED' | 'HANDS_UNAVAILABLE';

function failureResponse(code: HandsCartFailureCode): NextResponse {
  return NextResponse.json({ ok: false, error: 'Cart service unavailable', code }, { status: 502 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SYMY_HANDS_SECRET;
  if (!secret) {
    warnMissingEnvOnce('Hands cart proxy');
    return NextResponse.json({ error: 'Cart proxy unavailable' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // symy_cart 真契约: lang/currency 服务端从 cookie/header 判定 (应用 locale 存 localStorage,
  // 服务端读不到 — NEXT_LOCALE cookie 是预留位, 退回 Accept-Language)
  const lang = langFromRequest(request.headers.get('cookie'), request.headers.get('accept-language'));
  const toolCall = buildCartToolCall(parsedBody.data.action as CartAction, {
    userRef: user.id,
    sessionRef: sessionRefFor(user.id),
    lang,
    currency: currencyForLang(lang),
  }, parsedBody.data.item as CartItem | undefined);

  try {
    const upstream = await fetch('https://hands.symy.ai/mcp/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: toolCall,
      }),
    });

    const upstreamText = await upstream.text();
    if (!upstream.ok) {
      if (upstream.status === 401) {
        // Caddy 网关鉴权失败 (secret 不匹配/缺失) — error 级日志进 Sentry = 「已通知管理员」
        logger.error('[Hands Cart Proxy] upstream auth failed (401) — 检查部署侧 SYMY_HANDS_SECRET 是否与 Vercel 同值');
        return failureResponse('HANDS_AUTH_FAILED');
      }
      logger.warn('[Hands Cart Proxy] upstream failed:', upstream.status, upstreamText.slice(0, 500));
      return failureResponse('HANDS_UNAVAILABLE');
    }

    // 解包 MCP envelope (JSON-RPC → result.content[0].text → {ok, data, error}), 直接回给前端
    const unwrapped = unwrapCartEnvelope(upstreamText);
    return NextResponse.json(unwrapped);
  } catch (err) {
    // safe to ignore: upstream outage is recovered by returning 502 below —
    // 前端据 ok:false/502 显示「连不上」, 不假装空车
    logger.error('[Hands Cart Proxy] request error:', err);
    return failureResponse('HANDS_UNAVAILABLE');
  }
}
