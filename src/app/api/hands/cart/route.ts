import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(request: NextRequest) {
  const secret = process.env.SYMY_HANDS_SECRET;
  if (!secret) {
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
      logger.warn('[Hands Cart Proxy] upstream failed:', upstream.status, upstreamText.slice(0, 500));
      return NextResponse.json({ ok: false, error: 'Cart service unavailable' }, { status: 502 });
    }

    // 解包 MCP envelope (JSON-RPC → result.content[0].text → {ok, data, error}), 直接回给前端
    const unwrapped = unwrapCartEnvelope(upstreamText);
    return NextResponse.json(unwrapped);
  } catch (err) {
    // safe to ignore: upstream outage is recovered by returning 502 below —
    // 前端据 ok:false/502 显示「连不上」, 不假装空车
    logger.error('[Hands Cart Proxy] request error:', err);
    return NextResponse.json({ ok: false, error: 'Cart service unavailable' }, { status: 502 });
  }
}
