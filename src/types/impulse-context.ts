/**
 * Impulse Context — shared type across client + server
 *
 * 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): 旧代码 ImpulseContext 在 2 处定义且字段一致,
 *    但分散在 src/components/chat/hooks/use-chat-actions.ts 和 src/app/api/chat/parts/context-builder.ts。
 *    风险: 将来字段变更只改一处, 另一处 silent drift → runtime bug。
 *
 * 根因修复: 单一 source of truth, 客户端 + 服务端都从这里 import。
 *
 * 字段都 optional 因为:
 * - 服务端: 从 request.body 接收, 字段可能缺失
 * - 客户端: 来自 chat-tab props, 字段通常都有 (但类型上保持 optional 兼容)
 */

export interface ImpulseContext {
  /** 平台名 (e.g., "Amazon", "Shein") */
  platform?: string;
  /** 金额 */
  amount?: number;
  /** AI 识别的诱导原因列表 */
  reasons?: string[];
  /** 时间戳 ISO string */
  time?: string;
}
