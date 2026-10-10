import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  extract: vi.fn(),
  cors: vi.fn(() => ({ 'access-control-allow-origin': 'https://letta.com' })),
  options: vi.fn(() => new Response(null, { status: 204 })),
}));

vi.mock('@/lib/proxy-auth', () => ({
  extractAndValidateApiKey: M.extract,
  getCorsHeaders: M.cors,
  handleOptions: M.options,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET, OPTIONS } from '../route';

function makeReq(query = '') {
  return {
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(query) },
  } as never;
}

/**
 * v1/openai/deployments route (69行) — Azure 模型发现端点 (Round 2 H3/H4/L2)。
 *
 * 锁定:
 * - 无/坏 key → 401 Azure 错误形状 (invalid_api_key)+CORS
 * - 有效 key → 部署清单 (glm-5.2 锚, chat_completion only)
 * - OPTIONS → 共享 handleOptions
 */
describe('GET /api/v1/openai/deployments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.extract.mockReturnValue(null);
  });

  it('无 key → 401 Azure 错误形状', async () => {
    const r = await GET(makeReq());
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.error.type).toBe('authentication_error');
    expect(body.error.code).toBe('invalid_api_key');
    expect(r.headers.get('access-control-allow-origin')).toBeTruthy(); // CORS 带
  });

  it('有效 key → glm-5.2 部署清单+chat_completion only', async () => {
    M.extract.mockReturnValueOnce('valid-key');
    const r = await GET(makeReq('api-version=2024-02-01'));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(1);
    const d = body.data[0];
    expect(d.id).toBe('glm-5.2');
    expect(d.model).toBe('glm-5.2');
    expect(d.status).toBe('succeeded');
    expect(d.capabilities).toEqual({ chat_completion: true, completion: false, embeddings: false }); // 只开 chat
  });

  it('OPTIONS → 共享 handler', async () => {
    const r = await OPTIONS(makeReq());
    expect(r.status).toBe(204);
    expect(M.options).toHaveBeenCalledTimes(1);
  });
});
