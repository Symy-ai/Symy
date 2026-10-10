/**
 * Tests for Z-AI Config (z-ai-config.ts)
 *
 * Covers:
 * - isZAIAvailable: config file detection
 * - createZAIClient: client creation (mocked)
 *
 * 🔧 R419 断言加固: 原版 2 例只断言"是函数/布尔" — 真行为全裸奔:
 *   - createZAIClient 透传 ZAI.create() promise (SDK 唯一入口)
 *   - isZAIAvailable 按 .z-ai-config 文件存在性返回 (fs mock 可控)
 *   - fs 异常 → 安全 fallback false (不炸调用方)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
  create: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('z-ai-web-dev-sdk', () => ({ default: { create: M.create } }));
vi.mock('fs', () => ({ existsSync: M.existsSync }));

import { createZAIClient, isZAIAvailable } from '@/lib/z-ai-config';

describe('isZAIAvailable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('配置文件存在 → true', () => {
    M.existsSync.mockReturnValue(true);
    expect(isZAIAvailable()).toBe(true);
    expect(M.existsSync).toHaveBeenCalledWith(expect.stringContaining('.z-ai-config'));
  });

  it('配置文件不存在 → false', () => {
    M.existsSync.mockReturnValue(false);
    expect(isZAIAvailable()).toBe(false);
  });

  it('fs 异常 → 安全 fallback false (不炸调用方)', () => {
    M.existsSync.mockImplementation(() => {
      throw new Error('fs broken');
    });
    expect(isZAIAvailable()).toBe(false);
  });
});

describe('createZAIClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('透传 ZAI.create() promise (SDK 唯一入口, constructor private)', async () => {
    const client = { chat: 'mock' };
    M.create.mockResolvedValue(client);
    const p = createZAIClient();
    expect(M.create).toHaveBeenCalledTimes(1);
    await expect(p).resolves.toBe(client);
  });

  it('SDK 抛错 → 透传 rejection (调用方 fallback 契约)', async () => {
    M.create.mockRejectedValue(new Error('no config'));
    await expect(createZAIClient()).rejects.toThrow('no config');
  });
});
