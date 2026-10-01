import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/with-auth', () => ({
  withAuth: vi.fn((handler: (ctx: unknown) => unknown) => handler),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { DELETE } = await import('../route') as { DELETE: (ctx: unknown) => Promise<Response> };

beforeEach(() => vi.clearAllMocks());

describe('DELETE /api/push/unsubscribe', () => {
  it('does not leak the database error message on delete failure', async () => {
    const error = { code: '42501', message: 'new row violates row-level security policy "push_subscriptions_delete"' };
    const builder = {
      from: vi.fn(),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      then: vi.fn((resolve: (value: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data: null, error }).then(resolve)),
    };
    const supabase = { from: vi.fn(() => builder) };
    const request = new NextRequest('http://localhost/api/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: 'https://push.example/1' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await DELETE({ user: { id: 'u1' }, supabase, request });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to remove subscription', error_code: 'DB_ERROR' });
  });
});
