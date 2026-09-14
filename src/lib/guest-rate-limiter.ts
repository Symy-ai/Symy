/**
 * Guest Rate Limiter — 未登录用户 AI 对话限流
 *
 * 🔧 P1-4 fix: 允许未登录用户体验 1-2 次 AI 对话，提升新用户转化率
 *
 * 策略:
 * - 基于 IP 地址限流（每个 IP 每天最多 2 次 Guest 对话）
 * - 使用内存 Map 存储（重启后重置，可接受 — Guest 体验是引导注册的手段）
 * - 超过限制返回 401，引导用户注册
 *
 * 注意: 这是内存限流，多实例部署时每个实例独立计数。
 * 对于 MVP 阶段足够，后续可迁移到 Redis 或 Supabase 表。
 */

import { NextRequest } from 'next/server';

const GUEST_LIMIT = 2; // 每个 IP 每天最多 2 次 Guest 对话
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 小时窗口

interface GuestRecord {
  count: number;
  firstRequestAt: number;
}

// 内存存储: Map<ip, GuestRecord>
const guestStore = new Map<string, GuestRecord>();

/**
 * 获取客户端 IP — 与 src/app/api/chat/route.ts 的 rate limiter 使用相同提取策略
 *
 * 🔧 BUG-002 fix: 旧代码取 split(',')[0]（X-Forwarded-For 第一个 IP），
 *    route.ts 取 .pop()（最后一个 IP）。同一客户端在 Guest 限流和主限流中
 *    被识别为不同 IP → 限流可被绕过。统一为取最后一个 IP。
 */
export function getClientIP(req: NextRequest): string {
  const ip =
    req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-real-ip')?.trim();
  return ip || 'unknown';
}

/**
 * 检查 Guest 用户是否可以继续对话
 * @returns { allowed: boolean, remaining: number, limit: number }
 */
export function checkGuestLimit(ip: string): { allowed: boolean; remaining: number; limit: number } {
  const now = Date.now();
  const record = guestStore.get(ip);

  // 清理过期记录（窗口外）
  if (record && now - record.firstRequestAt > WINDOW_MS) {
    guestStore.delete(ip);
  }

  const current = guestStore.get(ip);

  if (!current) {
    // 首次请求 — 允许
    guestStore.set(ip, { count: 1, firstRequestAt: now });
    return { allowed: true, remaining: GUEST_LIMIT - 1, limit: GUEST_LIMIT };
  }

  if (current.count < GUEST_LIMIT) {
    // 未达限制 — 允许并计数
    current.count++;
    return { allowed: true, remaining: GUEST_LIMIT - current.count, limit: GUEST_LIMIT };
  }

  // 已达限制 — 拒绝
  return { allowed: false, remaining: 0, limit: GUEST_LIMIT };
}

/** 获取 Guest 剩余次数（不增加计数） */
export function getGuestRemaining(ip: string): { remaining: number; limit: number } {
  const now = Date.now();
  const record = guestStore.get(ip);

  if (!record || now - record.firstRequestAt > WINDOW_MS) {
    return { remaining: GUEST_LIMIT, limit: GUEST_LIMIT };
  }

  return { remaining: Math.max(0, GUEST_LIMIT - record.count), limit: GUEST_LIMIT };
}

/** 测试用: 重置 Guest 存储 */
export function _resetGuestStoreForTesting(): void {
  guestStore.clear();
}
