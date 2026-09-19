/**
 * E2E: inventory 域复用优先用户旅程 (batch88-b, BP p12/15/18 护城河)
 *
 * 物品清单查看卡 (batch84-a) 挂在登录态设置 overlay (settings-overlay, 非 demo
 * 才渲染) — 只读 + 删除。覆盖 zh/en 双侧真验: 三时间分组渲染 + 品类/来源 tag、
 * 空态引导、禁用态、网络失败降级、删除确认弹窗 (破坏性操作 UX 铁律) 的取消/
 * 成功乐观移除/失败回滚 + toast, 以及「无手动添加按钮」红线 (BP 冷启动不做表单,
 * 唯一入口是对话)。
 *
 * 与简报的偏差说明:
 * 1. 卡片实际挂载点是 profile(Me) 页右上角齿轮 → 设置 overlay (batch84-a 挂在
 *    settings-overlay), 「profile 页」按真实挂载链路走: 登录 → Me tab → 齿轮 → 卡片。
 * 2. 对话建库链路 (duplicate-purchase「家里有」→ 落库) 组件级已测 (batch81-c/84-a),
 *    e2e 不强测完整对话流 — 复杂度高收益低 (要 mock LLM 流式响应), 本文件只测查看面。
 *
 * 与 85-b 同款本地 mock 模式; 区别: inventory 卡是客户端 fetch /api/inventory,
 * page.route 即可拦截, 不需要 mock PostgREST 喂 SSR 数字 — mock 上游只承担
 * 伪 GoTrue 会话 (登录表单要吃真 session 响应) 和散装 API 路由的兜底。
 *
 * 运行前提 (本地 mock 模式; 未设开关时本文件整体跳过 — CI 对部署环境跑不受影响):
 *   MOCK_POSTGREST_AUTH=1 node e2e/fixtures/mock-postgrest.mjs &
 *   E2E_INVENTORY_MOCK=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_e2e_local_mock \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_e2e_local_mock \
 *   npx playwright test e2e/inventory.spec.ts --workers=1
 * (必须设 NEXT_PUBLIC_SUPABASE_ANON_KEY: 浏览器端 isSupabaseConfigured() 为真才会
 *  走登录/会话链路; transparency 不设它是为了跳过 proxy auth — 两套场景正交)
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const MOCK_ENABLED = process.env.E2E_INVENTORY_MOCK === '1';

test.skip(
  !MOCK_ENABLED,
  'inventory e2e 需要本地 mock GoTrue (E2E_INVENTORY_MOCK=1) — 用法见本文件头'
);

/** mock 数据口径 — 物品行 (InventoryItemRow 服务端契约的子集: id/item_name/category/source/created_at) */
interface MockItem {
  id: string;
  item_name: string;
  category: string | null;
  source: string;
  created_at: string;
}

/** 三个物品横跨三个时间分组 + 三品类 + 双来源 (与 groupInventoryItems 的桶界留足余量) */
function mockItems(): MockItem[] {
  const now = Date.now();
  return [
    // 今天 (当前时刻必然 ≥ 今天 0 点, 无 midnight 边界风险)
    { id: 'a1000000-0000-4000-8000-000000000001', item_name: 'Kindle Paperwhite', category: 'electronics', source: 'chat', created_at: new Date(now).toISOString() },
    // 2 天前 → 本周 (groupInventoryItems: 周桶 = 今天 0 点起 7 天窗口)
    { id: 'a1000000-0000-4000-8000-000000000002', item_name: 'Stand Mixer', category: 'home', source: 'chat', created_at: new Date(now - 2 * 86_400_000).toISOString() },
    // 10 天前 → 更早 (超出 7 天窗口)
    { id: 'a1000000-0000-4000-8000-000000000003', item_name: 'Olive Oil 3L', category: 'food', source: 'manual', created_at: new Date(now - 10 * 86_400_000).toISOString() },
  ];
}

interface InventoryMockOptions {
  /** GET 返回的物品 (引用透传, DELETE 成功会从中移除 → 刷新后不复活) */
  items?: MockItem[];
  /** GET 是否带 inventoryEnabled:true — false 即「表未建」禁用态 */
  enabled?: boolean;
  /** DELETE 该 id 时返回 500 (乐观删除失败回滚分支) */
  failDeleteFor?: string;
}

/**
 * 浏览器层拦截 /api/inventory (GET 列表 / DELETE ?id=)。
 * 有状态: DELETE 成功即从本地列表移除, 模拟真实服务端 — 让 onSettled 的
 * invalidateQueries 重取后物品也不复活, 断言稳定。
 */
async function installInventoryRoutes(page: Page, opts: InventoryMockOptions = {}): Promise<void> {
  const items = [...(opts.items ?? mockItems())];
  await page.route('**/api/inventory*', (route: Route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items, inventoryEnabled: opts.enabled !== false }),
      });
    }
    if (method === 'DELETE') {
      const url = new URL(request.url());
      const id = url.searchParams.get('id') ?? '';
      if (opts.failDeleteFor && id === opts.failDeleteFor) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to delete item' }),
        });
      }
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Item not found' }) });
      }
      items.splice(idx, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Method not allowed' }) });
  });
}

/** 登录态下让页面安静: onboarding 显示条件 (服务端 flag) + 每日仪式显示条件, 都走可拦截的客户端 fetch */
async function suppressPostLoginOverlays(page: Page): Promise<void> {
  await page.route('**/api/user/onboarding*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ onboarding_completed: true }) })
  );
  await page.route('**/api/user/ritual-status*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shouldShow: false, lastRitualAt: null, intervalMs: 0 }) })
  );
}

/**
 * 用产品自己的登录表单走真登录流: mock GoTrue (auth-mode) 签发 session →
 * @supabase/ssr 写 cookie → isDemo=false。登录成功后页面硬跳 '/' (next-intl
 * 补 locale 前缀, 依 accept-language), 再显式 goto 目标 locale 页保证语言确定。
 */
async function loginViaForm(page: Page, locale: 'zh' | 'en'): Promise<void> {
  await page.goto(`/${locale}/auth/login`);
  await page.getByPlaceholder('you@example.com').fill('e2e-inventory@example.com');
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(en|zh)\/?$/, { timeout: 20_000 });
  await page.goto(`/${locale}`);
}

/** 登录后进 Me tab → 右上角齿轮 → 设置 overlay 里的物品清单卡 */
async function openInventoryCard(page: Page, locale: 'zh' | 'en'): Promise<void> {
  const meLabel = locale === 'zh' ? '👤 我的' : '👤 Me';
  await page.getByRole('button', { name: meLabel }).click();
  const gearLabel = locale === 'zh' ? '设置' : 'Settings';
  await page.getByRole('button', { name: gearLabel, exact: true }).click();
  // 卡片加载: skeleton 一闪而过, 等终态 (normal / empty / disabled 由各测试自己断言)。
  // 空态下 empty 容器嵌套在 card 容器里, .or() 会命中 2 元素 → first() 取「任一可见」语义
  await expect(
    page.getByTestId('inventory-list-card').or(page.getByTestId('inventory-list-card-empty')).or(page.getByTestId('inventory-list-card-disabled')).or(page.getByTestId('inventory-list-card-skeleton')).first()
  ).toBeVisible();
}

/** 「无手动添加按钮」红线: 卡片里唯一的交互按钮是每条物品的删除 (aria-label 同款) */
async function expectNoManualAddButton(page: Page, locale: 'zh' | 'en'): Promise<void> {
  const deleteAria = locale === 'zh' ? '删除这条物品' : 'Delete this item';
  const card = page.getByTestId('inventory-list-card');
  const buttons = card.getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(buttons.nth(i)).toHaveAttribute('aria-label', deleteAria);
  }
}

/** 页面同款日期格式化 (browser TZ 固定 Asia/Shanghai, 显式传 tz 与 Node 进程时区解耦) */
function fmtDate(iso: string, locale: 'zh' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(iso));
}

test.describe('inventory 复用优先用户旅程 (mock GoTrue)', () => {
  test('zh 渲染: 三时间分组 + 品类/来源 tag + headline, 且无手动添加按钮', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await installInventoryRoutes(page);
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    const card = page.getByTestId('inventory-list-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('inventory-list-card-headline')).toHaveText('3 件在册 · 还在生长');

    // 三分组标题齐全, 各含自己的物品 (空桶丢弃 → 三个都非空)
    const groups = page.getByTestId('inventory-list-card-groups');
    await expect(groups).toBeVisible();
    await expect(groups.getByText('今天', { exact: true })).toBeVisible();
    await expect(groups.getByText('本周', { exact: true })).toBeVisible();
    await expect(groups.getByText('更早', { exact: true })).toBeVisible();

    // 品类 tag (chat 建库品类集走 i18n) + 来源 tag (对话/手动) + 加入日期
    const kindle = page.getByTestId('inventory-item-a1000000-0000-4000-8000-000000000001');
    await expect(kindle).toContainText('Kindle Paperwhite');
    await expect(kindle).toContainText('数码');
    await expect(kindle).toContainText('对话');
    await expect(kindle).toContainText(`${fmtDate(mockItems()[0].created_at, 'zh')} 加入`);

    const mixer = page.getByTestId('inventory-item-a1000000-0000-4000-8000-000000000002');
    await expect(mixer).toContainText('家居');
    await expect(mixer).toContainText('对话');

    const oil = page.getByTestId('inventory-item-a1000000-0000-4000-8000-000000000003');
    await expect(oil).toContainText('食品');
    await expect(oil).toContainText('手动');

    // 红线固化: 无手动添加按钮 (BP 冷启动不做表单)
    await expectNoManualAddButton(page, 'zh');
  });

  test('en 渲染: 同链路英文 (i18n 双侧真验)', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await installInventoryRoutes(page);
    await loginViaForm(page, 'en');
    await openInventoryCard(page, 'en');

    const card = page.getByTestId('inventory-list-card');
    await expect(card.getByText('Your Inventory')).toBeVisible();
    await expect(page.getByTestId('inventory-list-card-headline')).toHaveText('3 items · still growing');

    const groups = page.getByTestId('inventory-list-card-groups');
    await expect(groups.getByText('Today', { exact: true })).toBeVisible();
    await expect(groups.getByText('This week', { exact: true })).toBeVisible();
    await expect(groups.getByText('Earlier', { exact: true })).toBeVisible();

    const kindle = page.getByTestId('inventory-item-a1000000-0000-4000-8000-000000000001');
    await expect(kindle).toContainText('Electronics');
    await expect(kindle).toContainText('Chat');
    const oil = page.getByTestId('inventory-item-a1000000-0000-4000-8000-000000000003');
    await expect(oil).toContainText('Food');
    await expect(oil).toContainText('Manual');
    await expect(oil).toContainText(`Added ${fmtDate(mockItems()[2].created_at, 'en')}`);

    await expectNoManualAddButton(page, 'en');
  });

  test('zh 空态: 引导去对话, 文案点明无手动添加', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await installInventoryRoutes(page, { items: [], enabled: true });
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    const empty = page.getByTestId('inventory-list-card-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('在对话里聊到已有物品，会自动记进这份清单');
    await expect(empty).toContainText('这里不做手动添加 — 对话里说一声就行');
    // 空态下不应渲染任何物品行或删除按钮
    await expect(page.getByTestId('inventory-list-card-groups')).toHaveCount(0);
    await expect(page.getByTestId('inventory-rollback-toast')).toHaveCount(0);
  });

  test('zh 禁用态: inventoryEnabled:false → 「即将上线」轻提示', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await installInventoryRoutes(page, { items: [], enabled: false });
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    const disabled = page.getByTestId('inventory-list-card-disabled');
    await expect(disabled).toBeVisible();
    await expect(disabled).toContainText('物品清单');
    await expect(disabled).toContainText('清单功能即将上线');
    await expect(page.getByTestId('inventory-list-card')).toHaveCount(0);
    await expect(page.getByTestId('inventory-list-card-empty')).toHaveCount(0);
  });

  test('zh 网络失败降级: GET 中断 → 降级为禁用态, 查看面不炸', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await page.route('**/api/inventory*', (route) => route.abort('connectionrefused'));
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    // fetchInventory 的 catch 分支: 任何失败一律降级 inventoryEnabled:false
    await expect(page.getByTestId('inventory-list-card-disabled')).toBeVisible();
    await expect(page.getByTestId('inventory-list-card-disabled')).toContainText('清单功能即将上线');
  });

  test('zh 删除流: 必现确认弹窗, 取消不动数据 (破坏性操作 UX 铁律)', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await installInventoryRoutes(page);
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    const kindleId = 'a1000000-0000-4000-8000-000000000001';
    await page.getByTestId(`inventory-item-delete-${kindleId}`).click();

    // 确认弹窗出现, 文案带物品名
    const dialog = page.getByTestId('inventory-delete-confirm');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('删除这条物品？');
    await expect(dialog).toContainText('「Kindle Paperwhite」会从清单里移除，无法恢复。');

    // 取消 → 弹窗消失, 物品原位
    await page.getByTestId('inventory-delete-cancel').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId(`inventory-item-${kindleId}`)).toBeVisible();
    await expect(page.getByTestId('inventory-list-card-headline')).toHaveText('3 件在册 · 还在生长');
  });

  test('zh 删除流: 确认 → 乐观移除, 重取后不复活', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    await installInventoryRoutes(page);
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    const oilId = 'a1000000-0000-4000-8000-000000000003';
    await page.getByTestId(`inventory-item-delete-${oilId}`).click();
    await page.getByTestId('inventory-delete-confirm-yes').click();

    // 弹窗关闭 + 乐观移除 (stateful mock 让 onSettled 的重取也拿不回该物品)
    await expect(page.getByTestId('inventory-delete-confirm')).toHaveCount(0);
    await expect(page.getByTestId(`inventory-item-${oilId}`)).toHaveCount(0);
    await expect(page.getByTestId('inventory-list-card-headline')).toHaveText('2 件在册 · 还在生长');
    // 成功路径不应弹回滚 toast
    await expect(page.getByTestId('inventory-rollback-toast')).toHaveCount(0);
  });

  test('zh 删除流失败: DELETE 500 → 乐观移除回滚 + toast', async ({ page }) => {
    await suppressPostLoginOverlays(page);
    const mixerId = 'a1000000-0000-4000-8000-000000000002';
    await installInventoryRoutes(page, { failDeleteFor: mixerId });
    await loginViaForm(page, 'zh');
    await openInventoryCard(page, 'zh');

    await page.getByTestId(`inventory-item-delete-${mixerId}`).click();
    await page.getByTestId('inventory-delete-confirm-yes').click();

    // 失败: 回滚 toast + 物品被恢复
    const toast = page.getByTestId('inventory-rollback-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('删除失败，已帮你恢复');
    await expect(page.getByTestId(`inventory-item-${mixerId}`)).toBeVisible();
    await expect(page.getByTestId('inventory-list-card-headline')).toHaveText('3 件在册 · 还在生长');
  });
});
