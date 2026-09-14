import { AdminCtx, NextResponse, logger, validateActionBody } from './_shared';
import { z } from 'zod';

// ARCH fix Round 73 (Finding 3.1): zod schema replaces destructuring + ad-hoc type checks.
const schema = z.object({
  label: z.union([z.string(), z.number()]).transform((v) => String(v)),
  value: z.union([z.string(), z.number(), z.boolean()]).optional().transform((v) => v === undefined ? '' : v),
  limit: z.union([z.string(), z.number()]).optional(),
  agent_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
}).refine((d) => d.label.length <= 100, { message: 'Label too long (max 100 chars)' })
  .refine((d) => String(d.value).length <= 10000, { message: 'Value too long (max 10000 chars)' });

// 🔧 ARCH fix: 不再使用全局 LETTA_AGENT_ID, 从 body 获取 agent_id
export async function handleCreateMemoryBlock(ctx: AdminCtx) {
  const result = validateActionBody(schema, ctx);
  if (!result.success) return result.response;
  const { label, value, limit, agent_id: targetAgentId } = result.data;

  try {
    // 🔧 ARCH fix (Round 12 AUDIT-1 M-1): 移除 lettaUnsafe, 显式类型转换
    // 🔧 ARCH fix (Round 15 ADV-REVIEW LOW-1): Number(limit) || 5000 静默接受 'abc' → 5000
    //    根因修复: 显式验证 limit 为有限数, 否则用默认 5000
    const limitNum = limit !== undefined ? Number(limit) : NaN;
    const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 5000;
    const newBlock = await ctx.client.blocks.create({
      label,
      value: String(value),
      limit: safeLimit,
    });

    const blockId = newBlock.id;

    await ctx.client.agents.blocks.attach(blockId, {
      agent_id: targetAgentId,
    });

    return NextResponse.json({ success: true, message: `Block "${label}" created and attached`, block: { id: blockId, label } });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('already') || errMsg.includes('duplicate') || errMsg.includes('unique')) {
      try {
        await ctx.client.agents.blocks.update(label, {
          agent_id: targetAgentId,
          value: String(value),
        });
        return NextResponse.json({ success: true, message: `Block "${label}" already exists, updated value` });
      // safe to ignore: non-critical background operation, error already logged
      } catch (updateErr) {
                            // safe to ignore: non-critical background operation, error already logged
        logger.error('[Admin Letta] Block update failed:', updateErr);
        return NextResponse.json({ error: 'Block exists but update failed' }, { status: 500 });
      }
    }
    return NextResponse.json(
      { error: 'Failed to create memory block' },
      { status: 500 }
    );
  }
}
