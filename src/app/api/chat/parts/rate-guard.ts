// 第18刀，自 route.ts:80-103 纯机械搬移
import { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/distributed-lock';

export async function checkChatRateLimit(req: NextRequest, userId: string | undefined): Promise<Response | null> {
  // 🔧 ARCH fix (Round 26 AUDIT-5 HIGH-1): 添加 rate limiting 防 Letta+OpenAI budget drain
  //    旧代码: 无 rate limit → 已认证用户/bot 可脚本化 spam → 烧 Letta+GLM-5.2 token
  //    根因修复: 按 userId (已认证) 或 IP (未认证) 限流, 30 次/小时 (正常使用足够)
  // 🔧 ARCH fix (Round 37 AUDIT-8 MEDIUM-5): 用 x-vercel-forwarded-for 优先 (Vercel 边缘设置, 不可伪造)
  // 🔧 Round 120 audit fix (AUDIT-1 P1 #5): 旧代码 fallback 'unknown' → 所有 unknown IP 共享一个 bucket
  //    一个攻击者就能用完所有 anonymous 用户的额度 (DoS)
  //    修复: unknown IP 一律拒绝 (无 IP 头的请求很可能是恶意/伪造)
  const clientIp = userId
    ? null // authenticated users are rate-limited by userId
    : req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() || req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || req.headers.get('x-real-ip');
  // 🔧 Round 120 audit fix: 未认证 + 无法识别 IP → 拒绝 (防 DoS)
  if (!userId && !clientIp) {
    return Response.json({ error: 'Unable to identify client. Please sign in to chat.' }, { status: 401 });
  }
  const rateLimitKey = userId ? `chat:user:${userId}` : `chat:ip:${clientIp}`;
  const { allowed: rateLimitAllowed } = await checkRateLimit(rateLimitKey, 30, 60 * 60 * 1000);
  if (!rateLimitAllowed) {
    return Response.json(
      {
        error: 'Rate limit exceeded. Maximum 30 messages per hour. Please try again later.',
      },
      { status: 429 },
    );
  }
  return null;
}
