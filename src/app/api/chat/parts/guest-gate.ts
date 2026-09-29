// 第19刀，自 route.ts:97-121 纯机械搬移
// （isLettaConfigured 门内的 Guest 限流段 — 已登录用户 hasAuth=true 直接跳过）
import { NextRequest } from 'next/server';
import { checkGuestLimit, getClientIP } from '@/lib/guest-rate-limiter';
import { logger } from '@/lib/logger';

export function checkGuestChatLimit(req: NextRequest, hasAuth: boolean): Response | null {
  // 🔧 P1-4 fix: Guest 模式 — 未登录用户可体验有限次数 AI 对话
  //   旧代码: 未认证用户直接返回 401，新用户无法体验核心功能
  //   新代码: 未认证用户在 Guest 限制内（每 IP 每天 2 次）可体验 AI 对话，
  //          超过限制返回 401 引导注册
  //   注意: 已登录用户 hasAuth=true，不受此 Guest 限流影响（直接跳过）
  if (!hasAuth) {
    // 🔧 P1-4 fix: Guest 模式限流检查
    //   内存限流在 serverless 多实例下每个实例独立计数，这是 MVP 可接受的已知限制。
    //   后续可迁移到 Redis 或 Supabase 表实现跨实例共享计数。
    const clientIP = getClientIP(req);
    const guestCheck = checkGuestLimit(clientIP);
    if (!guestCheck.allowed) {
      return Response.json(
        {
          error: 'Guest limit reached. Sign up to continue chatting with Symy and save your conversations.',
          guestLimitReached: true,
          limit: guestCheck.limit,
        },
        { status: 401 },
      );
    }
    // Guest 模式: 使用共享 Agent ID（LETTA_AGENT_ID），不创建 per-user agent
    logger.info(`[Chat API] Guest mode: IP=${clientIP}, remaining=${guestCheck.remaining}/${guestCheck.limit}`);
  }
  return null;
}
