/**
 * GET /api/push/vapid-public-key — 获取 VAPID 公钥
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
 *
 * 前端订阅推送通知时需要 VAPID 公钥
 * 公钥是公开的, 不需要认证
 *
 * 响应:
 * - 200: { publicKey: string }
 * - 503: VAPID 未配置
 */

import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push/web-push-config';

export const dynamic = 'force-dynamic';
export function GET() {
  const publicKey = getVapidPublicKey();

  if (!publicKey) {
    return NextResponse.json(
      { error: 'Push notifications not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}
