/**
 * Tests for mcp-letta-tools.ts — Letta 自定义工具 Python 源码生成器
 * (batch71-b, testgap v5 中危盲区补测)
 *
 * 报告出处: wool-report-testgap §五 快速可补 + §十.2 N4 + §十一.4。
 * 风险面: 6 个金额类工具的 Python 源码模板 + 模块加载期 env fail-closed throw。
 *
 * 断言对齐现状:
 *   - 6 个工具, name / def <name>( / _call_mcp 回调齐全, schema required 含 user_id
 *   - NEXT_PUBLIC_APP_URL 与 VERCEL_URL 双缺 → 模块加载即 throw (fail-closed)
 *   - VERCEL_URL 单独存在 → https:// 前缀兜底
 *   - ⚠️ N4 (报告 §十.2): MCP_API_SECRET 原样插值进生成源码文本 — 现状锁定,
 *     owner 确认改 env 注入后应翻转此断言, 详见 /tmp/b71b-defects.md
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAllMCPToolDefinitions } from '@/lib/mcp-letta-tools';

const ORIG = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  vercel: process.env.VERCEL_URL,
  secret: process.env.MCP_API_SECRET,
};

function restoreEnv() {
  if (ORIG.appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIG.appUrl;
  if (ORIG.vercel === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = ORIG.vercel;
  if (ORIG.secret === undefined) delete process.env.MCP_API_SECRET;
  else process.env.MCP_API_SECRET = ORIG.secret;
}

/** env 改动只在动态 import 前生效 — 模块顶层 const 在求值时读 env */
function freshImport() {
  vi.resetModules();
  return import('@/lib/mcp-letta-tools');
}

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe('getAllMCPToolDefinitions — 工具清单契约', () => {
  it('恰好 6 个工具, 名字与金额语义固定', () => {
    const tools = getAllMCPToolDefinitions();
    expect(tools.map((t) => t.name)).toEqual([
      'add_tokens',
      'add_vitality',
      'complete_challenge',
      'add_badge',
      'add_dream_fund_progress',
      'record_impulse',
    ]);
  });

  it('每个工具 sourceCode 内嵌 def <name>( 与 _call_mcp 回调', () => {
    for (const tool of getAllMCPToolDefinitions()) {
      expect(tool.sourceCode).toContain(`def ${tool.name}(`);
      expect(tool.sourceCode).toContain(`_call_mcp("${tool.name}"`);
      // 通用回调函数本体必须随源码一起注册到 Letta
      expect(tool.sourceCode).toContain('def _call_mcp(tool_name: str, arguments: dict, user_id: str)');
    }
  });

  it('每个工具 schema type=object 且 required 含 user_id', () => {
    for (const tool of getAllMCPToolDefinitions()) {
      expect(tool.argsJsonSchema.type).toBe('object');
      const required = tool.argsJsonSchema.required as string[];
      expect(required).toContain('user_id');
    }
  });

  it('complete_challenge schema 三必填: user_id / challenge_type / saved_amount', () => {
    const tool = getAllMCPToolDefinitions().find((t) => t.name === 'complete_challenge');
    expect(tool?.argsJsonSchema.required).toEqual(['user_id', 'challenge_type', 'saved_amount']);
    const challengeType = (tool?.argsJsonSchema.properties as Record<string, { enum?: string[] }>).challenge_type;
    expect(challengeType.enum).toEqual(['quick_pass', 'standard', 'boss']);
  });

  it('回调 URL 来自 NEXT_PUBLIC_APP_URL (setup 预置 localhost:3000)', () => {
    const source = getAllMCPToolDefinitions()[0].sourceCode;
    expect(source).toContain(`"${process.env.NEXT_PUBLIC_APP_URL}/api/mcp"`);
  });
});

describe('模块加载期 env fail-closed', () => {
  it('NEXT_PUBLIC_APP_URL 与 VERCEL_URL 双缺 → 加载即 throw', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    await expect(freshImport()).rejects.toThrow(/NEXT_PUBLIC_APP_URL or VERCEL_URL is required/);
  });

  it('仅 VERCEL_URL 存在 → 自动补 https:// 作为回调 URL 兜底', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = 'fallback-app.vercel.app';
    const mod = await freshImport();
    expect(mod.getAllMCPToolDefinitions()[0].sourceCode).toContain(
      '"https://fallback-app.vercel.app/api/mcp"',
    );
  });
});

describe('MCP_API_SECRET 插值现状 (⚠️ N4 现状锁定)', () => {
  it('secret 值原样进入生成源码的 X-MCP-Secret header', async () => {
    process.env.MCP_API_SECRET = 'sentinel-secret-71b';
    const mod = await freshImport();
    const source = mod.getAllMCPToolDefinitions()[0].sourceCode;
    expect(source).toContain('"X-MCP-Secret": "sentinel-secret-71b"');
  });
});
