/**
 * ID Helpers — Centralized ID generation patterns
 *
 * 🔧 ARCH fix (Round 5 AUDIT-1 L-2): 旧代码 `df-${Date.now()}-${Math.random()...}` 在 3 处重复
 *    → ID 格式漂移风险 (如某处忘记加前缀, 或 random 长度不一致)
 *    → 测试时难以 mock
 *
 * 根因修复: 集中到单一 helper, 所有 dream fund ID 走同一生成路径。
 * 优先用 crypto.randomUUID() (Node 16+/浏览器原生), fallback 到 timestamp+random (旧环境)。
 */

/**
 * 生成 dream fund ID。
 *
 * 用法:
 *   // 客户端 (use-buddy-state.ts)
 *   const id = generateDreamFundId();
 *
 *   // 服务端 (API route)
 *   const fundId = generateDreamFundId();
 */
export function generateDreamFundId(): string {
  // Node 16+ / 所有现代浏览器都有 crypto.randomUUID
  // 在 SSR / API route / client component 都可用
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `df-${crypto.randomUUID()}`;
  }
  // Fallback: 旧环境 (理论上不会触发, 但保留以防 build target 不支持)
  return `df-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}
