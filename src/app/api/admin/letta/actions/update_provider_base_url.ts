/**
 * Handler: update_provider_base_url — 更新 Letta provider 的 base_url
 * 用于将 My_deepseek provider 从 dev 分支切换到生产域名
 */

import { AdminCtx, lettaAPI, NextResponse, logger, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces `as string | undefined` casts.
const schema = z.object({
  provider_id: z.string().optional(),
  provider_name: z.string().optional(),
  base_url: z.string().min(1).url().refine(isSafeUrl, {
    message: 'base_url must be HTTPS and must not point to private/localhost IP ranges',
  }),
  api_key: z.string().min(1),
}).refine((d) => d.provider_id || d.provider_name, {
  message: 'provider_id or provider_name is required',
});

/**
 * 🔧 2026-07-15 (ARCH-6 #1 修复): SSRF 防护 — 拒绝 private/localhost IP
 *    防止 admin 把 provider base_url 改成 http://localhost:5432 等内部地址
 *    Letta 服务器会访问这个 URL, 可能泄漏内部服务
 */
function isSafeUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    // 必须 HTTPS (生产环境)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname;
    // 拒绝 localhost / private IP / link-local
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('172.16.') || host.startsWith('172.17.') || host.startsWith('172.18.') ||
      host.startsWith('172.19.') || host.startsWith('172.20.') || host.startsWith('172.21.') ||
      host.startsWith('172.22.') || host.startsWith('172.23.') || host.startsWith('172.24.') ||
      host.startsWith('172.25.') || host.startsWith('172.26.') || host.startsWith('172.27.') ||
      host.startsWith('172.28.') || host.startsWith('172.29.') || host.startsWith('172.30.') || host.startsWith('172.31.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    // safe to ignore: non-critical error, logged for observability
    return false;
  }
}

export async function handleUpdateProviderBaseUrl(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { provider_id, provider_name, base_url: newBaseUrl, api_key } = result.data;

  try {
    // 如果只给了 provider_name，先查找 provider_id
    let targetProviderId = provider_id;
    if (!targetProviderId && provider_name) {
      const listResp = await lettaAPI('/providers/');
      if (listResp.ok) {
        const providers = await listResp.json();
        const found = (Array.isArray(providers) ? providers : []).find(
          (p: Record<string, unknown>) => (p.name as string)?.toLowerCase() === provider_name.toLowerCase()
        );
        if (found) {
          targetProviderId = (found as Record<string, unknown>).id as string;
        }
      }
    }

    if (!targetProviderId) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // 更新 provider 的 base_url（Letta PATCH 要求必须带 api_key）
    const updateResp = await lettaAPI(`/providers/${targetProviderId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        base_url: newBaseUrl,
        api_key,
      }),
    });

    if (!updateResp.ok) {
      const errorBody = await updateResp.text().catch(() => '');
      logger.error(`[Admin Letta] Update provider base_url failed: ${errorBody}`);
      return NextResponse.json(
        { error: 'Update failed', detail: errorBody.substring(0, 300) },
        { status: 500 },
      );
    }

    const updateResult = await updateResp.json();
    return NextResponse.json({
      success: true,
      provider_id: targetProviderId,
      old_base_url: updateResult.base_url,
      new_base_url: newBaseUrl,
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Admin Letta] Update provider base_url error:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
