/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * GET /api/cron/agent-pool — 每 10 分钟调用的 cron job
 *
 * 用 CRON_SECRET 环境变量认证 (Vercel Cron 标准)
 *
 * 逻辑:
 * 1. 检测无主 agent 数
 * 2. 剩余 >= 池子大小 1/4 → 只补满
 * 3. 剩余 < 池子大小 1/4 → 翻倍池子大小, 再补满
 *
 * Vercel cron 配置 (vercel.json):
 *   { "path": "/api/cron/agent-pool", "schedule": "0-59/10 * * * *" }
 *   (即每 10 分钟 — 用 0-59/10 避免在 JSDoc 里出现 \*\/10 被误解析为注释结束)
 *
 * 🔧 2026-07-15 (Round 113): 频率从 1 分钟改为 10 分钟
 *    原因: 1 分钟太频繁, agent pool 很少需要 refill (只在 available < pool_size/4 时)
 *    10 分钟足够及时补满, 减少 Letta API 调用次数
 *
 * 🔧 2026-07-15 (ARCH-2 #4 修复): 收紧 auth
 *    旧代码: CRON_SECRET || ADMIN_API_KEY fallback + 接受 authorization 和 x-admin-api-key 两个 header
 *    问题: ADMIN_API_KEY fallback 让 admin 能绕过专用 cron secret; 两个 header 增加攻击面
 *    修复: 只接受 CRON_SECRET, 只接受 authorization header (Vercel Cron 标准格式)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { checkAndRefill } from '@/lib/letta-agent-pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// 🔧 2026-07-15 (ARCH-2 #4): 移除 ADMIN_API_KEY fallback — cron 必须用专用 secret
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // 🔧 Round 128 AUDIT-11 BUG #5: timing-safe 比较 (防 timing attack)
  // 🔧 2026-07-15 (ARCH-2 #4): 只接受 Authorization: Bearer <secret> (Vercel Cron 标准格式)
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!secret || !CRON_SECRET || !timingSafeCompare(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkAndRefill();
    logger.info('[Cron Agent Pool] checkAndRefill result:', result);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error('[Cron Agent Pool] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
