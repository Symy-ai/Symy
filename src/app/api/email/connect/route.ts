/**
 * Gmail OAuth 授权连接 — 第一步：生成授权 URL
 * GET /api/email/connect
 *
 * 从 cookie 中获取当前用户，不需要传 userId 参数。
 *
 * 🔒 ARCH fix (Round 2 C1 — OAuth state CSRF):
 *    旧代码 state = user.id (稳定 UUID, 可从 URL/日志/API 响应泄露) → 攻击者可伪造
 *    OAuth URL 诱导受害者点击, 在受害者会话中绑定攻击者的 Gmail (account-linking attack)。
 *    根因修复: state = 随机 nonce, 存入 HttpOnly cookie (10 分钟 TTL), 回调时验证 nonce 匹配。
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookiesFn pattern — now handled automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { GMAIL_OAUTH_CONFIG } from '@/lib/email/gmail-config';
import { withAuth } from '@/lib/with-auth';

// 🔧 ARCH fix (Round 2 C1): OAuth state nonce cookie 配置
const OAUTH_STATE_COOKIE = 'symy-oauth-state';
const OAUTH_STATE_TTL_SECONDS = 600; // 10 分钟

export const GET = withAuth(async ({ request }) => {
  if (!GMAIL_OAUTH_CONFIG.clientId || !GMAIL_OAUTH_CONFIG.clientSecret) {
    return NextResponse.json(
      { error: 'Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const redirectUri = GMAIL_OAUTH_CONFIG.redirectUri || `${request.nextUrl.origin}/api/email/callback`;

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_OAUTH_CONFIG.clientId,
    GMAIL_OAUTH_CONFIG.clientSecret,
    redirectUri,
  );

  // 🔒 ARCH fix (Round 2 C1): 生成随机 nonce 作为 state, 而非 user.id
  // nonce 绑定到当前会话 (HttpOnly cookie), 回调时验证
  const { randomBytes } = await import('crypto');
  const stateNonce = randomBytes(32).toString('hex');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_OAUTH_CONFIG.scopes,
    state: stateNonce,
    prompt: 'consent',
  });

  // 设置 HttpOnly + SameSite=Lax + Secure cookie 存储 nonce
  // 🔧 ARCH fix (Round 3 C4): SameSite=Strict 会阻止 Google→/callback 的跨站重定向携带 cookie
  //    → nonce 永远不匹配 → 所有 Gmail 连接失败。
  //    根因修复: 改为 SameSite=Lax (允许顶级 GET 重定向携带 cookie, 仍防跨站 POST CSRF)。
  // 🔧 2026-07-21: withAuth auto-merges auth cookies; we just set the oauth state cookie
  //    on the redirect response and withAuth preserves it.
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, stateNonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });
  return response;
});
