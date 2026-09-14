/**
 * E2E 测试: Gacha 故事生成不崩溃 (P0-A 回归)
 *
 * 🔧 P0-A fix: Gacha 故事生成崩溃 — TypeError: Cannot read properties of undefined
 *
 * 验证:
 *   1. Gacha pull 后故事成功生成 (无 "Something went wrong" 错误)
 *   2. 无 "Cannot destructure property 'chapterIndex'" 崩溃
 *   3. 故事章节正常显示
 *
 * 旧 bug: 故事生成时 machine-actions-illustration.ts 访问 event.data (undefined) → 崩溃
 */

import { test, expect } from '@playwright/test';
import { loginAndCloseRitual, navigateToTab, resetGachaCount, deleteActiveSessions, TEST_EMAIL, TEST_PASSWORD } from './helpers';

test.describe('P0-A: Gacha story generation crash', () => {
  test.beforeEach(async ({ page }) => {
    // 重置 gacha count + 删除活跃 session
    await resetGachaCount(0);
    await deleteActiveSessions();

    await loginAndCloseRitual(page);
    await navigateToTab(page, 'If'); // Gacha tab
  });

  test('gacha pull generates story without crash', async ({ page }) => {
    // 1. 确认 gacha 次数充足
    await expect(page.locator('text=/\\d+ universes left today/')).toBeVisible({ timeout: 5_000 });

    // 2. 填表
    await page.click('button:has-text("I bought")');
    await page.waitForTimeout(300);
    const textarea = page.locator('textarea');
    await textarea.fill('E2E gacha crash test');
    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill('120');
    await page.waitForTimeout(300);

    // 3. 点击 "🦋 See the other universe →"
    await page.click('button:has-text("See the other universe")');

    // 4. 等待 "Weaving your story..." 加载动画 (10-30s)
    await expect(page.locator('text=Weaving your story')).toBeVisible({ timeout: 30_000 });

    // 5. 等待故事生成完成 (最多 150s — AI 生成需要时间)
    // 成功标志: "Expand story text" 按钮或章节内容出现
    // 失败标志: "Something went wrong" 或 "Try Again" 出现
    const result = await Promise.race([
      page.locator('button:has-text("Expand story text")').waitFor({ state: 'visible', timeout: 150_000 })
        .then(() => 'success' as const),
      page.locator('text=Something went wrong').waitFor({ state: 'visible', timeout: 150_000 })
        .then(() => 'crash' as const),
    ]).catch(() => 'timeout' as const);

    // 6. 验证: 故事成功生成 (不是崩溃)
    expect(result).not.toBe('crash');
    expect(result).not.toBe('timeout');

    // 7. 验证: 无 "Cannot destructure" 错误
    const errorText = await page.locator('text=/Cannot destructure/').textContent({ timeout: 1_000 }).catch(() => null);
    expect(errorText).toBeNull();

    // 8. 验证: gacha count 已扣减 (0 → 1) — 通过 helpers 获取 token
    const gachaCount = await getGachaCount();
    expect(gachaCount).toBeGreaterThanOrEqual(1);
  });
});

// Helper: 获取当前 gacha count
async function getGachaCount(): Promise<number> {
  const SUPABASE_URL = 'https://fcgpxrujhnqramggupjm.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_qvwf33ObNYfyi3urSReNiw_Bjgr47iN';

  const authResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const authData = await authResp.json();

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/buddy_state?select=gacha_pulls_count&user_id=eq.${authData.user.id}`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${authData.access_token}` } }
  );
  const data = await resp.json();
  return data[0]?.gacha_pulls_count ?? 0;
}
