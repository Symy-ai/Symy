/**
 * chat/parts/ 子目录 — 仅保留 refund-challenge-quota (ARCH-8 #3 死代码清理)
 *
 * 🔧 2026-07-15 (ARCH-8 #3 修复): 删除 634 行死代码
 *    - build-compensation-tool-calls.ts: compensation 路径已移除, 无 consumer
 *    - build-symy-system-prompt.ts: fallback LLM 路径已移除, 无 consumer
 *    - context-builder.ts: chat/route.ts 自己构建 context, 不用此模块
 *    - format-platform-name.ts: 与 @/lib/utils 重复, 无 consumer
 *    - orchestrator.ts: chat/route.ts 用自己的 handleChatRequest, 不用此模块
 *    - index.ts: 上述模块都删了, index 也不需要了
 *
 * 保留:
 *    - refund-challenge-quota.ts: 被 chat/route.ts 动态 import
 *    - types.ts: ChallengeContext 类型定义
 */

export type { ChallengeContext } from './types';
