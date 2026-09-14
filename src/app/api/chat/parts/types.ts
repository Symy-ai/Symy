/**
 * Shared types for /api/chat
 *
 * 🔧 Architecture refactor: 这些类型原本在 src/lib/intent-detection.ts
 * 该文件已删除（compensation 模块整体移除）。只保留 ChallengeContext 类型供 chat 路由使用。
 *
 * 🔧 ARCH fix (Round 8 AUDIT-3 P0 #3): ChallengeContext 已提取到 src/types/challenge-context.ts
 *    单一 source of truth, 客户端 + 服务端共享。
 */

export type { ChallengeContext } from '@/types/challenge-context';
