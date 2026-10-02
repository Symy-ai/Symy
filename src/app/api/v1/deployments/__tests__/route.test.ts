// v1/deployments + openai/deployments — Azure兼容模型发现（此前 0 测试）
// 契约: key验证401(模型名不泄露)/Azure deployment格式/capabilities
// 只开chat_completion/固定时间戳/CORS/OPTIONS预检。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const validateKeyMock = vi.fn();
vi.mock('@/lib/proxy-auth', () => ({
  extractAndValidateApiKey: (...a: unknown[]) => validateKeyMock(...a),
  getCorsHeaders: () => ({ 'access-control-allow-origin': '*' }),
  handleOptions: () => new Response(null, { status: 204 }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, OPTIONS } from '../route';
import { GET as GET_OPENAI } from '../../openai/deployments/route';

function req(auth?: string, extra: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/v1/deployments', {
    headers: { ...(auth ? { authorization: auth } : {}), ...extra },
  });
}

describe('GET /api/v1/deployments — Azure 格式', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无效 key → 401 且不含模型名', async () => {
    validateKeyMock.mockReturnValue(null);
    const res = await GET(req('Bearer bad'));
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('glm');
  });

  it('api-key header 路径也可 (Azure 惯例)', async () => {
    validateKeyMock.mockReturnValue('valid');
    const res = await GET(req(undefined, { 'api-key': 'valid' }));
    expect(res.status).toBe(200);
  });

  it('有效 key → Azure deployment 单条 + capabilities 只开 chat_completion', async () => {
    validateKeyMock.mockReturnValue('k');
    const res = await GET(req('Bearer k'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(1);
    const d = body.data[0];
    expect(d.id).toBe('glm-5.2');
    expect(d.status).toBe('succeeded');
    expect(d.capabilities).toEqual({ chat_completion: true, completion: false, embeddings: false });
    expect(d.created_at).toBe(1740000000); // 固定时间戳
  });

  it('openai/deployments 别名端点同格式', async () => {
    validateKeyMock.mockReturnValue('k');
    const res = await GET_OPENAI(req('Bearer k'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].id).toBe('glm-5.2');
  });

  it('OPTIONS 预检 204', async () => {
    const res = await OPTIONS(req());
    expect(res.status).toBe(204);
  });
});
