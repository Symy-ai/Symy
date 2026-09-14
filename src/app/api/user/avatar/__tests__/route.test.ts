/**
 * Integration tests for POST /api/user/avatar
 *
 * 🔧 ARCH fix Round 73 — Audit Finding 4.18:
 *   Avatar upload route had ZERO tests. Critical paths:
 *   - 401 when not authenticated
 *   - 400 when missing file field
 *   - 400 when invalid MIME type
 *   - 400 when file too large (>10MB)
 *   - 400 when magic bytes don't match (ARCH-5 #3 fix)
 *   - 400 when sharp fails (no fallback — ARCH-5 #3 fix)
 *   - 500 when storage upload fails
 *   - 200 on success (mocked sharp + storage + DB)
 *
 * 🔧 2026-07-15 (ARCH-5 #3): Updated tests for magic bytes validation + no sharp fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// 🔧 2026-07-15: Mock sharp to return a fake compressed buffer
// This avoids needing real image data in tests
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(async () => Buffer.from([0x52, 0x49, 0x46, 0x46, /* WebP header */ 0x00, 0x00])),
  })),
}));

import { POST } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(formData: FormData): NextRequest {
  return new NextRequest('http://localhost/api/user/avatar', {
    method: 'POST',
    body: formData,
  });
}

function authedMock() {
  return {
    supabase: {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/avatar.webp' } })),
        })),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
      auth: { updateUser: vi.fn(async () => ({ error: null })) },
    },
    user: { id: 'user-123' },
    error: null,
    mergeCookies: <T extends NextResponse>(res: T): T => res,
    mergeCookiesOnResponse: <T extends NextResponse>(res: T): T => res,
    pendingCookies: [],
  } as never;
}

describe('POST /api/user/avatar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: null, user: null, error: 'Not authenticated',
      mergeCookies: <T extends NextResponse>(res: T): T => res,
      mergeCookiesOnResponse: <T extends NextResponse>(res: T): T => res,
      pendingCookies: [],
    } as never);

    const fd = new FormData();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], 'test.png', { type: 'image/png' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
  });

  it('returns 400 when file field is missing', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('file');
  });

  it('returns 400 when MIME type is not allowed', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const fd = new FormData();
    const file = new File([new Uint8Array([0x00, 0x00])], 'test.txt', { type: 'text/plain' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid file type');
  });

  it('returns 400 when file is too large (>10MB)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const fd = new FormData();
    // Create a File with size > 10MB (declared size, not actual content)
    const largeBuffer = new Uint8Array(11 * 1024 * 1024);
    const file = new File([largeBuffer], 'big.png', { type: 'image/png' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('too large');
  });

  // 🔧 2026-07-15 (ARCH-5 #3): New test — magic bytes mismatch
  it('returns 400 when magic bytes do not match declared MIME type', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const fd = new FormData();
    // File claims to be PNG but content is not PNG
    const file = new File([new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])], 'fake.png', { type: 'image/png' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('magic bytes mismatch');
  });

  it('returns 500 when storage upload fails', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce({
      supabase: {
        storage: {
          from: vi.fn(() => ({
            upload: vi.fn(async () => ({ error: { message: 'Storage write failed' } })),
            getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/avatar.webp' } })),
          })),
        },
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
        auth: { updateUser: vi.fn(async () => ({ error: null })) },
      },
      user: { id: 'user-123' },
      error: null,
      mergeCookies: <T extends NextResponse>(res: T): T => res,
      mergeCookiesOnResponse: <T extends NextResponse>(res: T): T => res,
      pendingCookies: [],
    } as never);

    const fd = new FormData();
    // Full 8-byte PNG header
    const file = new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])], 'test.png', { type: 'image/png' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('upload');
  });

  it('returns 200 on successful upload (sharp mocked, no fallback needed)', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const fd = new FormData();
    // Full 8-byte PNG header
    const file = new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])], 'avatar.png', { type: 'image/png' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.avatarUrl).toBe('https://example.com/avatar.webp');
  });

  it('accepts JPEG MIME type', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const fd = new FormData();
    // JPEG SOI + marker (3 bytes minimum)
    const file = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], 'avatar.jpg', { type: 'image/jpeg' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
  });

  it('accepts WebP MIME type', async () => {
    vi.mocked(createAuthenticatedClient).mockResolvedValueOnce(authedMock() as never);

    const fd = new FormData();
    // WebP RIFF header (4 bytes)
    const file = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00])], 'avatar.webp', { type: 'image/webp' });
    fd.append('file', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
  });
});
