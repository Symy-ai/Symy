/**
 * HandsHealth — hands.symy.ai 上游健康探测 (管理端诊断用)
 *
 * 用途: admin 排查「购物车服务不可用」类报障时, 确认 hands 上游是否可达。
 *
 * 设计约束 (batch74-a):
 * - 只探 /health — 它不经过 Caddy 的 @mcp 鉴权 matcher (deploy/hands/Caddyfile),
 *   所以 ok=true 只说明 hands 容器活着, 不能证明 /mcp/ 的 Bearer 鉴权配置正确
 *   (batch74-a 事故正是 /health 200 但 /mcp/ 恒 401 — secret 不匹配)。
 * - 60s 模块级缓存 — 诊断页短时间多次刷新不重复打上游。
 * - 不做自动重试 — hands 故障属部署侧配置/运维问题, 应用层重试无意义。
 * - 返回值不含 secret, 不含 upstream 响应体。
 */

const HANDS_HEALTH_URL = 'https://hands.symy.ai/health';
const CACHE_TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 5_000;

export interface HandsHealthResult {
  ok: boolean;
  /** HTTP 状态码; null = 网络层失败 (DNS / 连接 / 超时) */
  status: number | null;
  latencyMs: number;
  checkedAt: string;
}

let cache: { result: HandsHealthResult; expiresAt: number } | null = null;

export async function checkHandsHealth(): Promise<HandsHealthResult> {
  if (cache && Date.now() < cache.expiresAt) return cache.result;

  const startedAt = Date.now();
  let result: HandsHealthResult;
  try {
    const response = await fetch(HANDS_HEALTH_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    result = {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    result = {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  }

  cache = { result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

/** 清空健康缓存 (测试用 / 管理端强制刷新) */
export function resetHandsHealthCache(): void {
  cache = null;
}
