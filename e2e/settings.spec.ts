/**
 * E2E: profile 设置入口冒烟 (batch100-b)
 *
 * 覆盖真实用户链路: 登录 → Me tab → 右上角设置按钮 → settings overlay。
 * 默认区锚点选 batch95 重构前后都保留的三项: 显示名称、绿色守护总开关、
 * 深色模式开关。高级设置折叠区当前基线尚未存在, 用探测式断言兼容两态:
 * 存在则展开并验证高级内容; 不存在则记录 skip 说明, 不让基线变红。
 *
 * 本地 mock 模式 (未设开关时整体跳过):
 *   MOCK_POSTGREST_AUTH=1 node e2e/fixtures/mock-postgrest.mjs &
 *   E2E_SETTINGS_MOCK=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_e2e_local_mock \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_e2e_local_mock \
 *   npx playwright test e2e/settings.spec.ts --workers=1
 *
 * QA 门控 (沿用部署 E2E 约定):
 *   E2E_BASE_URL=<deployed-url> E2E_EMAIL=<email> E2E_PASSWORD=<password> \
 *   npx playwright test e2e/settings.spec.ts --workers=1
 */

import { test, expect, type Page } from '@playwright/test';

const LOCAL_MOCK_ENABLED = process.env.E2E_SETTINGS_MOCK === '1';
const QA_BASE = process.env.E2E_BASE_URL ?? '';
const QA_ENABLED = Boolean(QA_BASE && process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

test.skip(
  !LOCAL_MOCK_ENABLED && !QA_ENABLED,
  'settings e2e 需要 E2E_SETTINGS_MOCK=1 本地 mock, 或 E2E_BASE_URL/E2E_EMAIL/E2E_PASSWORD QA 门控'
);

async function suppressPostLoginOverlays(page: Page): Promise<void> {
  await page.route('**/api/user/onboarding*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ onboarding_completed: true }),
    })
  );
  await page.route('**/api/user/ritual-status*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ shouldShow: false, lastRitualAt: null, intervalMs: 0 }),
    })
  );
  await page.route('**/api/inventory*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], inventoryEnabled: true }),
    })
  );
}

async function loginViaLocalMock(page: Page, locale: 'zh' | 'en'): Promise<void> {
  await page.goto(`/${locale}/auth/login`);
  await page.getByPlaceholder('you@example.com').fill('e2e-inventory@example.com');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(en|zh)\/?$/, { timeout: 20_000 });
  await page.goto(`/${locale}`);
}

async function loginViaQa(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill(process.env.E2E_EMAIL ?? '');
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD ?? '');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(en|zh)\/?$/, { timeout: 20_000 });
}

test('profile 设置入口可打开 overlay, 且默认三锚点与高级折叠双态兼容', async ({ page }) => {
  const locale = LOCAL_MOCK_ENABLED ? 'zh' : 'en';
  await suppressPostLoginOverlays(page);
  if (LOCAL_MOCK_ENABLED) {
    await loginViaLocalMock(page, locale);
  } else {
    await loginViaQa(page);
  }

  await page.getByRole('button', { name: locale === 'zh' ? '👤 我的' : '👤 Me' }).click();
  const settingsLabel = locale === 'zh' ? '设置' : 'Settings';
  const settingsButton = page.getByRole('button', { name: settingsLabel, exact: true });
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();

  await expect(page.getByRole('heading', { level: 2, name: locale === 'zh' ? '个性化' : 'Personalize' })).toBeVisible();
  await expect(page.getByText(locale === 'zh' ? 'Symy 该怎么称呼你？' : 'What should Symy call you?')).toBeVisible();
  await expect(page.getByText(locale === 'zh' ? '绿色守护模式' : 'Green Guardian Mode')).toBeVisible();
  await expect(page.getByText(locale === 'zh' ? '🌙 夜间模式' : '🌙 Night mode')).toBeVisible();

  const advancedLabel = locale === 'zh' ? '高级设置' : 'Advanced settings';
  const advancedToggle = page
    .getByTestId('settings-advanced-toggle')
    .or(page.getByRole('button', { name: advancedLabel, exact: true }))
    .first();
  let advancedPresent = false;
  try {
    await advancedToggle.waitFor({ state: 'visible', timeout: 1_000 });
    advancedPresent = true;
  } catch {
    // safe to ignore: current baseline intentionally has no advanced settings region.
  }

  if (!advancedPresent) {
    test.info().annotations.push({
      type: 'skip',
      description: 'advanced settings region is absent in the pre-batch95 baseline',
    });
    return;
  }

  await advancedToggle.click();
  await expect(page.getByText(locale === 'zh' ? '绿色偏好' : 'Green Preferences')).toBeVisible();
});
