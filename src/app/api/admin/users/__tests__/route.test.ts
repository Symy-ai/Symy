import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminAuth: vi.fn(() => ({ authorized: true, actor: 'admin' })),
}));

vi.mock('@/lib/admin-audit', () => ({
  withAdminAudit: vi.fn((_request: unknown, _auth: unknown, handler: () => unknown) => handler()),
  logUnauthorizedAdminAttempt: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => {
        throw new Error('database must not be touched');
      }),
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';
import { createAdminClient } from '@/lib/supabase-admin';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/users', () => {
  it('rejects an invalid bannedUntil before any database write (N3)', async () => {
    const request = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'ban',
        userIds: ['0199f8f5-bc5a-7a0a-9df5-4a1b2c3d4e5f'],
        bannedUntil: 'garbage',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bannedUntil must be a valid date' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
