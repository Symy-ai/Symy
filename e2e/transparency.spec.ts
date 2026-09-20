/**
 * E2E: transparency 域 build in public 主链路 (batch85-b)
 *
 * 覆盖 zh/en 双侧真验: 周报指标卡数字、CO₂ 口径声明、增长区块 K 因子、订阅表单 +
 * 成功胶囊、分享按钮 window.open → x.com/intent/tweet (无金额红线)、财务页可达
 * 且渲染月账表、OG 卡恒 200 (正常 + 降级)、降级横幅 + 增长区块隐藏。
 *
 * 与简报的实现偏差: 页面数据是 RSC 服务端直调 loadTransparencyWeekly() — 浏览器
 * 层 page.route 拦截 /api/transparency/weekly 拦不到 SSR 数字, 确定性数字改由
 * mock PostgREST 上游提供 (e2e/fixtures/mock-postgrest.mjs); 浏览器可拦截的订阅
 * fetch 仍用 page.route; /api/transparency/weekly 本身做真请求 + 与页面数字交叉核对。
 *
 * 运行前提 (本地 mock 模式; 未设开关时本文件整体跳过 — CI 对部署环境跑不受影响):
 *   node e2e/fixtures/mock-postgrest.mjs &
 *   E2E_TRANSPARENCY_MOCK=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_e2e_local_mock \
 *   npx playwright test e2e/transparency.spec.ts --workers=1
 * (不给 NEXT_PUBLIC_SUPABASE_ANON_KEY → proxy.ts 跳过 auth 检查, mock 只需仿真 /rest/v1/*)
 *
 * 串行原因 (--workers=1 + serial): 末位用例把 mock 切 fail-mode 验降级, 必须最后跑。
 */

import { test, expect, type Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MOCK_ENABLED = process.env.E2E_TRANSPARENCY_MOCK === '1';
const MOCK_BASE = `http://127.0.0.1:${process.env.MOCK_POSTGREST_PORT ?? 54399}`;

test.skip(
  !MOCK_ENABLED,
  'transparency e2e 需要本地 mock PostgREST (E2E_TRANSPARENCY_MOCK=1) — 用法见 e2e/fixtures/mock-postgrest.mjs'
);

test.describe.configure({ mode: 'serial' });

/** mock 数据口径 — 与 mock-postgrest.mjs 文件头锚点一一对应 */
const EXPECTED = {
  interceptsWeek: 12,
  interceptsTotal: 17,
  savedWeek: 340,
  savedTotal: 1000,
  hoursWeek: 13.6,
  guards: 42,
  invitesTotal: 6,
  invitesCompleted: 4,
  uniqueInviters: 5,
  kFactor: 0.8,
};

/** 页面同款格式化 (page.tsx formatInt / formatDecimal) — 供数字交叉核对 */
function fmtInt(n: number, locale: 'zh' | 'en'): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(Math.max(0, Math.round(n)));
}

function fmtDecimal(n: number, locale: 'zh' | 'en'): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(Math.max(0, n));
}

function fmtUsd(n: number, locale: 'zh' | 'en'): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(Math.max(0, n));
}

interface FinanceFixture {
  month: string;
  members: number;
  revenueUsd: { membership: number; other: number };
  costsUsd: { infra: number; ai: number; team: number };
}

async function loadFinanceFixtures(): Promise<FinanceFixture[]> {
  const dir = path.join(process.cwd(), 'src', 'data', 'finance');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(path.join(dir, file), 'utf8')) as FinanceFixture)
  );
}

async function expectMetricHeroes(page: Page, locale: 'zh' | 'en'): Promise<void> {
  await expect(page.getByTestId('transparency-intercepts-hero')).toHaveText(
    fmtInt(EXPECTED.interceptsWeek, locale)
  );
  await expect(page.getByTestId('transparency-saved-hero')).toHaveText(
    `$${fmtInt(EXPECTED.savedWeek, locale)}`
  );
  await expect(page.getByTestId('transparency-hours-hero')).toHaveText(
    fmtDecimal(EXPECTED.hoursWeek, locale)
  );
  await expect(page.getByTestId('transparency-guards-hero')).toHaveText(
    fmtInt(EXPECTED.guards, locale)
  );
}

type OpenCaptureWindow = Window & { __e2eOpenedUrls?: string[] };

/** 劫持 window.open — 分享意图 URL 落进数组供断言, 不真开新窗口 */
async function captureWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as OpenCaptureWindow;
    win.__e2eOpenedUrls = [];
    win.open = ((url?: string | URL) => {
      win.__e2eOpenedUrls?.push(String(url));
      return null;
    }) as typeof window.open;
  });
}

function readOpenedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as OpenCaptureWindow).__e2eOpenedUrls ?? []);
}

async function expectShareIntentFired(page: Page): Promise<string> {
  let urls: string[] = [];
  await expect
    .poll(
      async () => {
        urls = await readOpenedUrls(page);
        return urls.length;
      },
      { timeout: 5_000 }
    )
    .toBeGreaterThan(0);
  return decodeURIComponent(urls[0] ?? '');
}

test.describe('transparency build-in-public 主链路 (mock PostgREST)', () => {
  test('GET /api/transparency/weekly 返回确定性 mock 快照', async ({ request }) => {
    const res = await request.get('/api/transparency/weekly');
    expect(res.status()).toBe(200);
    const snapshot = (await res.json()) as {
      degraded: boolean;
      weekStart: string;
      intercepts: { week: number; total: number };
      savedUsd: { week: number; total: number };
      hoursWon: { week: number; total: number };
      co2SavedKg: { week: number; total: number };
      guards: number;
    };
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.intercepts).toEqual({
      week: EXPECTED.interceptsWeek,
      total: EXPECTED.interceptsTotal,
    });
    expect(snapshot.savedUsd).toEqual({ week: EXPECTED.savedWeek, total: 1000 });
    expect(snapshot.hoursWon).toEqual({ week: EXPECTED.hoursWeek, total: 40 });
    expect(snapshot.guards).toBe(EXPECTED.guards);
    // weekStart = UTC 周一 00:00 (聚合口径)
    const weekStart = new Date(snapshot.weekStart);
    expect(weekStart.getUTCDay()).toBe(1);
    expect(weekStart.getUTCHours()).toBe(0);
  });

  test('zh 周报页: 指标卡数字 + CO₂ 口径行, 与 API 交叉一致', async ({ page }) => {
    await page.goto('/zh/transparency');
    await expect(page.getByTestId('transparency-title')).toHaveText('每周透明度报告');
    await expectMetricHeroes(page, 'zh');
    await expect(page.getByTestId('transparency-intercepts')).toContainText('本周');
    await expect(page.getByTestId('transparency-intercepts')).toContainText(
      `累计 ${fmtInt(EXPECTED.interceptsTotal, 'zh')}`
    );
    await expect(page.getByTestId('transparency-saved')).toContainText(
      `累计 $${fmtInt(1000, 'zh')}`
    );
    await expect(page.getByTestId('transparency-degraded')).toHaveCount(0);
    // 口径红线: CO₂ 估算声明 + 口径行随数可见, 且链到开源仓库口径文件
    await expect(page.getByTestId('transparency-co2')).toContainText('CO₂ 减排量（公斤）');
    await expect(page.getByTestId('transparency-caliber')).toContainText(
      'CO₂ 减排量是基于居民消费碳强度的估算值，非实测'
    );
    await expect(page.getByTestId('transparency-co2-link')).toBeVisible();
  });

  test('zh 增长区块: K 因子 + 邀请漏斗三数字', async ({ page }) => {
    await page.goto('/zh/transparency');
    const growth = page.getByTestId('transparency-growth');
    await expect(growth).toBeVisible();
    await expect(page.getByTestId('transparency-growth-k-hero')).toHaveText(
      String(EXPECTED.kFactor)
    );
    await expect(growth).toContainText('K 因子（近似值）');
    await expect(growth.getByTestId('transparency-growth-sent')).toContainText(
      String(EXPECTED.invitesTotal)
    );
    await expect(growth.getByTestId('transparency-growth-completed')).toContainText(
      String(EXPECTED.invitesCompleted)
    );
    await expect(growth.getByTestId('transparency-growth-inviters')).toContainText(
      String(EXPECTED.uniqueInviters)
    );
    await expect(growth).toContainText('completed 邀请 ÷ 去重邀请者');
  });

  test('zh 订阅表单存在: 空邮箱禁用按钮, 填邮箱启用', async ({ page }) => {
    await page.goto('/zh/transparency');
    const form = page.getByTestId('transparency-subscribe');
    await expect(form.getByTestId('transparency-subscribe-title')).toHaveText('订阅每周透明度报告');
    const input = form.getByTestId('transparency-subscribe-input');
    const button = form.getByTestId('transparency-subscribe-button');
    await expect(input).toBeVisible();
    await expect(button).toBeDisabled();
    await input.fill('e2e-reader@example.com');
    await expect(button).toBeEnabled();
  });

  test('zh 订阅成功: 显示「已订阅，下周见」胶囊 (拦截浏览器 fetch)', async ({ page }) => {
    // 订阅是客户端 fetch → page.route 可拦截; SSR 直调链路在 mock-postgrest 上游喂
    await page.route('**/api/transparency/subscribe', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    );
    await page.goto('/zh/transparency');
    await page.getByTestId('transparency-subscribe-input').fill('e2e-reader@example.com');
    await page.getByTestId('transparency-subscribe-button').click();
    await expect(page.getByTestId('transparency-subscribe-success')).toHaveText('已订阅，下周见');
  });

  test('zh 订阅暂不可用: 503 显示「订阅即将上线」胶囊', async ({ page }) => {
    await page.route('**/api/transparency/subscribe', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'subscription table is not ready' }),
      })
    );
    await page.goto('/zh/transparency');
    await page.getByTestId('transparency-subscribe-input').fill('e2e-reader@example.com');
    await page.getByTestId('transparency-subscribe-button').click();
    await expect(page.getByTestId('transparency-subscribe-unavailable')).toHaveText('订阅即将上线');
    await expect(page.getByTestId('transparency-subscribe-success')).toHaveCount(0);
    await expect(page.getByTestId('transparency-subscribe-error')).toHaveCount(0);
  });

  test('zh 分享按钮: window.open 指向 x.com/intent/tweet 且无金额红线', async ({ page }) => {
    await captureWindowOpen(page);
    await page.goto('/zh/transparency');
    await page.getByTestId('transparency-share').click();
    const intent = await expectShareIntentFired(page);
    expect(intent).toContain('https://x.com/intent/tweet');
    expect(intent).toContain('拦截了 12 次');
    expect(intent).toContain('13.6 小时');
    expect(intent).toContain('transparency');
    expect(intent).not.toMatch(/[$¥€£]/);
    expect(intent).not.toContain('saved');
  });

  test('en 周报页: 同链路英文渲染 (i18n 双侧真验)', async ({ page }) => {
    await page.goto('/en/transparency');
    await expect(page.getByTestId('transparency-title')).toHaveText('Weekly Transparency Report');
    await expectMetricHeroes(page, 'en');
    await expect(page.getByTestId('transparency-co2')).toContainText('CO₂ avoided (kg)');
    await expect(page.getByTestId('transparency-caliber')).toContainText(
      'CO₂ avoided is an estimate'
    );
    await expect(page.getByTestId('transparency-growth-k-hero')).toHaveText(
      String(EXPECTED.kFactor)
    );
    await expect(page.getByTestId('transparency-growth')).toContainText('K-factor (approx.)');
    await expect(page.getByTestId('transparency-subscribe-title')).toHaveText(
      'Subscribe to the weekly transparency report'
    );
    await expect(page.getByTestId('transparency-share')).toContainText('Share on X');
    await expect(page.getByTestId('transparency-degraded')).toHaveCount(0);
  });

  test('en 分享按钮: 英文文案且无金额红线', async ({ page }) => {
    await captureWindowOpen(page);
    await page.goto('/en/transparency');
    await page.getByTestId('transparency-share').click();
    const intent = await expectShareIntentFired(page);
    expect(intent).toContain('https://x.com/intent/tweet');
    expect(intent).toContain('intercepted 12 impulse buys');
    expect(intent).toContain('13.6 hours');
    expect(intent).not.toMatch(/[$¥€£]/);
    expect(intent).not.toContain('saved');
  });

  test('财务公开页: 从周报页链接可达, 渲染月账表 (zh)', async ({ page }) => {
    await page.goto('/zh/transparency');
    const link = page.getByTestId('transparency-finance-link');
    await expect(link).toHaveAttribute('href', '/zh/transparency/finance');
    await link.click();
    await expect(page).toHaveURL(/\/zh\/transparency\/finance$/);
    // dev 模式 client-nav 过渡期, Next 的 #S:0 segment 容器会短暂滞留上一棵渲染树
    // (祖先 display:none, 数秒后自动回收, 用户不可见) — 断言统一取用户可见的那份
    const visible = (testId: string) => page.locator(`[data-testid="${testId}"]:visible`);
    await expect(visible('finance-title')).toHaveText('财务公开');
    await expect(visible('finance-table')).toBeVisible();
    const financeMonths = await loadFinanceFixtures();
    expect(financeMonths.length).toBeGreaterThan(0);
    await expect(visible('finance-table')).toContainText('月份');
    await expect(visible('finance-table')).toContainText('会员数');
    for (const month of financeMonths) {
      const revenue = month.revenueUsd.membership + month.revenueUsd.other;
      const costs = month.costsUsd.infra + month.costsUsd.ai + month.costsUsd.team;
      const row = visible(`finance-row-${month.month}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(month.month);
      await expect(row).toContainText(fmtInt(month.members, 'zh'));
      await expect(row).toContainText(`$${fmtUsd(revenue, 'zh')}`);
      await expect(row).toContainText(`$${fmtUsd(costs, 'zh')}`);
      await expect(row).toContainText(`-$${fmtUsd(costs - revenue, 'zh')}`);
    }
    // 仓库静态数据当前为全零示例月 → 占位说明必须随表出现 (诚实原则)
    await expect(visible('finance-placeholder')).toContainText('零值占位');
    await expect(visible('finance-page')).toContainText('收入只来自会员费');
  });

  test('财务公开页 en: 英文渲染', async ({ page }) => {
    await page.goto('/en/transparency/finance');
    await expect(page.getByTestId('finance-title')).toHaveText('Financial Transparency');
    await expect(page.locator('[data-testid="finance-row-2026-09"]:visible')).toBeVisible();
    await expect(page.locator('[data-testid="finance-placeholder"]:visible')).toContainText(
      'zero placeholders'
    );
  });

  test('OG 分享卡: zh/en 都 200 + image/*', async ({ request }) => {
    for (const locale of ['zh', 'en'] as const) {
      const res = await request.get(`/${locale}/transparency/og`);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type'] ?? '').toMatch(/^image\//);
      expect((await res.body()).length).toBeGreaterThan(1000);
    }
  });

  test('降级分支: 页面/OG 恒 200, 降级横幅 + 增长区块隐藏', async ({ page, request }) => {
    await request.get(`${MOCK_BASE}/__e2e/fail-mode?on=1`);
    try {
      // API 壳: 恒 200 + degraded 标记 (降级红线, 不抛 500)
      const api = await request.get('/api/transparency/weekly');
      expect(api.status()).toBe(200);
      expect(((await api.json()) as { degraded: boolean }).degraded).toBe(true);

      // 页面: 降级横幅可见 (展示最近缓存快照), 增长区块整段隐藏 (不展示假数据)
      await page.goto('/zh/transparency');
      await expect(page.getByTestId('transparency-degraded')).toBeVisible();
      await expect(page.getByTestId('transparency-intercepts-hero')).toBeVisible();
      await expect(page.getByTestId('transparency-growth')).toHaveCount(0);

      // OG: 降级也 200 图片
      for (const locale of ['zh', 'en'] as const) {
        const og = await request.get(`/${locale}/transparency/og`);
        expect(og.status()).toBe(200);
        expect(og.headers()['content-type'] ?? '').toMatch(/^image\//);
      }
    } finally {
      await request.get(`${MOCK_BASE}/__e2e/fail-mode?on=0`);
    }
    // 复位确认 — 不给后续运行留脏态
    const restored = await request.get('/api/transparency/weekly');
    expect(((await restored.json()) as { degraded: boolean }).degraded).toBe(false);
  });
});
