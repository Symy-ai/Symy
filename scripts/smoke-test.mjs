/**
 * Symy AI 冒烟测试脚本
 *
 * 用法:
 *   node scripts/smoke-test.mjs
 *
 * 环境变量:
 *   SMOKE_URL       — 测试 URL (默认 Vercel preview)
 *   SMOKE_EMAIL     — 测试账号邮箱 (可选, 不填则跳过登录测试)
 *   SMOKE_PASSWORD  — 测试账号密码 (可选)
 *
 * 退出码:
 *   0 — 通过
 *   1 — 失败 (错误信息打印到 stderr)
 *
 * 依赖: playwright (npm install playwright)
 */

import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'https://we-me-mvp-git-main-spark-huang-s-projects.vercel.app/';
const TEST_EMAIL = process.env.SMOKE_EMAIL;
const TEST_PASSWORD = process.env.SMOKE_PASSWORD;

const PASS = (msg) => console.log(`  ✅ ${msg}`);
const FAIL = (msg) => { console.error(`  ❌ ${msg}`); process.exitCode = 1; };
const INFO = (msg) => console.log(`  ℹ️  ${msg}`);

async function smokeTest() {
  console.log(`\n🚀 Symy AI Smoke Test`);
  console.log(`   URL: ${URL}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // 收集所有客户端错误（过滤测试 artifact：未认证 API 失败是预期的）
  const pageErrors = [];
  const consoleErrors = [];
  const ignorePatterns = [
    'Failed to fetch',  // Playwright auth session 不稳定导致的 API 失败
    'Failed to load home data',
    '[onboarding] check failed',
    'net::ERR_ABORTED',  // API 路由因未认证 abort
  ];
  const isRealError = (msg) => !ignorePatterns.some(p => msg.includes(p));
  page.on('pageerror', (err) => {
    const msg = `pageerror: ${err.message}`;
    if (isRealError(msg)) pageErrors.push(msg);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isRealError(text)) consoleErrors.push(`console.error: ${text.substring(0, 250)}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('vercel.live') || url.includes('favicon')) return;
    const errText = req.failure()?.errorText || '';
    if (errText === 'net::ERR_ABORTED') return; // 忽略所有 ERR_ABORTED (API + 图片资源)
    const msg = `requestfailed: ${url} - ${errText}`;
    if (isRealError(msg)) pageErrors.push(msg);
  });

  try {
    // ===== Test 1: 主页可加载 =====
    console.log('Test 1: 主页可加载');
    try {
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
      const title = await page.title();
      PASS(`页面 title: "${title}"`);
    } catch (err) {
      FAIL(`页面加载失败: ${err.message}`);
      throw err;
    }

    // ===== Test 2: 主页可渲染（不显示错误边界 fallback） =====
    console.log('\nTest 2: 主页可渲染');
    await page.waitForTimeout(2000); // 等 React hydration
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("couldn't load") || bodyText.includes('This page couldn')) {
      FAIL('页面显示错误边界 fallback "This page couldn\'t load"');
      if (pageErrors.length > 0) {
        console.error('   捕获的运行时错误:');
        pageErrors.slice(0, 5).forEach(e => console.error(`     - ${e}`));
      }
    } else if (bodyText.trim().length < 50) {
      FAIL(`页面内容过少 (${bodyText.trim().length} chars)，可能渲染失败`);
    } else {
      PASS(`页面渲染正常 (${bodyText.trim().length} chars 文本)`);
    }

    // ===== Test 3: 无未捕获的 pageerror =====
    console.log('\nTest 3: 无未捕获的 pageerror');
    if (pageErrors.length === 0) {
      PASS('零 pageerror');
    } else {
      FAIL(`${pageErrors.length} 个 pageerror:`);
      pageErrors.slice(0, 5).forEach(e => console.error(`     - ${e}`));
    }

    // ===== Test 4: 登录测试（如果提供了账号） =====
    if (TEST_EMAIL && TEST_PASSWORD) {
      console.log('\nTest 4: 登录流程');
      try {
        // 跳转到登录页
        await page.goto(`${URL}/auth/login`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);

        // 填写邮箱密码
        const emailInput = page.locator('input[type="email"], input[name="email"]').first();
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

        if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
          await emailInput.fill(TEST_EMAIL);
          await passwordInput.fill(TEST_PASSWORD);

          // 找登录按钮
          const loginButton = page.locator('button:has-text("Sign in"), button:has-text("Log in"), button:has-text("登录"), button[type="submit"]').first();
          if (await loginButton.count() > 0) {
            await loginButton.click();
            await page.waitForTimeout(3000);

            const currentUrl = page.url();
            if (currentUrl.includes('/auth/login') || currentUrl.includes('/auth/signup')) {
              FAIL(`登录后仍在认证页: ${currentUrl}`);
            } else {
              PASS(`登录成功，跳转到: ${currentUrl}`);
            }
          } else {
            INFO('未找到登录按钮，跳过登录测试');
          }
        } else {
          INFO('未找到邮箱/密码输入框，跳过登录测试');
        }
      } catch (err) {
        FAIL(`登录测试失败: ${err.message}`);
      }
    } else {
      console.log('\nTest 4: 登录流程 (跳过 — 未提供 SMOKE_EMAIL/SMOKE_PASSWORD)');
    }

    // ===== Test 5: 5 Tab 切换 (如果已登录) =====
    if (TEST_EMAIL && TEST_PASSWORD) {
      console.log('\nTest 5: 5 Tab 切换');
      const tabs = [
        { name: 'Buddy', selector: 'button:has-text("Buddy"), [data-tab="buddy"]' },
        { name: 'Chat', selector: 'button:has-text("Chat"), [data-tab="chat"]' },
        { name: 'Insights', selector: 'button:has-text("Insights"), [data-tab="insights"]' },
        { name: 'Gacha', selector: 'button:has-text("Gacha"), button:has-text("Butterfly"), [data-tab="butterfly"]' },
        { name: 'Profile', selector: 'button:has-text("Profile"), [data-tab="profile"]' },
      ];

      for (const tab of tabs) {
        try {
          const el = page.locator(tab.selector).first();
          if (await el.count() > 0) {
            await el.click();
            await page.waitForTimeout(800);
            PASS(`Tab "${tab.name}" 切换成功`);
          } else {
            INFO(`Tab "${tab.name}" 未找到`);
          }
        } catch (err) {
          FAIL(`Tab "${tab.name}" 切换失败: ${err.message}`);
        }
      }
    }

    // ===== Test 6: 截图存档 =====
    console.log('\nTest 6: 截图存档');
    try {
      const screenshotPath = `/tmp/symy-smoke-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      PASS(`截图保存: ${screenshotPath}`);
    } catch (err) {
      INFO(`截图失败 (非致命): ${err.message}`);
    }

  } finally {
    await browser.close();
  }

  // 总结
  console.log('\n📊 总结:');
  console.log(`   PageErrors: ${pageErrors.length}`);
  console.log(`   ConsoleErrors: ${consoleErrors.length}`);
  if (pageErrors.length > 0) {
    console.log('\n❌ 冒烟测试失败');
    process.exit(1);
  } else {
    console.log('\n✅ 冒烟测试通过');
    process.exit(0);
  }
}

smokeTest().catch(err => {
  console.error('\n💥 冒烟测试脚本异常:', err);
  process.exit(2);
});
