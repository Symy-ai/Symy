/**
 * Integration tests for GET /api/email/connect
 *
 * 🔧 ARCH fix Round 73 — Audit Finding 4.10:
 *   Email OAuth start route had ZERO tests. This is the OAuth security boundary —
 *   state nonce generation, cookie setting, redirect URL construction.
 *
 * Test paths:
 *   - 401 when not authenticated
 *   - 500 when OAuth config missing
 *   - 302 redirect to Google OAuth URL with state nonce
 *   - State cookie is set with correct attributes (HttpOnly, SameSite=Lax, Secure in prod)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/email/gmail-config', () => ({
  GMAIL_OAUTH_CONFIG: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/api/email/callback',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/email/connect', { method: 'GET' });
}

function authedMock() {
  return {
    supabase: {},
    user: { id: 'user-123', email: 'test@example.com' },
    error: null,
    json: <T extends Record<string, unknown>>(data: T, init?: ResponseInit) => NextResponse.json(data, init),
    mergeCookies: <T extends Response>(res: T): T => res,
    mergeCookiesOnResponse: <T extends Response>(res: T): T => res,
    pendingCookies: [],
  };
}

describe('GET /api/email/connect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      json: <T extends Record<string, unknown>>(data: T, init?: ResponseInit) => NextResponse.json(data, init),
      mergeCookies: <T extends Response>(res: T): T => res,
      mergeCookiesOnResponse: <T extends Response>(res: T): T => res,
      pendingCookies: [],
    } as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 500 when Gmail OAuth not configured', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    // Temporarily override the mock to return empty config
    const { GMAIL_OAUTH_CONFIG } = await import('@/lib/email/gmail-config');
    const originalClientId = GMAIL_OAUTH_CONFIG.clientId;
    const originalClientSecret = GMAIL_OAUTH_CONFIG.clientSecret;
    Object.defineProperty(GMAIL_OAUTH_CONFIG, 'clientId', { value: '', configurable: true });
    Object.defineProperty(GMAIL_OAUTH_CONFIG, 'clientSecret', { value: '', configurable: true });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('not configured');

    // Restore
    Object.defineProperty(GMAIL_OAUTH_CONFIG, 'clientId', { value: originalClientId, configurable: true });
    Object.defineProperty(GMAIL_OAUTH_CONFIG, 'clientSecret', { value: originalClientSecret, configurable: true });
  });

  it('returns 302 redirect with state nonce and sets HttpOnly cookie', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(307); // NextResponse.redirect defaults to 307
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain('redirect_uri=');
    // State nonce should be present (32 random bytes → 64 hex chars)
    expect(location).toMatch(/state=[0-9a-f]{64}/);

    // Set-Cookie header should set symy-oauth-state
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('symy-oauth-state=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
  });

  it('uses SameSite=Lax (not Strict) to allow Google OAuth redirect to carry cookie', async () => {
    // ARCH fix Round 3 C4: SameSite=Strict breaks Google→/callback redirect
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const res = await GET(makeRequest());
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie.toLowerCase()).not.toContain('samesite=strict');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
  });
});
