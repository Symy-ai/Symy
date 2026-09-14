import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * AI 行为审计日志 — 道用四·减法 + 道用六·公开 落地
 *
 * 道经依据：
 * - 道用四·减法：算法武装心智，非算法诱导消费
 * - 道用六·公开：信息全公开，决策全公开，复盘全公开
 *
 * 修改门槛：同总则（详见 constitution.md §五）
 * 任何修改须 Foundation 理事会 2/3 通过 + 人民反对 < 20% + 30 天冷却期 + 第二次投票通过
 *
 * 用法：
 *   import { logAIBehavior } from '@/lib/ai-audit';
 *   await logAIBehavior({
 *     userId, action: 'tool_call', aiPath: 'letta',
 *     userInput, aiOutput, toolCalls, context,
 *   });
 */

import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { truncate } from '@/lib/utils';

// ============================================================
// 类型定义
// ============================================================

export type AIAuditAction =
  | 'consume_recommend'      // AI 推荐消费（HIGH 风险，应被审查院优先抽查）
  | 'consume_intercept'      // AI 拦截消费
  | 'tool_call'              // MCP 工具调用
  | 'challenge_judge'        // Challenge 判定（PASSED/FAILED）
  | 'constitution_violation';// 疑似违反宪法锁（HIGH 风险）

export type RiskLevel = 'low' | 'medium' | 'high';

export type ReviewStatus = 'pending' | 'reviewed_ok' | 'reviewed_violation';

export interface AIAuditLogEntry {
  userId: string;
  action: AIAuditAction;
  riskLevel?: RiskLevel;
  userInput?: string;
  aiOutput?: string;
  toolCalls?: Array<{
    name: string;
    arguments?: Record<string, unknown>;
    result?: string;
    success?: boolean;
  }>;
  context?: Record<string, unknown>;
  aiPath?: 'letta' | 'openai_gateway' | 'zai_sdk';
  agentId?: string;
  compensated?: boolean;
}

// ============================================================
// 内部辅助
// ============================================================

/** 根据行为类型自动推断风险等级 */
/**
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74): export for unit testing.
 *    旧: internal-only, 无法测试 risk level 推断边界条件。
 *    修复: export 让 test 覆盖每个 action 的 risk level 映射。
 */
export function inferRiskLevel(action: AIAuditAction): RiskLevel {
  switch (action) {
    case 'consume_recommend':
    case 'constitution_violation':
      return 'high';
    case 'challenge_judge':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Redact common PII patterns from text before storing in audit logs.
 *
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74 — PII leakage in ai-audit logs):
 *    旧: user_input / ai_output 直接 truncate 后存入 audit log, 无 PII 过滤。
 *    若用户在 chat 中输入信用卡号 / SSN, 这些敏感数据原样落入 ai_audit_logs 表。
 *    根因修复: 在 truncate 之前先 redact 高置信度 PII 模式。
 *
 * Conservative patterns (high precision, may have false negatives but low false positives):
 * - SSN: XXX-XX-XXXX (必须含 dash, 避免匹配电话号码)
 * - Credit card: 16 位数字 (可选 space/dash 分隔, 4-4-4-4 格式)
 * - Credit card: 13-16 位连续数字 (覆盖 Amex 15 位, Visa 13/16 位, MC 16 位)
 *
 * 不 redact:
 * - Email (常用作用户标识, 且 constitution violation 检测不依赖 email)
 * - 电话号码 (格式太多样, false positive 风险高)
 * - IP 地址 (audit log 的 ip_address 字段单独存储, 不在 user_input 中)
 *
 * @param text 原始文本 (可能含 PII)
 * @returns redact 后的文本 (PII 替换为 placeholder); null/undefined 返回 undefined
 */
export function redactBasicPII(text: string | undefined | null): string | undefined {
  if (text == null) return undefined;
  return text
    // SSN: XXX-XX-XXXX (必须含 dash, 避免匹配电话号码)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    // Credit card: 16 位数字, 可选 space/dash 分隔 (4-4-4-4 标准格式)
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD REDACTED]')
    // Credit card: 13-16 位连续数字 (覆盖 Amex 15 位, Visa 13/16 位)
    .replace(/\b\d{13,16}\b/g, '[CARD REDACTED]');
}

/** 截断文本到指定长度（实现见 @/lib/utils，审计场景显式传 '...[truncated]' 后缀） */

/**
 * 启发式检测 AI 输出是否疑似违反宪法锁（constitution_lock）
 * 仅作为 audit 时的红旗标记，不阻塞响应
 */
export function detectConstitutionViolation(aiOutput: string): boolean {
  if (!aiOutput) return false;
  const lower = aiOutput.toLowerCase();

  // 检测推荐购买特定商品的模式
  const recommendPatterns = [
    /you should (buy|get|check out) /,
    /i (recommend|suggest) (you )?(buy|get|purchase) /,
    /this sale on .+ is (great|amazing|worth it)/,
    /推荐你买/,
    /建议你(买|购|入手)/,
    /限时(优惠|折扣)/,
    /only \d+ left in stock/i,
    /sale ends (today|tonight|in \d+ hours)/i,
  ];

  return recommendPatterns.some((p) => p.test(lower));
}

// ============================================================
// 主接口
// ============================================================

/**
 * 写入一条 AI 行为审计日志
 *
 * 设计原则：
 * 1. 永不阻塞主流程 — 写入失败仅记日志，不抛异常
 * 2. 用户输入/AI 输出截断到 2000 字（防止 token 爆表）
 * 3. 自动推断风险等级（consume_recommend/constitution_violation = high）
 * 4. 自动检测宪法锁违反（detectConstitutionViolation）
 *
 * @returns true=写入成功, false=写入失败（已记日志，调用方无须处理）
 */
export async function logAIBehavior(entry: AIAuditLogEntry): Promise<boolean> {
  try {
    const { supabase, error } = createAdminClient();
    if (!supabase || error) {
      logger.warn('[AI Audit] Admin client unavailable, skipping audit log');
      return false;
    }

    // 自动检测宪法锁违反
    let action = entry.action;
    let riskLevel = entry.riskLevel || inferRiskLevel(action);

    if (entry.aiOutput && detectConstitutionViolation(entry.aiOutput)) {
      // 升级为 constitution_violation
      action = 'constitution_violation';
      riskLevel = 'high';
    }

    const row = {
      user_id: entry.userId,
      action,
      risk_level: riskLevel,
      // 🔧 Round 74 ARCH-DEEP-74: redact PII before truncate (防止 partial-number leak)
      user_input: truncate(redactBasicPII(entry.userInput), 2000, '...[truncated]'),
      ai_output: truncate(redactBasicPII(entry.aiOutput), 2000, '...[truncated]'),
      tool_calls: entry.toolCalls ? JSON.parse(JSON.stringify(entry.toolCalls)) : null,
      context: entry.context ? JSON.parse(JSON.stringify(entry.context)) : null,
      ai_path: entry.aiPath || null,
      agent_id: entry.agentId || null,
      compensated: entry.compensated || false,
      review_status: 'pending' as ReviewStatus,
    };

    const { error: insertError } = await supabase
      .from('ai_audit_logs')
      .insert(row);

    if (insertError) {
      logger.warn(`[AI Audit] Failed to insert audit log: ${insertError.message}`);
      return false;
    }

    return true;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[AI Audit] Unexpected error:', err);
    return false;
  }
}

/**
 * 批量写入审计日志（用于 SSE 流式响应结束时一次性写入）
 */
export async function logAIBehaviorBatch(entries: AIAuditLogEntry[]): Promise<number> {
  if (entries.length === 0) return 0;

  try {
    const { supabase, error } = createAdminClient();
    if (!supabase || error) return 0;

    const rows = entries.map((entry) => {
      let action = entry.action;
      let riskLevel = entry.riskLevel || inferRiskLevel(action);
      if (entry.aiOutput && detectConstitutionViolation(entry.aiOutput)) {
        action = 'constitution_violation';
        riskLevel = 'high';
      }
      return {
        user_id: entry.userId,
        action,
        risk_level: riskLevel,
        // 🔧 Round 74 ARCH-DEEP-74: redact PII before truncate (防止 partial-number leak)
        user_input: truncate(redactBasicPII(entry.userInput), 2000, '...[truncated]'),
        ai_output: truncate(redactBasicPII(entry.aiOutput), 2000, '...[truncated]'),
        tool_calls: entry.toolCalls ? JSON.parse(JSON.stringify(entry.toolCalls)) : null,
        context: entry.context ? JSON.parse(JSON.stringify(entry.context)) : null,
        ai_path: entry.aiPath || null,
        agent_id: entry.agentId || null,
        compensated: entry.compensated || false,
        review_status: 'pending' as ReviewStatus,
      };
    });

    const { error: insertError } = await supabase
      .from('ai_audit_logs')
      .insert(rows);

    if (insertError) {
      logger.warn(`[AI Audit] Batch insert failed: ${insertError.message}`);
      return 0;
    }

    return rows.length;
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.warn('[AI Audit] Batch unexpected error:', err);
    return 0;
  }
}
