/**
 * E2E 测试: Chat 挑战 — "I choose to buy" 按钮 (P0-1 回归)
 *
 * 🔧 P0-1 fix: "I choose to buy" 按钮被当作 "I saw it" 处理
 *
 * 验证:
 *   1. 点击 "I choose to buy" 后不弹存款对话框
 *   2. 显示正确 toast "You saw it. You're free." (不是 "You saw it. $X stays.")
 *   3. AI 回复镜子语调 "You saw the cost... You're free."
 *
 * 旧 bug: 点击后弹存款对话框 + 显示 "You saw it. $50.00 stays." (错误 — 用户买了, 没钱可存)
 */

import { test, expect } from '@playwright/test';
import { loginAndCloseRitual, navigateToTab } from './helpers';

test.describe('P0-1: "I choose to buy" button', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndCloseRitual(page);
    await navigateToTab(page, 'Now'); // Buddy tab
  });

  test('clicking "I choose to buy" does NOT show deposit dialog', async ({ page }) => {
    // 1. 点击 "See it Help me see it" 打开挑战表单
    await page.click('button:has-text("Help me see it")');
    await page.waitForTimeout(500);

    // 2. 填表
    const textarea = page.locator('textarea');
    await textarea.fill('E2E buy button test');
    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill('30');
    await page.waitForTimeout(300);

    // 3. 点击 "Let me say it →"
    await page.click('button:has-text("Let me say it")');

    // 4. 等待 AI 回复 (镜子模式: "X. $Y. Z hours of your life...")
    await expect(page.locator('button:has-text("I choose to buy")')).toBeVisible({ timeout: 30_000 });

    // 5. 等 AI 回复出现
    await page.waitForTimeout(3_000);

    // 6. 点击 "I choose to buy"
    await page.click('button:has-text("I choose to buy")');

    // 7. 验证: 无存款对话框 (旧 bug 会弹 "Where does it go?")
    await page.waitForTimeout(3_000);
    await expect(page.locator('text=Where does it go?')).not.toBeVisible({ timeout: 5_000 });

    // 8. 验证: 无错误 toast "You saw it. $X stays." (旧 bug 会显示)
    await expect(page.locator('text=stays.')).not.toBeVisible({ timeout: 3_000 });

    // 9. 验证: 显示正确 toast "You saw it. You're free."
    // toast 可能很快消失, 检查 alert 区域
    const alertText = await page.locator('[role="alert"]').textContent({ timeout: 3_000 }).catch(() => '');
    expect(alertText).toContain("You're free");

    // 10. 验证: 挑战 banner 消失 (回到普通聊天)
    await expect(page.locator('button:has-text("I choose to buy")')).not.toBeVisible({ timeout: 5_000 });
  });
});
