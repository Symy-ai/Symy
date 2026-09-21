import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * proxy-auth — OpenAI/Azure 兼容代理的统一鉴权 + CORS 模块
 *
 * 🔧 ARCH fix (Round 2 H3 + H4 + L2):
 *    旧代码 4 个代理路由各自实现 extractApiKey, 且:
 *    - models/deployments 接受任意非空 key (H3 — 信息泄露)
 *    - chat/completions 用 === 比较 secret (H4 — 时序攻击)
 *    - openai/* 路由用 Access-Control-Allow-Origin: * (L2 — CORS 不一致)
 *    根因修复: 统一到一个模块, 全部用 timingSafeEqual, 全部验证 secret 匹配。
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
// 🔧 ARCH fix (Round 56 R56-Bug6 — 提取共享 timingSafeCompare helper)
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { warnMissingEnvOnce } from '@/lib/env-consumers';

/** 期望的代理 secret — 优先 PROXY_API_SECRET, fallback MCP_API_SECRET */
const EXPECTED_SECRET = process.env.PROXY_API_SECRET || process.env.MCP_API_SECRET || '';

/**
 * 从请求中提取并验证 API Key (H3 fix: 全部 4 个代理路由统一用此函数)
 *
 * 兼容两种 header 格式:
 * 1. Azure OpenAI: `api-key: <secret>`
 * 2. OpenAI: `Authorization: Bearer <secret>` 或 `Authorization: <secret>`
 *
 * @returns 验证通过的 secret (供后续使用), 或 null 表示未通过
 */
export function extractAndValidateApiKey(req: NextRequest): string | null {
  if (!EXPECTED_SECRET) {
    warnMissingEnvOnce('MCP and LLM proxy authentication');
    logger.error('[Proxy Auth] PROXY_API_SECRET not configured — rejecting all requests');
    return null;
  }

  // Azure OpenAI 格式: api-key header
  const azureKey = req.headers.get('api-key');
  if (azureKey && timingSafeCompare(azureKey, EXPECTED_SECRET)) {
    return azureKey;
  }

  // OpenAI 格式: Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  let extractedKey: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    extractedKey = authHeader.slice(7).trim() || null;
  } else {
    extractedKey = authHeader.trim() || null;
  }

  if (extractedKey && timingSafeCompare(extractedKey, EXPECTED_SECRET)) {
    return extractedKey;
  }

  return null;
}

/** 允许的 CORS origin 列表 (L2 fix: 统一) */
const ALLOWED_ORIGINS = [
  'https://symy.ai',
  'https://we-me-mvp-git-main-spark-huang-s-projects.vercel.app',
  'https://we-me-mvp-git-dev-spark-huang-s-projects.vercel.app',
  'https://we-me-mvp.vercel.app',
  'https://we-me.pages.dev',
  'http://localhost:3000',
];

/**
 * 获取允许的 CORS origin (L2 fix: 统一, 不再用 *)
 *
 * @returns 匹配的 origin 字符串, 或空字符串 (表示不允许)
 */
export function getCorsOrigin(req: NextRequest): string {
  const origin = req.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

/**
 * 构建标准 CORS headers (L2 fix)
 */
export function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = getCorsOrigin(req);
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, api-key',
    'Access-Control-Max-Age': '86400',
    // 不设 Access-Control-Allow-Credentials — 代理用 header secret, 不用 cookie
  };
}

/**
 * OPTIONS preflight 统一处理器 (L2 fix)
 */
export function handleOptions(req: NextRequest): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req),
  });
}
