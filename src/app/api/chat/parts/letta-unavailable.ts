// 第20刀，自 route.ts:662-666 纯机械搬移
// （isLettaConfigured 门外的兜底出口 — hasAuth 两态: 未登录 401 / 已登录 503）
import { NextResponse } from 'next/server';
import type { AuthenticatedClient } from '@/lib/supabase-api';

export function lettaUnavailableResponse(
  hasAuth: boolean,
  mergeCookies: AuthenticatedClient['mergeCookies'],
): ReturnType<AuthenticatedClient['mergeCookies']> {
  // 🔧 Architecture refactor: LLM Gateway / ZAI SDK fallback 路径已移除
  // 新架构下 Letta + GLM-5.2 是唯一路径。如果 Letta 整体不可用，返回 503 让前端提示用户重试。
  // 之前的 callLLMWithTools + 二次 LLM 调用 + tool calling 循环（~250 行）已删除。
  if (!hasAuth) {
    return mergeCookies(NextResponse.json({ error: 'Authentication required. Please sign in to chat with Symy.' }, { status: 401 }));
  }

  return mergeCookies(NextResponse.json({ error: 'AI service temporarily unavailable. Please try again.' }, { status: 503 }));
}
