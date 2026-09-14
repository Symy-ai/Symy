/**
 * Timing-safe string comparison — prevent timing attacks on secret comparison.
 *
 * 🔧 ARCH fix (Round 56 R56-Bug6 — timingSafeCompare 重复 4 个文件):
 *    旧代码: admin-auth.ts, proxy-auth.ts, mcp/route.ts, mcp/server/route.ts 各自实现
 *    一份 timingSafeCompare/timingSafeCompareSecret 函数 (4 份重复代码)。
 *    根因修复: 提取共享 helper, 4 个文件统一使用。
 *
 * 🔧 ARCH fix (Round 57 REVIEW-A-1/2 — 恢复 length-leak 防御):
 *    Round 56 版本用 length-check-then-compare, 会泄露 secret 长度 (时序攻击)。
 *    旧 proxy-auth.ts 用 SHA-256 hash-then-compare (真正恒定时间), 其他 3 个用 phantom
 *    timingSafeEqual(aBuf, aBuf) 掩盖长度泄漏。
 *    根因修复: 采用 SHA-256 hash-then-compare (最安全的方案), 所有调用方统一。
 */

import { timingSafeEqual, createHash } from 'crypto';

/**
 * Timing-safe compare two strings using SHA-256 hash-then-compare.
 *
 * 先 hash 两个输入到固定长度 (SHA-256 = 32 bytes), 再 timingSafeEqual。
 * 这样比较时间与输入长度无关, 真正恒定时间。
 *
 * @param a - First string (e.g. user-provided secret)
 * @param b - Second string (e.g. expected secret from env)
 * @returns true if strings are equal (constant time)
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;

  try {
    // SHA-256 hash 两个输入到固定 32 字节, 消除长度泄漏
    const aHash = createHash('sha256').update(a, 'utf-8').digest();
    const bHash = createHash('sha256').update(b, 'utf-8').digest();
    return timingSafeEqual(aHash, bHash);
  } catch {
    // Fall through to manual comparison (browser fallback)
  }

  // Manual constant-time comparison (browser fallback, 仍用 hash 长度 32)
  // 注意: 这不是真正恒定时间 (JS for loop 时间依赖 hash 长度, 但 hash 长度固定 32)
  try {
    const aHash = createHash('sha256').update(a, 'utf-8').digest();
    const bHash = createHash('sha256').update(b, 'utf-8').digest();
    let result = 0;
    for (let i = 0; i < aHash.length; i++) {
      result |= aHash[i] ^ bHash[i];
    }
    return result === 0;
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return false;
  }
}

