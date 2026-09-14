/**
 * Tests for GET /api/email/status
 *
 * 🔧 Round 84: Test coverage for email status API.
 *    - 401 when unauthenticated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-api', () => ({
  createAuthenticatedClient: vi.fn(),
}));

import { GET } from '../route';
import { createAuthenticatedClient } from '@/lib/supabase-api';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/email/status', { method: 'GET' });
}

describe('GET /api/email/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    (createAuthenticatedClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: null,
      user: null,
      error: 'Not authenticated',
      mergeCookies: (resp: Response) => resp,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});
