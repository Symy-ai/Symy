import 'server-only'; // 🔧 架构批1 F1: server-only 防客户端泄漏 (与 letta-mcp-manager 同规)

/**
 * Letta HTTP 共享层 — lettaAPI + LettaAPIError + 单例 client 的唯一权威实现
 *
 * 🔧 架构批1 F1 (09-29, 依据 ~/briefs/arch-next-targets.md):
 *   收敛两处分叉的双实现 —
 *     · letta-mcp-manager.ts 版: 15s 超时 + LettaAPIError 分类 + 延迟日志 (throw 契约)
 *     · admin actions/_shared.ts 版: 30s 超时 + 裸 fetch (非 ok 不 throw, 调用方自查 .ok)
 *   本文件以 mcp-manager 版为基准 (错误分类 + 日志), 并以选项兼容 admin 侧契约:
 *     · timeoutMs    — 覆盖默认 15s (admin 传 30s)
 *     · throwOnError — false 时非 ok 不 throw, 返回裸 Response (admin 14 个 action 依赖)
 *   client 三处各建 (letta.ts / mcp-manager / _shared 每次调用 new Letta) 收敛为单例。
 *
 * 兼容层: letta-mcp-manager.ts 与 admin actions/_shared.ts 均 re-export 自本文件,
 *   所有 `from '@/lib/letta-mcp-manager'` / `from './_shared'` 的既有调用方零改动。
 */

import Letta from '@letta-ai/letta-client';
import { logger } from '@/lib/logger';
import { warnMissingEnvOnce } from '@/lib/env-consumers';

// ============================================================
// Environment
// ============================================================

const LETTA_API_KEY = process.env.LETTA_API_KEY || '';
const LETTA_API_BASE = 'https://api.letta.com/v1';

/** 默认 15s — 比 Vercel maxDuration 短, 留时间错误处理 (admin 面传 30s 覆盖) */
export const LETTA_API_TIMEOUT_MS = 15_000;

export class LettaAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`Letta API ${status} on ${path}: ${body.substring(0, 200)}`);
    this.name = 'LettaAPIError';
  }
}

export interface LettaAPIOptions extends RequestInit {
  /** 请求超时 (ms), 默认 15s; 显式传 options.signal 时仍以 signal 为准 */
  timeoutMs?: number;
  /** false = 非 ok 不 throw, 返回裸 Response 由调用方自查 .ok (admin actions 旧契约) */
  throwOnError?: boolean;
}

export async function lettaAPI(path: string, options?: LettaAPIOptions) {
  const timeoutMs = options?.timeoutMs ?? LETTA_API_TIMEOUT_MS;
  const throwOnError = options?.throwOnError !== false;
  const startTime = Date.now();
  try {
    const response = await fetch(`${LETTA_API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LETTA_API_KEY}`,
        ...options?.headers,
      },
      signal: options?.signal || AbortSignal.timeout(timeoutMs),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const body = await response.text().catch(() => 'unreadable');
      // 🔧 分类错误: 401/403 = 配置错误, 429 = 限流, 5xx = 服务故障
      if (response.status === 401 || response.status === 403) {
        logger.error(`[Letta API] Auth error ${response.status} on ${path} (${latencyMs}ms):`, body.substring(0, 200));
      } else if (response.status === 429) {
        logger.warn(`[Letta API] Rate limited on ${path} (${latencyMs}ms). Retry-After:`, response.headers.get('Retry-After'));
      } else if (response.status >= 500) {
        logger.error(`[Letta API] Server error ${response.status} on ${path} (${latencyMs}ms):`, body.substring(0, 200));
      } else {
        logger.warn(`[Letta API] ${response.status} on ${path} (${latencyMs}ms):`, body.substring(0, 200));
      }
      if (throwOnError) {
        throw new LettaAPIError(response.status, body, path);
      }
    }

    return response;
  } catch (err) {
    if (err instanceof LettaAPIError) throw err;
    // Network error, timeout, DNS, etc.
    const latencyMs = Date.now() - startTime;
    logger.error(`[Letta API] Network error on ${path} (${latencyMs}ms):`, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ============================================================
// Singleton Letta client
// ============================================================

let _lettaClient: Letta | null = null;

/** 获取单例 Letta client (旧三处 `new Letta(...)` 每次新建 → 收敛缓存复用) */
export function getLettaClient(): Letta {
  if (!_lettaClient) {
    if (!LETTA_API_KEY) warnMissingEnvOnce('Letta client');
    _lettaClient = new Letta({
      apiKey: LETTA_API_KEY,
      environment: 'cloud',
    });
  }
  return _lettaClient;
}
