/**
 * 🔧 P0-1 fix (2026-07-20): 反思问题检测 + canned reply
 *
 * 根因: 用户点击反思引导组件的问题后, 消息发给 Letta AI, 但 AI 的 persona
 * 与反思问题冲突, 导致 AI 60s 无响应.
 *
 * 修复: 在 chat route 调 Letta 前, 检测用户消息是否是反思问题.
 * 如果是, 直接返回 canned reply (引导用户自己回答), 不调 Letta AI.
 *
 * 反思问题来源: src/components/chat/parts/reflection-questions.ts (SSOT)
 *
 * 🐘 人设转型 (2026-09-05): 镜子风格 canned reply ("Only you know. Sit with it.")
 *   → 绿色环保小象 (有体温, 陪着用户) — 话术来自 src/lib/elephant-tone.ts (SSOT),
 *   reflection_invite 场景。
 */

// 🔧 架构优化: 从共享文件导入, 避免重复定义
import { ALL_REFLECTION_QUESTIONS } from '@/components/chat/parts/reflection-questions';
import { getElephantPhrase } from '@/lib/elephant-tone';

/**
 * 检测用户消息是否是反思问题
 *
 * 匹配规则: 精确匹配 (trim) — 反思问题组件直接发送问题原文
 */
export function isReflectionQuestion(userContent: string): boolean {
  const normalized = userContent.trim();
  if (!normalized) return false;
  return (ALL_REFLECTION_QUESTIONS as readonly string[]).includes(normalized);
}

/**
 * 生成 canned reply (随机选一个)
 *
 * 🐘 小象风格: 不代答, 温暖地邀请用户自己坐下来想 — 本象就在这儿陪着。
 */
export function getReflectionCannedReply(locale: string): string {
  return getElephantPhrase('reflection_invite', locale);
}
