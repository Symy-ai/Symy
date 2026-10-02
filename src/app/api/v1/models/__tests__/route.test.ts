// v1/models — OpenAI兼容模型发现（此前 0 测试）
// 契约: 无效key→401(模型名不泄露, Round 2 H3)/有效key→单模型
// glm-5.2/固定created时间戳(BUG-130)/CORS共享头/OPTIONS预检。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const validateKeyMock = vi.fn();
vi.mock('@/lib/proxy-auth', () => ({
  extractAndValidateApiKey: (...a: unknown[]) => validateKeyMock(...a),
  getCorsHeaders: () => ({ 'access-control-allow-origin': '*' }),
  handleOptions: () => new Response(null, { status: 204 }),
}));

import { GET, OPTIONS } from '../route';

function req(auth?: string) {
  return new NextRequest('http://localhost/api/v1/models', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('GET /api/v1/models', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无效/缺失 key → 401 auth_error (模型名不泄露)', async () => {
    validateKeyMock.mockReturnValue(null);
    const res = await GET(req('Bearer wrong'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.type).toBe('auth_error');
    expect(JSON.stringify(body)).not.toContain('glm');
  });

  it('有效 key → 单模型 glm-5.2 OpenAI list 格式', async () => {
    validateKeyMock.mockReturnValue('valid-key');
    const res = await GET(req('Bearer valid-key'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('glm-5.2');
    expect(body.data[0].owned_by).toBe('symy-proxy');
  });

  it('固定 created 时间戳 (BUG-130: 客户端不重复拉取)', async () => {
    validateKeyMock.mockReturnValue('k');
    const res = await GET(req('Bearer k'));
    const body = await res.json();
    expect(body.data[0].created).toBe(1740000000);
  });

  it('响应带 CORS 头', async () => {
    validateKeyMock.mockReturnValue('k');
    const res = await GET(req('Bearer k'));
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('OPTIONS /api/v1/models', () => {
  it('预检 204', async () => {
    const res = await OPTIONS(req());
    expect(res.status).toBe(204);
  });
});
