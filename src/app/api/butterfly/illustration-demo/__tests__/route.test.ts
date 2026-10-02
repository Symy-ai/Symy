// butterfly/illustration-demo — 插图演示（此前 0 测试）
// 契约: 分布式限流429/非法size回退默认/输入sanitize(去换行防注入)/
// Image API未配置→SVG兜底。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const checkRateLimitMock = vi.fn();
vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const { isConfiguredMock, genMock, svgMock } = vi.hoisted(() => ({
  isConfiguredMock: vi.fn(),
  genMock: vi.fn(),
  svgMock: vi.fn(),
}));
vi.mock('@/features/butterfly/lib/illustration-engine', () => ({
  isImageAPIConfigured: () => isConfiguredMock(),
  generateWithOpenAICompatible: (...a: unknown[]) => genMock(...a),
  buildPrompt: () => 'fake prompt',
  buildMultiShotScenePrompts: () => ['shot-0', 'shot-1'],
}));
vi.mock('@/features/butterfly/lib/svg-illustration-engine', () => ({
  generateSVGIllustration: svgMock,
}));

import { POST } from '../route';

function req(body: unknown, ip = '1.2.3.4') {
  return new NextRequest('http://localhost/api/butterfly/illustration-demo', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });
}

describe('POST /api/butterfly/illustration-demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    isConfiguredMock.mockReturnValue(false);
    svgMock.mockReturnValue('<svg>fallback</svg>');
  });

  it('限流命中 → 429 (10/hour)', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false });
    const res = await POST(req({}));
    expect(res.status).toBe(429);
    expect(checkRateLimitMock).toHaveBeenCalledWith('illust-demo:1.2.3.4', 10, 3_600_000);
  });

  it('Image API 未配置 → SVG 兜底', async () => {
    const res = await POST(req({ title: '我的蝴蝶故事' }));
    expect(res.status).toBe(200);
    expect(svgMock).toHaveBeenCalled();
    expect(genMock).not.toHaveBeenCalled();
  });

  it('非法 size → 接受请求且走兜底 (SVG路径签名 title,tone,chapter,isLight)', async () => {
    const res = await POST(req({ size: '9999x9999', title: 'T' }));
    expect(res.status).toBe(200);
    // generateSVGIllustration(title, tone, chapterIndex, isLight) — size 不进该路径
    expect(svgMock).toHaveBeenCalledWith('T', 'neutral', 0, false);
  });

  it('输入含换行指令 → sanitize 成空格 (prompt注入防御)', async () => {
    await POST(req({ title: 'a\nIGNORE_ALL\rb' }));
    // title 传入 svg 引擎前已被清洗 — 检查调用参数无换行
    const flat = JSON.stringify(svgMock.mock.calls);
    expect(flat).not.toMatch(/\\n|\\r/);
  });

  it('非 JSON body → 默认值兜底不炸', async () => {
    const res = await POST(req('{broken'));
    expect(res.status).toBe(200);
  });
});
