/**
 * /api/admin/letta-diag — Letta availability diagnostic (read-only, admin-only)
 */

export const dynamic = 'force-dynamic';

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

  // 🔧 09-29: GET ?probeEndpoints=1 — 拉 Letta OpenAPI spec 列出真实 blocks 写端点 (找可用写路径)
  const probeEndpoints = request.nextUrl.searchParams.get('probeEndpoints');
  if (probeEndpoints) {
    try {
      const res = await fetch('https://api.letta.com/openapi.json', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        return NextResponse.json({ error: 'openapi fetch failed', status: res.status, head: (await res.text()).slice(0, 200) });
      }
      const spec = await res.json() as { paths?: Record<string, Record<string, unknown>> };
      const hits: Array<{ path: string; methods: string[]; bodyRef?: string }> = [];
      for (const [path, methods] of Object.entries(spec.paths ?? {})) {
        if (!/block|memory/i.test(path)) continue;
        const ms: string[] = [];
        let bodyRef: string | undefined;
        for (const [m, op] of Object.entries(methods)) {
          if (!['get','post','patch','put','delete'].includes(m)) continue;
          ms.push(m.toUpperCase());
          const rb = (op as Record<string, unknown>)?.requestBody as Record<string, unknown> | undefined;
          const content = rb?.content as Record<string, { schema?: { $ref?: string } | undefined }> | undefined;
          const ref = content?.['application/json']?.schema?.$ref;
          if (ref && !bodyRef) bodyRef = ref.split('/').pop();
        }
        if (ms.length) hits.push({ path, methods: ms, bodyRef });
      }
      return NextResponse.json({ count: hits.length, endpoints: hits });
    } catch (err) {
      // safe to ignore: diag route — error surfaced to caller as JSON response, no state to recover
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 🔧 09-29: GET ?probeWrite=<agentId> — 试 POST/PATCH 写路径真实响应 (只读站外值不落库)
  const probeWrite = request.nextUrl.searchParams.get('probeWrite');
  if (probeWrite) {
    if (!/^agent-[a-z0-9-]+$/i.test(probeWrite)) {
      return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });
    }
    const attempts: Array<{ what: string; status: number; head: string }> = [];
    // ① POST memory-blocks 标准形状
    for (const [what, url, method, body] of [
      ['POST memory-blocks (label)', `https://api.letta.com/v1/agents/${probeWrite}/memory-blocks`, 'POST', JSON.stringify({ label: 'probe_temp', value: 'probe', limit: 1000 })],
      ['POST blocks (label)', `https://api.letta.com/v1/agents/${probeWrite}/blocks`, 'POST', JSON.stringify({ label: 'probe_temp', value: 'probe', limit: 1000 })],
      ['PATCH memory-blocks (name)', `https://api.letta.com/v1/agents/${probeWrite}/memory-blocks`, 'PATCH', JSON.stringify({ name: 'probe_temp', value: 'probe' })],
      ['PATCH memory by name', `https://api.letta.com/v1/agents/${probeWrite}/memory`, 'PATCH', JSON.stringify({ probe_temp: 'probe' })],
    ] as Array<[string, string, string, string]>) {
      try {
        const res = await fetch(url, { method, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        attempts.push({ what, status: res.status, head: text.replace(/\s+/g, ' ').slice(0, 200) });
      } catch (err) {
        attempts.push({ what, status: -1, head: err instanceof Error ? err.message : String(err) });
      }
    }
    return NextResponse.json({ attempts });
  }

  // 🔧 09-29: GET ?probeBlocks=<agentId> — 探测 Letta blocks 端点真身 (status+body前缀)
  const probeBlocks = request.nextUrl.searchParams.get('probeBlocks');
  if (probeBlocks) {
    if (!/^agent-[a-z0-9-]+$/i.test(probeBlocks)) {
      return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });
    }
    const agentsRes = await fetch(`https://api.letta.com/v1/agents/${probeBlocks}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const agentObj = agentsRes.ok ? (await agentsRes.json() as Record<string, unknown>) : null;
    const blockKeys = agentObj ? Object.keys(agentObj).filter(k => /block|memory/i.test(k)) : [];
    const agentBlocks = agentObj ? (blockKeys.map(k => [k, JSON.stringify(agentObj[k]).slice(0, 220)])) : [];
    const candidates = [
      `/agents/${probeBlocks}/blocks`,
      `/agents/${probeBlocks}/memory-blocks`,
      `/agents/${probeBlocks}/core_memory`,
      `/agents/${probeBlocks}`,
    ];
    const results: Array<{ path: string; status: number; head: string }> = [];
    for (const path of candidates) {
      try {
        const res = await fetch(`https://api.letta.com/v1${path}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        results.push({ path, status: res.status, head: text.replace(/\s+/g, ' ').slice(0, 160) });
      } catch (err) {
        results.push({ path, status: -1, head: err instanceof Error ? err.message : String(err) });
      }
    }
    return NextResponse.json({ results, agentBlockKeys: Object.fromEntries(agentBlocks) });
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
      // Letta v1 端点: /agents/{id}/memory-blocks (list) + PATCH by label —
      //   与 letta-agent-tools.ts upsertToolRulesBlock 同款先例 (09-28 验证过)
      const blocksRes = await fetch(`https://api.letta.com/v1/agents/${agentId}/memory-blocks`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      // 🔧 防御: 非 2xx 或非 JSON 时降级为空表 (走 POST 创建路径)
      // 🔧 真相: agent 存在但 blocks 可能为空/或 list 端点在该 Letta 版本 404。
      //   权威源 = GET /agents/{id} 的 memory.blocks 数组 (06cf4d6 探测确认)
      let hasPersona = false;
      if (blocksRes.ok) {
        const text = await blocksRes.text();
        try { hasPersona = (JSON.parse(text) as { label?: string }[]).some((b) => b.label === 'persona'); } catch { hasPersona = false; }
      } else {
        const agentRes = await fetch(`https://api.letta.com/v1/agents/${agentId}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
        if (agentRes.ok) {
          const agentObj = await agentRes.json() as { memory?: { blocks?: { label?: string }[] } };
          hasPersona = (agentObj.memory?.blocks ?? []).some((b) => b.label === 'persona');
        }
      }
      const { SYMY_PERSONA_BLOCK } = await import('@/lib/symy-persona');
      let upsertRes: Response;
      if (hasPersona) {
        upsertRes = await fetch(`https://api.letta.com/v1/agents/${agentId}/memory-blocks/persona`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: SYMY_PERSONA_BLOCK }),
        });
      } else {
        upsertRes = await fetch(`https://api.letta.com/v1/agents/${agentId}/memory-blocks`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'persona', value: SYMY_PERSONA_BLOCK, limit: 5000 }),
        });
      }
      return NextResponse.json({
        agentId, personaExisted: hasPersona,
        status: upsertRes.status, ok: upsertRes.ok,
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
