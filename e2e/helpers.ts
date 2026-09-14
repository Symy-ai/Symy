/**
 * E2E 测试共享工具 — 登录 + 状态重置
 *
 * 🔧 架构优化: GUI 验证闭环 — 共享登录逻辑
 */

import { type Page } from '@playwright/test';

/**
 * 测试账号 — 全部从环境变量读取（CI 与本地一致）；开源仓库不携带任何默认凭据
 */
export const TEST_EMAIL = process.env.E2E_EMAIL ?? '';
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? '';

/**
 * Supabase 配置 (用于 API 直接操作) — 从环境变量读取（.env.example 提供 key 名）
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? '';

/**
 * 登录到 Symy — 通过 UI 填表
 *
 * 登录后关闭每日仪式 (如果显示)
 */
export async function loginAndCloseRitual(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.fill('input[placeholder*="email"]', TEST_EMAIL);
  await page.fill('input[placeholder*="password"]', TEST_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/', { timeout: 15_000 });

  // 关闭每日守护仪式 (如果显示) — batch6-c 按钮文案 "Got it" / "收到啦"
  const ritualButton = page.locator('button:has-text("Got it"), button:has-text("收到啦")');
  if (await ritualButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await ritualButton.click();
    await page.waitForTimeout(500);
  }
}

/**
 * 导航到指定 tab
 */
export async function navigateToTab(page: Page, tabName: 'Now' | 'Magic Mirror' | 'If' | 'You' | 'Me'): Promise<void> {
  await page.click(`button:has-text("${tabName}")`);
  await page.waitForTimeout(500);
}

/**
 * 通过 Supabase API 获取 access token
 */
async function getSupabaseToken(): Promise<{ accessToken: string; userId: string }> {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!resp.ok) {
    throw new Error(`Supabase auth failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return { accessToken: data.access_token, userId: data.user.id };
}

/**
 * 重置 gacha count 到指定值 (通过 Supabase REST API)
 *
 * 用于 E2E 测试前确保 gacha 次数充足
 */
export async function resetGachaCount(count: number = 0): Promise<void> {
  const { accessToken, userId } = await getSupabaseToken();
  const today = new Date().toISOString().slice(0, 10);

  await fetch(`${SUPABASE_URL}/rest/v1/buddy_state?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      gacha_pulls_count: count,
      gacha_pulls_date: today,
    }),
  });
}

/**
 * 删除活跃 butterfly session (通过 Supabase REST API)
 *
 * 用于 E2E 测试前确保无活跃 session 干扰
 */
export async function deleteActiveSessions(): Promise<void> {
  const { accessToken, userId } = await getSupabaseToken();

  // 查询活跃 session
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/butterfly_sessions?user_id=eq.${userId}&status=eq.active&select=id`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  const sessions = await resp.json() as Array<{ id: string }>;

  // 标记为 abandoned
  for (const session of sessions) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/butterfly_sessions?id=eq.${session.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'abandoned' }),
      }
    );
  }
}

/**
 * 等待元素出现或超时
 */
export async function waitForAnyText(page: Page, texts: string[], timeout: number = 30_000): Promise<string | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    for (const text of texts) {
      const el = page.locator(`text=${text}`);
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        return text;
      }
    }
    await page.waitForTimeout(500);
  }
  return null;
}
