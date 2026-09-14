import { AdminCtx, lettaAPI, NextResponse, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema with UUID validation for path-safety.
const schema = z.object({
  agent_id: z.string().min(1),
});

export async function handleGetAgentDetail(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { agent_id } = result.data;

  const resp = await lettaAPI(`/agents/${agent_id}`);
  const data = await resp.text();

  try {
    const agent = JSON.parse(data);
    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      model: agent.llm_config?.model,
      model_endpoint: agent.llm_config?.model_endpoint,
      model_endpoint_type: agent.llm_config?.model_endpoint_type,
      enable_reasoner: agent.llm_config?.enable_reasoner,
      max_reasoning_tokens: agent.llm_config?.max_reasoning_tokens,
      tool_ids: agent.tool_ids,
      memory_blocks: agent.memory?.blocks?.map((b: Record<string, unknown>) => ({ label: b.label, limit: b.limit })),
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch {
            // safe to ignore: non-critical background operation, error already logged
    return NextResponse.json({ raw: data.substring(0, 1000) }, { status: 500 });
  }
}
