/**
 * Challenge Context — shared type across client + server
 *
 * 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): 旧代码 ChallengeContext 在 2 处定义且字段一致,
 *    但分散在 src/components/buddy-tab.tsx 和 src/app/api/chat/parts/types.ts。
 *    风险: 将来字段变更只改一处, 另一处 silent drift → runtime bug。
 *
 * 根因修复: 单一 source of truth, 客户端 + 服务端都从这里 import。
 */

export interface ChallengeContext {
  /** 商品名 (e.g., "Drone", "AirPods") */
  itemName: string;
  /** 金额 (元) */
  amount: number;
  /**
   * 挑战 ID — 来自 active_challenges 表。
   * 🔧 状态外置: 服务端注入到 Letta context header, 让 AI 能引用挑战记录。
   * 客户端可省略 (e.g., demo mode)。
   */
  challengeId?: string;
}
