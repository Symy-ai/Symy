/**
 * Test-period rate limiting — 5-minute windows instead of daily.
 *
 * 🔧 ARCH fix Round 78: 测试期间所有每日限制改为 5 分钟限制.
 *    界面文案不变 (仍显示 "daily" / "today"), 但后端用 5 分钟窗口.
 *    测试结束后改回 daily: 把 TEST_PERIOD_5MIN = false 即可.
 *
 * 用法:
 *   const windowKey = getLimitWindow(); // "2026-07-09T08:40" (5分钟桶)
 *   // 存入 buddy_state.daily_see_it_date / daily_see_it_date / last_healing_kit_at
 *   // 比较时用 windowKey !== storedWindow → 重置计数
 */

/**
 * TEST_PERIOD_5MIN = true → 5 分钟窗口 (测试期)
 * TEST_PERIOD_5MIN = false → 每日窗口 (生产期)
 *
 * 切换: 改为 false 即可恢复每日限制.
 * 🔧 Round 109 fix: 改为 false — 恢复每日限制 (测试期已结束)
 *    Bug: 测试人员发现抚摸 Symy 可以多次刷分 (5 分钟窗口允许)
 *    修复: 关闭 5 分钟测试窗口, 恢复 "每天一次" 的生产限制
 */
export const TEST_PERIOD_5MIN = false;

/**
 * 5 分钟窗口的分钟数
 */
const WINDOW_MINUTES = 5;

/**
 * 计算 "限制窗口" 字符串.
 *
 * 测试期: 返回 "YYYY-MM-DDTHH:MM" (5 分钟桶, 如 "2026-07-09T08:40")
 *   - 同一个 5 分钟内的所有请求共享同一个 windowKey
 *   - 5 分钟后 windowKey 变化 → 计数重置
 *
 * 生产期: 返回 "YYYY-MM-DD" (UTC 4:00 AM 为分界, 与 gacha/healing-kit 一致)
 *   - 同一天的所有请求共享同一个 windowKey
 *   - 第二天 windowKey 变化 → 计数重置
 */
export function getLimitWindow(now: Date = new Date()): string {
  if (TEST_PERIOD_5MIN) {
    // 5 分钟桶: 截断到最近的 5 分钟
    const minutes = now.getMinutes();
    const flooredMinutes = Math.floor(minutes / WINDOW_MINUTES) * WINDOW_MINUTES;
    const windowed = new Date(now);
    windowed.setMinutes(flooredMinutes, 0, 0);
    // 格式: YYYY-MM-DDTHH:MM (精确到分钟, 不含秒)
    return windowed.toISOString().slice(0, 16); // "2026-07-09T08:40"
  }

  // 生产期: UTC 4:00 AM 为分界 (与旧 getChallengeDay/getGachaDay 一致)
  const adjusted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return adjusted.toISOString().slice(0, 10); // "2026-07-09"
}

/**
 * 窗口过期描述 (用于 UI 显示).
 *
 * 测试期: "5 minutes"
 * 生产期: "4:00 AM"
 */
export function getLimitResetDescription(): string {
  return TEST_PERIOD_5MIN ? '5 minutes' : '4:00 AM';
}

/**
 * 检查 storedWindow 是否与当前窗口不同 (即窗口已重置).
 */
export function isWindowReset(storedWindow: string | null | undefined, now: Date = new Date()): boolean {
  if (!storedWindow) return true;
  const currentWindow = getLimitWindow(now);
  return storedWindow !== currentWindow;
}
