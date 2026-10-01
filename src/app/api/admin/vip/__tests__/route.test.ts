import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: vi.fn(() => ({ authorized: true })),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: {}, error: null })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';

function makeRequest(body: string): NextRequest {
  return new NextRequest('http://localhost/api/admin/vip', { method: 'POST', body });
}

describe('POST /api/admin/vip — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(makeRequest('{'));
    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid userIds and action', async () => {
    const response = await POST(makeRequest(JSON.stringify({ userIds: ['not-a-uuid'], action: 'reset' })));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Validation failed');
  });
});
