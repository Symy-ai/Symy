/**
 * Symy MCP 工具定义 + 执行引擎
 *
 * MCP (Model Context Protocol) 让 AI 可以在对话中调用系统工具，
 * 实现"聊天→判断→计分"的闭环：
 *
 * 用户说 "我决定不买了" → AI 判断挑战成功 → 调用 add_tokens + add_dream_fund_progress
 * 用户说 "我买了那个鞋" → AI 判断被诱导消费 → 调用 record_impulse（扣 vitality）
 *
 * ⚠️ 重要：所有 vitality 变更都通过 createHealthEvent() 执行，
 * 确保 health_events 审计记录完整，Buddy Tab 的 Health Log 可见。
 *
 * BUG-94 FIX: 所有 buddy_state 的增量更新通过原子 RPC
 * `apply_buddy_state_delta` 执行，使用 SELECT ... FOR UPDATE
 * 防止并发读-合并-写竞态条件。
 *
 * 所有工具 handler 实现已拆分到 handlers/ 目录，每个工具一个文件。
 */

// ── Re-export public types ─────────────────────────────────────────
export type { MCPTool, MCPToolCall, MCPToolResult } from './mcp-tools/handlers/_shared';

// ── Re-export public utilities ─────────────────────────────────────
export { resetDeltaRpcAvailability } from './mcp-tools/handlers/_shared';

// ── Internal imports for tool definitions & dispatch ───────────────
import { MCPTool, MCPToolCall, MCPToolResult, MCPHandlerContext } from './mcp-tools/handlers/_shared';
import { handleAddTokens } from './mcp-tools/handlers/add_tokens';
import { handleAddVitality } from './mcp-tools/handlers/add_vitality';
import { handleCompleteChallenge } from './mcp-tools/handlers/complete_challenge';
import { handleAddBadge } from './mcp-tools/handlers/add_badge';
import { handleAddDreamFundProgress } from './mcp-tools/handlers/add_dream_fund_progress';
import { handleRecordImpulse } from './mcp-tools/handlers/record_impulse';
import { logger } from '@/lib/logger';

// ── Tool definitions (OpenAI function calling format) ──────────────

export const MCP_TOOLS: MCPTool[] = [
  {
    name: 'add_tokens',
    description:
      'Award tokens to the user for good financial behavior. ' +
      'Triggers: resisted an impulse, got a refund, or had a positive financial insight. ' +
      'Reason types: survival (challenge completed, +2 vitality), growth (sustained saving/refund, +5 vitality), ' +
      'pleasure (positive interaction/insight, +3 vitality). Also grants XP. ' +
      '⚠️ NOTE: For challenge completion, use complete_challenge instead (it auto-awards tokens). ' +
      'amount defaults to 3 if not provided. Range 1-50.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Number of tokens to award. Default 3. Range 1-50. Challenge rewards are handled by complete_challenge — do not use add_tokens for challenge completion.',
        },
        reason: {
          type: 'string',
          description: 'Why the tokens are awarded. Default "pleasure".',
          enum: ['survival', 'growth', 'pleasure'],
        },
      },
      required: [],
    },
  },
  {
    name: 'add_vitality',
    description:
      'Directly adjust companion vitality (0-100). Use sparingly — prefer add_tokens which auto-adjusts vitality. ' +
      'Only use for special events like reviving a dormant companion or correcting a state. ' +
      'This is the ONLY tool that can increase vitality without awarding tokens.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Vitality change. Positive to heal, negative to damage. Will be clamped to 0-100.',
        },
        reason: {
          type: 'string',
          description: 'Why the vitality is being adjusted.',
        },
      },
      required: ['amount', 'reason'],
    },
  },
  {
    name: 'complete_challenge',
    description:
      'Mark a challenge as completed. Call when user says "I didn\'t buy it", "I resisted", "I\'ll save the money", "没买", "忍住了" (status=passed, default) ' +
      'OR when user says "I bought it", "I couldn\'t resist", "买了", "没忍住" (status=failed). ' +
      '⚠️ PREFERRED MODE (challenge_id): Pass challenge_id from context header. Handler auto-looks up amount/itemName/challenge_type. ' +
      'For status=passed: handler auto-updates dream fund + totalSaved + awards tokens/XP/badges. You only need to call this ONE tool. ' +
      'For status=failed: handler marks challenge as failed (no rewards). You MUST ALSO call record_impulse to record the induced purchase. ' +
      'FALLBACK MODE (no challenge_id): Pass challenge_type + saved_amount. For status=passed, also call add_dream_fund_progress separately.',
    parameters: {
      type: 'object',
      properties: {
        challenge_id: {
          type: 'string',
          description: 'PREFERRED: Challenge ID from context header (challenge_id: UUID). Handler auto-fills everything.',
        },
        status: {
          type: 'string',
          description: 'Challenge outcome. Default "passed" (user resisted). Use "failed" when user bought the item despite the challenge.',
          enum: ['passed', 'failed'],
        },
        challenge_type: {
          type: 'string',
          description: 'FALLBACK: Only if challenge_id unavailable. Auto-corrected by handler: ≤30 quick_pass, 31-200 standard, >200 boss.',
          enum: ['quick_pass', 'standard', 'boss'],
        },
        saved_amount: {
          type: 'number',
          description: 'FALLBACK: Only if challenge_id unavailable. Dollar amount. MUST be > 0.',
        },
      },
      required: [],
    },
  },
  {
    name: 'add_badge',
    description:
      'Award a badge to the user. Badges are rare — only award when genuinely earned. ' +
      'impulse_shield (1st impulse resisted), first_save (1st saving goal), ' +
      'streak_7 (7-day streak), boss_slayer (1st Boss challenge), rational_lawyer (rational analysis win), ' +
      'dream_builder (dream fund > 50%). Do NOT re-award badges the user already has.',
    parameters: {
      type: 'object',
      properties: {
        badge_id: {
          type: 'string',
          description: 'The badge to award.',
          enum: [
            'impulse_shield',
            'first_save',
            'streak_7',
            'boss_slayer',
            'rational_lawyer',
            'dream_builder',
          ],
        },
      },
      required: ['badge_id'],
    },
  },
  {
    name: 'add_dream_fund_progress',
    description:
      'Add saved money to a dream fund. Call this when the user saves money OUTSIDE of a challenge ' +
      '(e.g., refund, general savings). For challenge completion, use complete_challenge with challenge_id — ' +
      'it auto-updates the dream fund, so do NOT call this tool after complete_challenge(challenge_id). ' +
      'This makes savings tangible: "your Iceland trip is now $429 closer!" Also increments totalSaved. ' +
      '⚠️ PARAMETER RULES: fund_id defaults to "auto" (handler picks first incomplete fund). amount MUST be > 0.',
    parameters: {
      type: 'object',
      properties: {
        fund_id: {
          type: 'string',
          description: 'Which dream fund to add to. Default "auto" — handler picks the first fund that hasn\'t reached its target. Only use a specific fund_id if the user explicitly named a fund.',
        },
        amount: {
          type: 'number',
          description: 'Dollar amount to add to the fund. MUST be > 0. Should match the savings amount (e.g., if user got a $89 refund, amount=89).',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'record_impulse',
    description:
      'Record an induced shopping event (user was manipulated into buying). Call when user admits to being induced ' +
      'by merchant algorithms (livestream FOMO, anchor pricing, scarcity tactics), mentions a purchase they regret, ' +
      'or says they couldn\'t resist. ' +
      'Triggers: "I bought it", "just ordered", "I couldn\'t resist", "I gave in", "买了", "没忍住", "下单了". ' +
      'Decreases companion vitality based on inducement score. Higher score = more damage. ' +
      'After calling, respond warmly without judgment: acknowledge what happened and encourage a brief pause next time. No shaming. No lecturing. ' +
      '⚠️ PARAMETER RULES: amount MUST be > 0 (the actual purchase amount). platform defaults to "unknown" if not specified. ' +
      'impulse_score defaults to 70 if unsure (moderate inducement). Range 0-100, ≥60 causes damage.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Dollar amount of the induced purchase. MUST be > 0.',
        },
        platform: {
          type: 'string',
          description: 'Where the purchase was made, lowercase. Default "unknown". Examples: tiktok_shop, amazon, shein, temu.',
        },
        impulse_score: {
          type: 'number',
          description: 'Inducement score 0-100. Default 70. Higher = more strongly induced. ≥60 causes vitality damage.',
        },
      },
      required: ['amount'],
    },
  },
];

// ── Handler registry ───────────────────────────────────────────────

const TOOL_HANDLERS: Record<string, (ctx: MCPHandlerContext) => Promise<MCPToolResult>> = {
  add_tokens: handleAddTokens,
  add_vitality: handleAddVitality,
  complete_challenge: handleCompleteChallenge,
  add_badge: handleAddBadge,
  add_dream_fund_progress: handleAddDreamFundProgress,
  record_impulse: handleRecordImpulse,
};

// ── Tool execution engine ──────────────────────────────────────────

/**
 * Execute a single MCP tool call
 *
 * ⚠️ All buddy_state changes go through applyBuddyStateDelta() atomically (BUG-94 fix)
 * ⚠️ All vitality audit records go through createHealthEvent()
 */
export async function executeMCPTool(
  toolCall: MCPToolCall,
  supabase: Parameters<typeof handleAddTokens>[0]['supabase'],
  userId: string,
): Promise<MCPToolResult> {
  const { id, name, arguments: args } = toolCall;

  try {
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return {
        toolCallId: id,
        name,
        success: false,
        result: {},
        message: `Unknown tool: ${name}`,
      };
    }

    return await handler({ toolCallId: id, args, supabase, userId });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error(`[MCP] executeMCPTool error for ${name}:`, err);
    return {
      toolCallId: id,
      name,
      success: false,
      result: {},
      message: `Internal error executing ${name}: ${err instanceof Error ? err.message : String(err)}. This may be a temporary database issue — please try again.`,
    };
  }
}

/**
 * Batch execute MCP tool calls
 */
export async function executeMCPTools(
  toolCalls: MCPToolCall[],
  supabase: Parameters<typeof executeMCPTool>[1],
  userId: string,
): Promise<MCPToolResult[]> {
  // Serial execution because each tool may modify the same buddy_state row
  const results: MCPToolResult[] = [];
  for (const call of toolCalls) {
    const result = await executeMCPTool(call, supabase, userId);
    results.push(result);
  }
  return results;
}

// ── Export OpenAI function calling format ───────────────────────────

export function getOpenAITools() {
  return MCP_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// ── Export Letta Agent format ───────────────────────────────────────
// 🔧 架构优化 (2026-06-30): getLettaToolSchemas 已删除 (死代码, 无 consumer)
// Letta Agent 通过 MCP Server 获取工具 schema, 不需要单独的 Letta format export
