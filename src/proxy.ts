import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Routes that live outside [locale] and must bypass next-intl (no locale prefix).
// next-intl would otherwise redirect /admin → /en/admin and 404 these routes.
const isNonLocalizedRoute = (pathname: string) =>
  pathname === '/admin' ||
  pathname.startsWith('/admin/') ||
  pathname === '/butterfly-demo' ||
  pathname.startsWith('/butterfly-demo/') ||
  // 🤝 契约签署系统 (Symy-ai/covenant 独立项目): /covenant 由 next.config rewrites
  //    beforeFiles 代理到 covenant 项目；此处必须放行，否则 next-intl 307 到
  //    /en/covenant 品牌页，签名 API 请求被打断（2026-09-22 实测事故）。
  pathname === '/covenant' ||
  pathname.startsWith('/covenant/') ||
  pathname.startsWith('/api/');

// Strip the leading locale segment (/en, /zh) so auth checks work on the app path.
const stripLocale = (pathname: string) =>
  pathname.replace(
    new RegExp(`^/(${routing.locales.join('|')})(?=/|$)`),
    '',
  );

// Next.js 16 renamed middleware → proxy (Edge Runtime → Node.js)
export async function proxy(request: NextRequest) {
  // Step 1: Run next-intl for localized routes (adds /en, /zh prefix).
  // Non-localized routes (/admin, /butterfly-demo, /api) skip next-intl entirely.
  let intlResponse: NextResponse | undefined;
  if (!isNonLocalizedRoute(request.nextUrl.pathname)) {
    intlResponse = intlMiddleware(request);
    // If next-intl redirected (e.g., / → /en), return immediately.
    if (
      intlResponse instanceof NextResponse &&
      intlResponse.status >= 300 &&
      intlResponse.status < 400
    ) {
      return intlResponse;
    }
  }

  // Step 2: Run Supabase auth on top of the (possibly rewritten) request.
  // Use intlResponse as the base so any headers/cookies set by next-intl survive.
  // 🔧 ARCH fix (Round 19 BUG-R19D-M5): 用 null/ intlResponse 初始化, setAll 第一次调用时才创建 response,
  //    复用现有 response 而非每次创建新的, 否则旧 response 上 set 的 cookie 会丢失。
  let supabaseResponse: NextResponse | null =
    intlResponse instanceof NextResponse ? intlResponse : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 🔧 ARCH fix (Round 6 M5): 与 supabase-api.ts 一致, 支持新版 publishable key
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // If Supabase is not configured, skip auth checks (e.g. during build),
  // but still return the next-intl response so locale routing keeps working.
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse ?? NextResponse.next({ request });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        if (!supabaseResponse) {
          supabaseResponse = NextResponse.next({ request });
        }
        const response = supabaseResponse; // local const for TS null-narrowing
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh session — this is the key part
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ✅ 不再强制未登录用户跳转到登录页，允许浏览 App Demo。
  // 前端根据 isDemo 状态展示 Demo 模式。
  const appPath = stripLocale(request.nextUrl.pathname);
  const isAuthRoute = appPath.startsWith('/auth');

  // Redirect logged-in users away from auth pages (preserve locale prefix).
  if (user && isAuthRoute && !appPath.startsWith('/auth/callback')) {
    const locale =
      request.nextUrl.pathname.match(
        new RegExp(`^/(${routing.locales.join('|')})`),
      )?.[1] ?? routing.defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse ?? NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|logo.*\\.png|manifest\\.json|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
