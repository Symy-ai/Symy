/**
 * Vitest global setup
 *
 * 🔧 ARCH fix (Round 7 AUDIT-3 P0 #4): 之前每个 test file 都重新 mock next/headers, fs, etc.
 *    根因修复: 集中到 setup file, 测试代码专注于业务逻辑断言。
 *
 * 此文件在 vitest.config.ts 的 setupFiles 中配置, 每个 test file 运行前自动加载。
 */

// 🔧 2026-07-21 audit fix (test infra — eliminate TZ flakiness):
//   生产部署在 Vercel (UTC), CI 也跑在 UTC。但开发者本机可能不在 UTC (如中国 UTC+8),
//   导致用 getHours() (server-local TZ) 分类时段的代码/测试 flaky ——
//   e.g. buddy-proactive-messages detectTriggers 用 now.getHours() 判早/晚提醒,
//        blind-spot-map route 用 getHours() 判深夜盲区。
//   这些测试传 UTC 时刻 (T20:00:00Z), 在 UTC 机 hour=20 (晚), 在 UTC+8 机 hour=4 (晨) →
//   同一测试在 CI 绿、本地红。统一强制 UTC = 匹配 CI/生产 + 消除 flakiness。
//   必须在任何 Date 使用前设置 (Node 22 尊重运行时 process.env.TZ, 已验证)。
process.env.TZ = 'UTC';

import { vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// 全局 mocks — 适用于所有 test files
// ============================================================

// 1. next/headers — 大量 API route 间接依赖 (cookies, headers)
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    getAll: vi.fn(() => []),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Headers()),
}));

// 1b. server-only — package that throws when imported from client bundle.
// 🔧 ARCH fix Round 73: 11 server-only lib files now `import 'server-only'` to prevent
// admin service key from leaking to client bundle. In tests (vitest node env), the package
// throws — so we mock it to a no-op. The architecture-guards test separately verifies that
// client components don't import these lib files.
vi.mock('server-only', () => ({}));

// 注意: 不 mock @/lib/logger — 一些测试 (logger.test.ts, json-helpers.test.ts) 需要真实 logger 行为
// 需要 mock logger 的测试请在该 test file 内部 vi.mock('@/lib/logger', ...)

// ============================================================
// 环境变量 — 测试用固定值
// ============================================================

// 🔧 ARCH fix Round 73: Set MCP_API_SECRET at module load (before any test imports the
// route). The /api/mcp/server route reads `process.env.MCP_API_SECRET` at module load
// into a const, so beforeEach is too late.
process.env.MCP_API_SECRET = process.env.MCP_API_SECRET || 'test-mcp-secret';

// 🔧 2026-07-21 audit: UPSTREAM_LLM_API_KEY read at module load by /api/v1 routes
//    (const UPSTREAM_API_KEY = process.env.UPSTREAM_LLM_API_KEY). Must be set before
//    those route modules import, else they 503 in tests.
process.env.UPSTREAM_LLM_API_KEY = process.env.UPSTREAM_LLM_API_KEY || 'test-upstream-key';

// 🔧 fail-closed URL support: mcp-letta-tools.ts, letta-mcp-manager.ts, _shared.ts read
//    NEXT_PUBLIC_APP_URL at module-load (fail-closed — throw if missing). Set it at top-level
//    (before ORIGINAL_ENV capture) so it is present when those modules are first imported.
//    beforeEach re-sets it per-test; this top-level line covers the initial module-load window.
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // 设置测试环境变量 (覆盖 .env.local, 防止误用真实 credentials)
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  // NODE_ENV is read-only, use Reflect.defineProperty to override
  try {
    Reflect.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true, configurable: true });
  } catch {
    // Fallback: ignore (Node already sets NODE_ENV='test' when running vitest)
  }
  // Supabase 测试占位 (测试不会真连 DB, 但 import 时需要存在)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.ADMIN_API_KEY = 'test-admin-key';
  // MCP_API_SECRET — re-set in case afterEach cleared it (see ORIGINAL_ENV capture).
  process.env.MCP_API_SECRET = 'test-mcp-secret';
});

afterEach(() => {
  // 恢复环境变量
  process.env = { ...ORIGINAL_ENV };
  // Re-set MCP_API_SECRET after env reset (ORIGINAL_ENV may have empty value)
  process.env.MCP_API_SECRET = 'test-mcp-secret';
});

// ============================================================
// 全局 utility — 方便 test files 使用
// ============================================================

// JSON 响应解析 helper (NextResponse.json 在测试中可能不返回标准 Response)
if (typeof Response !== 'undefined' && !Response.prototype.json) {
  Response.prototype.json = async function() {
    const text = await this.text();
    return JSON.parse(text);
  };
}
