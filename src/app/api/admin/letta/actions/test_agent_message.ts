/**
 * Handler: test_agent_message — 直接给指定 agent 发消息测试
 */

import { AdminCtx, lettaAPI, NextResponse, logger, validateActionBody } from './_shared';
import { z } from 'zod';

// 🔧 2026-07-15: Use z.string().uuid() instead of manual regex (zod built-in)
const schema = z.object({
  agent_id: z.string().uuid('agent_id must be a valid UUID'),
  message: z.string().default('Hello, what model are you?'),
});

export async function handleTestAgentMessage(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { agent_id: agentId, message } = result.data;

  // 🔧 ARCH fix (Round 21 BUG-R21-M3 — agentId 未验证为 UUID, 直接拼入 URL):
  //    旧代码 lettaAPI(`/agents/${agentId}/messages`, ...) — 若 agentId 含 ../ 可路径穿越到其他 Letta endpoint。
  //    根因修复: zod schema 强制 UUID 格式 (8-4-4-4-12 hex)。

  try {
    const msgResp = await lettaAPI(`/agents/${agentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
      }),
    });

    const msgText = await msgResp.text();
    const logs: string[] = [`Message: ${msgResp.status}`];

    if (msgResp.ok) {
      try {
        const msgData = JSON.parse(msgText);
        const assistantMsg = msgData.messages?.find((m: Record<string, unknown>) =>
          m.message_type === 'assistant_message'
        );
        if (assistantMsg) {
          logs.push(`✅ Assistant reply: ${(assistantMsg.content || '').substring(0, 500)}`);
        } else {
          logs.push(`No assistant_message found`);
          logs.push(`Message types: ${msgData.messages?.map((m: Record<string, unknown>) => m.message_type).join(', ')}`);
        }
        const reasoningMsg = msgData.messages?.find((m: Record<string, unknown>) =>
          m.message_type === 'reasoning_message'
        );
        if (reasoningMsg) {
          logs.push(`Reasoning: ${(reasoningMsg.reasoning || '').substring(0, 300)}`);
        }
        logs.push(`Usage: ${JSON.stringify(msgData.usage || {})}`);
      } catch {
        logs.push(`Raw: ${msgText.substring(0, 500)}`);
      }
    } else {
      logs.push(`Error: ${msgText.substring(0, 500)}`);
    }

    return NextResponse.json({ success: msgResp.ok, logs });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Admin Letta] Test agent message error:', err);
    return NextResponse.json({ error: 'Test failed' }, { status: 500 });
  }
}
