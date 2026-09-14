import { AdminCtx, NextResponse, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces destructuring + ad-hoc type checks.
// Label/value/agent_id are required; value is union (string|number|boolean) — matches
// existing runtime check that rejects objects (silent '[object Object]' corruption fix).
const schema = z.object({
  label: z.union([z.string(), z.number()]).transform((v) => String(v)),
  value: z.union([z.string(), z.number(), z.boolean()]),
  agent_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
}).refine((d) => d.label.length <= 100, { message: 'Label too long (max 100 chars)' })
  .refine((d) => String(d.value).length <= 10000, { message: 'Value too long (max 10000 chars)' });

// 🔧 ARCH fix: 不再使用全局 LETTA_AGENT_ID, 从 body 获取 agent_id
export async function handleUpdateMemoryBlock(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { label, value, agent_id } = result.data;

  try {
    // 🔧 ARCH fix (Round 12 AUDIT-1 M-1): 移除 lettaUnsafe, 显式类型转换
    await ctx.client.agents.blocks.update(label, {
      agent_id,
      value: String(value),
    });

    return NextResponse.json({ success: true, message: `Block "${label}" updated` });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('not found') || errMsg.includes('404')) {
      return NextResponse.json({ error: `Block "${label}" not found. Use create_memory_block first.` }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update memory block' }, { status: 500 });
  }
}
