/**
 * Gmail OAuth 授权回调 — 第二步：用授权码换取 token 并存储
 * GET /api/email/callback?code=xxx&state=nonce
 *
 * 使用带 cookie 的 Supabase 客户端，auth.uid() 有值，RLS 正常放行。
 *
 * 🔒 ARCH fix (Round 2 C1 — OAuth state CSRF):
 *    旧代码 state = user.id → 攻击者可伪造 OAuth URL 实施 account-linking attack。
 *    根因修复: state = 随机 nonce (由 connect 路由写入 HttpOnly cookie), 回调时用 timingSafeEqual
 *    验证 nonce 匹配, 验证后立即清除 cookie (单次使用)。
 *
 * 🔧 2026-07-21: Cleaned up mergeCookies pattern (was using mergeCookiesRef variable
 *    for catch block — simplified to inline pattern).
 *    Note: This route uses manual auth (not withAuth) because it needs custom
 *    redirect behavior for unauthenticated users (redirect to home with
 *    email_error=not_authenticated, not 401 JSON).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { GMAIL_OAUTH_CONFIG } from '@/lib/email/gmail-config';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';
import { encryptSensitive } from '@/lib/crypto-helpers';
import { asUpsert } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';

type EmailConnectionsInsert = Database['public']['Tables']['email_connections']['Insert'];

const OAUTH_STATE_COOKIE = 'symy-oauth-state';

/** 🔒 timing-safe 比较, 防 nonce 时序泄露 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    // safe to ignore: timingSafeEqual only throws on length mismatch (already checked above)
    // — this catch is defensive, returns false to deny the nonce
    return false;
  }
}

/** Helper: redirect back to the app home page with query params + clear OAuth cookie */
function redirectHome(request: NextRequest, params: Record<string, string>): NextResponse {
  const homeUrl = new URL('/', request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    homeUrl.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(homeUrl);
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // User denied access
  if (error) {
    return redirectHome(request, { tab: 'monitor', email_error: error });
  }

  // Missing code or state
  if (!code || !state) {
    return redirectHome(request, { tab: 'monitor', email_error: 'missing_code' });
  }

  // Check if Gmail OAuth is configured
  if (!GMAIL_OAUTH_CONFIG.clientId || !GMAIL_OAUTH_CONFIG.clientSecret) {
    logger.error('[OAuth Callback] Gmail OAuth not configured');
    return redirectHome(request, { tab: 'monitor', email_error: 'not_configured' });
  }

  // Verify user is authenticated
  const { supabase, user, error: authError, mergeCookies } = await createAuthenticatedClient(request);

  if (authError || !user || !supabase) {
    logger.error('OAuth callback: user not authenticated', authError);
    return mergeCookies(redirectHome(request, { tab: 'monitor', email_error: 'not_authenticated' }));
  }

  // 🔒 ARCH fix (Round 2 C1): 验证 state nonce 匹配 cookie 中的 nonce
  const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !cookieNonce || !safeEqual(state, cookieNonce)) {
    logger.error('OAuth callback: state nonce missing or mismatch (CSRF defense)', {
      hasState: !!state,
      hasCookieNonce: !!cookieNonce,
    });
    return mergeCookies(redirectHome(request, { tab: 'monitor', email_error: 'state_mismatch' }));
  }

  try {
    // Exchange authorization code for tokens
    const redirectUri = GMAIL_OAUTH_CONFIG.redirectUri || `${request.nextUrl.origin}/api/email/callback`;

    const oauth2Client = new google.auth.OAuth2(
      GMAIL_OAUTH_CONFIG.clientId,
      GMAIL_OAUTH_CONFIG.clientSecret,
      redirectUri,
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // Get user's email address using the access token
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profile.data.emailAddress;

    if (!emailAddress) {
      throw new Error('Could not retrieve email address from Gmail profile');
    }

    // Calculate token expiry
    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // 🔧 ARCH fix (Round 19 BUG-R19-C-1): Encrypt access_token and refresh_token
    let encryptedAccessToken: string;
    let encryptedRefreshToken: string | undefined;
    try {
      encryptedAccessToken = encryptSensitive(tokens.access_token);
      if (tokens.refresh_token) {
        encryptedRefreshToken = encryptSensitive(tokens.refresh_token);
      }
    } catch (encErr) {
      // safe to ignore: returns redirect with error code; encryption failure is logged for debugging
      logger.error('[OAuth Callback] encryptSensitive failed (encryption key not configured?):', encErr);
      return mergeCookies(redirectHome(request, { tab: 'monitor', email_error: 'encryption_failed' }));
    }

    const upsertData: Record<string, unknown> = {
      user_id: user.id,
      email_address: emailAddress,
      provider: 'gmail' as const,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expiry: tokenExpiry.toISOString(),
      scopes: tokens.scope?.split(' ') || GMAIL_OAUTH_CONFIG.scopes,
      status: 'active' as const,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (upsertData.refresh_token === undefined) {
      delete upsertData.refresh_token;
    }

    const { error: dbError } = await supabase
      .from('email_connections')
      .upsert(asUpsert<EmailConnectionsInsert>(upsertData), { onConflict: 'user_id,email_address' });

    if (dbError) {
      logger.error('Failed to store email connection:', dbError);
      return mergeCookies(redirectHome(request, { tab: 'monitor', email_error: 'email_connection_failed' }));
    }

    return mergeCookies(redirectHome(request, { tab: 'monitor', email_connected: 'gmail' }));
  } catch (err) {
    // safe to ignore: returns redirect with error code; error is logged for debugging
    logger.error('Gmail OAuth callback error:', err);
    return mergeCookies(redirectHome(request, { tab: 'monitor', email_error: 'oauth_callback_failed' }));
  }
}
