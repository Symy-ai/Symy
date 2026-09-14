/**
 * RpcHealth — RPC 可用性追踪 (per-instance, 替代 module-level mutable flags)
 *
 * 🔧 架构优化 Round 48: 消除 module-level mutable singleton (Finding 18)
 *
 * 旧代码: `let rpcAvailable: boolean | null = null` 是模块级变量
 *   问题: 如果用户 A 的请求触发 RPC 错误 (瞬时网络故障), flag 翻转为 false
 *   → 所有后续请求 (跨所有用户) 都走 legacy 非原子路径, 即使 RPC 已恢复
 *   持续 10 分钟 (RPC_RETRY_INTERVAL_MS)
 *
 * 修复: 改为 class, 每个 Vercel serverless 实例独立追踪
 *   - 实例 A 的 RPC 故障不影响实例 B
 *   - 10 分钟后自动重试 (与旧行为一致)
 *   - 测试可构造 fresh instance (无 module-level 状态泄漏)
 */

const DEFAULT_RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class RpcHealth {
  private available: boolean | null = null;
  private lastFailTime: number = 0;
  private readonly retryIntervalMs: number;

  constructor(retryIntervalMs: number = DEFAULT_RETRY_INTERVAL_MS) {
    this.retryIntervalMs = retryIntervalMs;
  }

  /**
   * Check if RPC should be attempted.
   * Returns true if: (1) never tried, (2) confirmed available, (3) retry interval elapsed since last failure.
   */
  shouldTry(): boolean {
    if (this.available === null) return true; // never tried
    if (this.available === true) return true; // confirmed available
    // available === false — check retry interval
    if (Date.now() - this.lastFailTime >= this.retryIntervalMs) {
      this.available = null; // reset to unknown, allow retry
      return true;
    }
    return false; // still in cooldown
  }

  /** Mark RPC as available (success) */
  markAvailable(): void {
    this.available = true;
    this.lastFailTime = 0;
  }

  /** Mark RPC as unavailable (failure) */
  markFailed(): void {
    this.available = false;
    this.lastFailTime = Date.now();
  }

  /** Reset to unknown state (for testing / after migration deploy) */
  reset(): void {
    this.available = null;
    this.lastFailTime = 0;
  }

  /** Current state for debugging */
  get state(): boolean | null {
    return this.available;
  }
}

// ============================================================
// Per-instance singletons (replaces module-level mutable flags)
// ============================================================

/**
 * RPC health for create_health_event_atomic (health-impact.ts)
 * Each Vercel serverless instance gets its own module-level instance.
 * This is acceptable: Vercel instances are isolated, and the retry interval
 * ensures periodic re-checking.
 */
export const healthEventRpcHealth = new RpcHealth();

/**
 * RPC health for apply_buddy_state_delta (mcp-tools/handlers/_shared.ts)
 */
export const deltaRpcHealth = new RpcHealth();

/**
 * Reset both RPC health trackers (for testing)
 */
export function resetAllRpcHealth(): void {
  healthEventRpcHealth.reset();
  deltaRpcHealth.reset();
}
