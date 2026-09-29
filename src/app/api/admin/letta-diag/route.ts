/**
 * /api/admin/letta-diag — Letta availability diagnostic (read-only, admin-only)
 */

export const dynamic = 'force-dynamic';
// 🔧 09-29: 走 letta-blocks 共享层调 Letta API (listAgentBlocks/upsertAgentBlock) — 架构守卫要求 maxDuration
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';

const UPSTREAM_TIMEOUT_MS = 5_000;

export async function GET(request: NextRequest) {
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const apiKey = process.env.LETTA_API_KEY || '';
  const baseUrl = process.env.LETTA_BASE_URL || 'https://api.letta.com';

  // 🔧 09-28: DELETE /api/admin/letta-diag?deleteMcp=<name> — 删指定 MCP server 注册
  //   （symy-hands 旧注册无 auth 头，hands 现要求 Bearer → 删后 getOrCreate 自动带新 secret 重建）
  const deleteMcp = request.nextUrl.searchParams.get('deleteMcp');
  if (deleteMcp) {
    // 允许 server name 或 mcp server id 两种形式
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(deleteMcp)) {
      return NextResponse.json({ error: 'Invalid server name' }, { status: 400 });
    }
    const del = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/v1/mcp-servers/${deleteMcp}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return NextResponse.json({ deleted: deleteMcp, status: del.status, ok: del.ok });
  }


  // 🔧 09-29: GET ?listBlocks=<agentId> — 轻量列出 agent blocks (label+limit, 不截断)
  const listBlocks = request.nextUrl.searchParams.get('listBlocks');
  if (listBlocks) {
    if (!/^agent-[a-z0-9-]+$/i.test(listBlocks)) {
      return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });
    }
    try {
      const { listAgentBlocks } = await import('@/lib/letta-blocks');
      const blocks = await listAgentBlocks(listBlocks);
      return NextResponse.json({
        count: blocks.length,
        blocks: blocks.map((b) => ({ label: b.label, limit: b.limit, valueHead: (b.value ?? '').slice(0, 60) })),
      });
    } catch (err) {
      // safe to ignore: diag route — error returned to caller as explicit 500 JSON
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }





  // 🔧 09-29: GET ?updatePersonaUser=<uuid> — 按用户把 agent persona block 热更到最新 SSOT
  //   (新定位: 契约签署者+多物种文明; 复用 letta-agent-manager 的 upsert 逻辑由 syncAgentSymyTools 先例)
  const updatePersonaUser = request.nextUrl.searchParams.get('updatePersonaUser');
  if (updatePersonaUser) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updatePersonaUser)) {
      return NextResponse.json({ error: 'Invalid user uuid' }, { status: 400 });
    }
    try {
      const { createAdminClient } = await import('@/lib/supabase-admin');
      const { supabase, error: adminErr } = createAdminClient();
      if (adminErr || !supabase) {
        return NextResponse.json({ error: 'admin client unavailable' }, { status: 500 });
      }
      const { data: profile, error: pErr } = await supabase
        .from('profiles').select('letta_agent_id').eq('id', updatePersonaUser).maybeSingle();
      if (pErr || !profile?.letta_agent_id) {
        return NextResponse.json({ error: 'profile or letta_agent_id not found' }, { status: 404 });
      }
      const agentId = profile.letta_agent_id;
      // 🔧 09-29 修复: 走 letta-blocks 共享层 — v1 真实端点 /core-memory/blocks
      //   (旧 /memory-blocks 全 404 是 persona 热更一直失败的根因, probeSdk 71be9d0 实测)
      const { upsertAgentBlock, listAgentBlocks } = await import('@/lib/letta-blocks');
      const { SYMY_PERSONA_BLOCK } = await import('@/lib/symy-persona');
      const personaBlocks = await listAgentBlocks(agentId);
      const hasPersona = personaBlocks.some((b) => b.label === 'persona');
      const result = await upsertAgentBlock(agentId, 'persona', SYMY_PERSONA_BLOCK, 5000);
      return NextResponse.json({
        agentId, personaExisted: hasPersona,
        created: result.created, ok: true,
        personaLength: SYMY_PERSONA_BLOCK.length,
      });
    } catch (err) {
      // safe to ignore: 错误以 500 诊断响应显式返回, 非吞错
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // 🔧 09-28: GET ?resyncUser=<uuid> — 按用户查 profiles.letta_agent_id 并重挂工具（一步到位）
  const resyncUser = request.nextUrl.searchParams.get('resyncUser');
  if (resyncUser) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resyncUser)) {
      return NextResponse.json({ error: 'Invalid user uuid' }, { status: 400 });
    }
    try {
      const { createAdminClient } = await import('@/lib/supabase-admin');
      const { supabase, error: adminErr } = createAdminClient();
      if (adminErr || !supabase) {
        return NextResponse.json({ error: 'admin client unavailable' }, { status: 500 });
      }
      const { data: profile, error: pErr } = await supabase
        .from('profiles').select('letta_agent_id').eq('id', resyncUser).maybeSingle();
      if (pErr || !profile?.letta_agent_id) {
        return NextResponse.json({ error: 'profile or letta_agent_id not found', detail: pErr?.message ?? null }, { status: 404 });
      }
      const agentId = profile.letta_agent_id;
      const { syncAgentSymyTools } = await import('@/lib/letta-agent-tools');
      await syncAgentSymyTools(agentId);
      return NextResponse.json({ resyncedUser: resyncUser, agentId, ok: true });
    } catch (err) {
      // safe to ignore: 错误已通过 500 诊断响应显式返回给调用方, 非吞错
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // 🔧 09-28: GET ?resyncAgent=<agentId> — MCP 重建后给 agent 重新 attach 工具
  //   （旧 server 删除后 agent 上的工具引用悬空 → messages.create 抛错 503）
  const resyncAgent = request.nextUrl.searchParams.get('resyncAgent');
  if (resyncAgent) {
    if (!/^agent-[a-z0-9-]+$/i.test(resyncAgent)) {
      return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });
    }
    try {
      const { syncAgentSymyTools } = await import('@/lib/letta-agent-tools');
      await syncAgentSymyTools(resyncAgent);
      return NextResponse.json({ resynced: resyncAgent, ok: true });
    } catch (err) {
      // safe to ignore: 错误已通过 500 诊断响应显式返回给调用方, 非吞错
      return NextResponse.json({ resynced: resyncAgent, ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/agents?limit=1`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });

    // 🔧 09-28: 列 MCP servers（诊断 hands 旧注册——symy-hands 复用旧 secret 不重建的排查）
    let mcpServers: unknown[] = [];
    try {
      const mcpRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/mcp-servers/`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        cache: 'no-store',
        signal: controller.signal,
      });
      if (mcpRes.ok) {
        const payload = await mcpRes.json();
        mcpServers = (Array.isArray(payload) ? payload : []).map((s: Record<string, unknown>) => ({
          id: s.id, name: s.server_name || s.name,
          url: (s.config as Record<string, unknown> | undefined)?.server_url,
          // 不回传 headers（内含 secret）——只回传有无
          hasAuthHeader: !!((s.config as Record<string, unknown> | undefined)?.custom_headers),
        }));
      }
    } catch { /* safe to ignore: 非关键诊断信息, 主 ping 已通过; mcpServers 留空即可 */ }

    return NextResponse.json({
      lettaConfigured: !!apiKey,
      baseUrl: process.env.LETTA_BASE_URL ? 'set' : 'unset',
      upstream: 'ok',
      upstreamLatencyMs: Date.now() - startedAt,
      mcpServers,
    });
  } catch (error) {
    const aborted = error instanceof Error && (
      error.name === 'AbortError' || error.name === 'TimeoutError'
    );

    return NextResponse.json({
      lettaConfigured: !!apiKey,
      baseUrl: process.env.LETTA_BASE_URL ? 'set' : 'unset',
      upstream: aborted ? 'timeout' : 'fail',
      upstreamLatencyMs: Date.now() - startedAt,
    });
  } finally {
    clearTimeout(timeout);
  }
}
