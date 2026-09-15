/**
 * Playwright 配置 — Round 120 audit fix (AUDIT-4)
 *
 * 🔧 之前没有 playwright.config.ts, npx playwright test 无法运行
 *    415 行 E2E 测试代码 (3 spec 文件) 成为死代码
 *
 * 此配置启用:
 * - Chromium only (节省 CI 时间)
 * - 3 retries on CI, 0 locally
 * - 视频录制 (仅失败时)
 * - 截图 (仅失败时)
 * - Trace (仅首次重试时)
 * - 测试目录: e2e/
 * - Base URL: 本地 dev server (CI 可用 E2E_BASE_URL 覆盖到生产 URL)
 */

import { defineConfig, devices } from '@playwright/test';

// Playwright 进程自身不加载 .env (Next.js 只为 app 进程加载), 贡献者在 .env 填 E2E_* 即可生效。
// 已存在的 shell env 优先 (Node --env-file 语义), CI secrets 不受影响; .env 缺失时静默跳过。
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env 不存在 — 直接使用 shell env / CI secrets
  }
}

const isCI = !!process.env.CI;
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !isCI,  // 本地并行, CI 串行 (避免 Vercel 函数并发限制)
  forbidOnly: isCI,       // CI 不允许 test.only
  retries: isCI ? 3 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,        // 60s per test (登录+操作)
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: isCI ? 'only-on-failure' : 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'retain-on-failure',
    // 真实用户视角: desktop Chrome
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'Asia/Shanghai',
    // 忽略 HTTPS 错误 (Vercel preview 偶尔证书问题)
    ignoreHTTPSErrors: true,
    // 测试账号 (e2e/helpers.ts 也读这两个)
    // 但不通过 Playwright config 传 — 让 helpers.ts 管理
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 本地: 自动启动 dev server; CI: 用 E2E_BASE_URL 指向已部署环境
  ...(process.env.E2E_BASE_URL ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCI,
      timeout: 120_000,  // 2 min for first build
    },
  }),
});
