/**
 * GET /api/z-ai-config — 向客户端提供 z-ai 配置
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const GET = withAuth(async () => {
  try {
    const configPath = join(process.cwd(), '.z-ai-config');
    const configStr = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configStr);

    if (!config.baseUrl || !config.apiKey) {
      return NextResponse.json({ error: 'Invalid z-ai configuration' }, { status: 500 });
    }

    return NextResponse.json({
      baseUrl: config.baseUrl,
      chatId: config.chatId || '',
      userId: config.userId || '',
      // 🔧 2026-07-21 audit fix (security P1): 绝不向客户端返回付费 API token。
      //   旧代码暴露 config.token → 任意 authenticated user 可盗用 Z.AI 付费额度。
      //   token 仅服务端 SDK 使用, 客户端无需也绝不应获得。
    });
  } catch (err) {
    const errCode = (err as NodeJS.ErrnoException)?.code;
    if (errCode === 'ENOENT') {
      const baseUrl = process.env.ZAI_BASE_URL;
      if (baseUrl) {
        return NextResponse.json({
          baseUrl,
          chatId: process.env.ZAI_CHAT_ID || '',
          userId: process.env.ZAI_USER_ID || '',
          // 🔧 2026-07-21 audit fix: 同上 — 不返回 ZAI_TOKEN (付费 key)
        });
      }
      return NextResponse.json({ error: 'z-ai configuration not available' }, { status: 503 });
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'z-ai-config file read failed', detail: errMsg }, { status: 500 });
  }
});
