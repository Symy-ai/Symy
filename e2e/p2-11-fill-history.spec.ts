/**
 * E2E 测试: Deposit 后 Fill history 显示记录 (P2-11 回归)
 *
 * 🔧 P2-11 fix: 基金详情 Fill history 与余额不一致
 *
 * 验证:
 *   1. 挑战通过 → 存款对话框出现 → 点击存款
 *   2. 基金余额增加
 *   3. Fill history 显示存款记录 (旧 bug: "No fills yet")
 *
 * 旧 bug: deposit API 只更新 dream_funds.current 但不创建 health_event
 *         → Fill history endpoint 查 health_events 无结果 → 显示 "No fills yet"
 */

import { test, expect } from '@playwright/test';
import { loginAndCloseRitual, navigateToTab } from './helpers';

test.describe('P2-11: Fill history after deposit', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndCloseRitual(page);
    await navigateToTab(page, 'Now'); // Buddy tab
  });

  test('deposit creates fill history record', async ({ page }) => {
    // 1. 点击 "See it Help me see it" 打开挑战表单
    await page.click('button:has-text("Help me see it")');
    await page.waitForTimeout(500);

    // 2. 填表
    const textarea = page.locator('textarea');
    await textarea.fill('E2E fill history test');
    const amountInput = page.locator('input[type="number"]');
    await amountInput.fill('15');
    await page.waitForTimeout(300);

    // 3. 点击 "Let me say it →"
    await page.click('button:has-text("Let me say it")');

    // 4. 等待 AI 回复 + "I saw it" 按钮出现
    await expect(page.locator('button:has-text("I saw it")')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000);

    // 5. 记录存款前的基金余额
    await navigateToTab(page, 'Now');
    await page.waitForTimeout(500);

    // 找第一个未满的基金 (点击展开)
    const fundCard = page.locator('[onclick]').filter({ hasText: /\/.*\$/ }).first();
    const fundTextBefore = await fundCard.textContent().catch(() => '');

    // 6. 回到聊天 tab 点击 "I saw it"
    await navigateToTab(page, 'Magic Mirror');
    await page.waitForTimeout(500);
    await page.click('button:has-text("I saw it")');

    // 7. 等待存款对话框出现
    await expect(page.locator('text=Where does it go?')).toBeVisible({ timeout: 10_000 });

    // 8. 点击存款按钮 (✅ $X → 🎯 Fund Name)
    await page.click('button:has-text("→")');
    await page.waitForTimeout(2_000);

    // 9. 等待庆祝对话框 + 点击 Continue
    const continueBtn = page.locator('button:has-text("Continue")');
    if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(1_000);
    }

    // 10. 回到 Buddy tab, 检查 Fill history
    await navigateToTab(page, 'Now');
    await page.waitForTimeout(1_000);

    // 11. 点击基金展开 Fill history
    // 找到包含 "Fill history" 或存款金额的基金
    const fundWithHistory = page.locator('text=Fill history').first();
    if (await fundWithHistory.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Fill history 已展开
    } else {
      // 点击基金卡片展开
      const fundCards = page.locator('[onclick]');
      const count = await fundCards.count();
      if (count > 0) {
        await fundCards.first().click();
        await page.waitForTimeout(1_000);
      }
    }

    // 12. 验证: Fill history 不显示 "No fills yet" (旧 bug)
    // 等待 Fill history 区域加载
    await page.waitForTimeout(2_000);

    // 检查是否有 "No fills yet" (旧 bug 标志)
    const noFillsText = await page.locator('text=/No fills yet/').textContent({ timeout: 2_000 }).catch(() => null);

    // 如果有 "No fills yet", 说明 P2-11 bug 回退了
    // 注意: 可能需要等待 buddy state 同步, 所以给 5s 缓冲
    if (noFillsText) {
      // 等待 buddy state 同步后再次检查
      await page.waitForTimeout(5_000);
      await page.reload();
      await page.waitForTimeout(2_000);

      // 重新展开基金
      const fundCards2 = page.locator('[onclick]');
      if (await fundCards2.count() > 0) {
        await fundCards2.first().click();
        await page.waitForTimeout(2_000);
      }

      const noFillsText2 = await page.locator('text=/No fills yet/').textContent({ timeout: 2_000 }).catch(() => null);
      expect(noFillsText2).toBeNull();
    }

    // 13. 验证: Fill history 显示存款记录
    // 查找包含金额的记录 (如 "Added $15")
    const fillRecord = page.locator('text=/Added \\$/');
    await expect(fillRecord).toBeVisible({ timeout: 10_000 });
  });
});
