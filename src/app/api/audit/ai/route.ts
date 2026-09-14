/**
 * /api/audit/ai — AI 行为审计日志查询接口
 *
 * 道经依据：道用六·公开（信息全公开）
 *
 * 用户可查询自己的 AI 行为审计日志（RLS 保证只能查自己的）
 * 独立审查院（月活 ≥ 10 万后设立）可查询全平台 high 风险日志（通过 admin API）
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// ============================================================
// GET /api/audit/ai — 查询审计日志
// ============================================================

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit') || '50';
  const offsetParam = url.searchParams.get('offset') || '0';
  const actionFilter = url.searchParams.get('action'); // consume_recommend | tool_call | ...
  const riskFilter = url.searchParams.get('risk'); // low | medium | high
  const userIdFilter = url.searchParams.get('user_id'); // 仅 admin 可用

  // 输入验证（BUG-214 风格）
  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(offsetParam, 10) || 0, 0);

  // 🔧 ARCH fix (Round 44): as const 让数组推断为字面量联合类型, 让 .eq() 类型检查通过
  const validActions = ['consume_recommend', 'consume_intercept', 'tool_call', 'challenge_judge', 'constitution_violation'] as const;
  const validRisks = ['low', 'medium', 'high'] as const;

  const action = actionFilter && (validActions as readonly string[]).includes(actionFilter) ? actionFilter as typeof validActions[number] : null;
  const risk = riskFilter && (validRisks as readonly string[]).includes(riskFilter) ? riskFilter as typeof validRisks[number] : null;

  // ============================================================
  // 路径 A: Admin 查询（可查任意用户，可查全平台 high 风险）
  // ============================================================
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），
  //    旧代码 `if (verifyAdminAuth(req))` 永远为 true → admin 鉴权完全绕过。
  //    任何匿名客户端可调用 ?user_id=<victim> 读取任意用户的审计日志。
  //    根因修复：检查 .authorized 字段。
  const isAdmin = verifyAdminAuth(req).authorized;
  if (isAdmin) {
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
    }

    let query = supabase
      .from('ai_audit_logs')
      .select('id, user_id, action, risk_level, user_input, ai_output, tool_calls, context, ai_path, agent_id, compensated, review_status, review_note, reviewed_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userIdFilter) query = query.eq('user_id', userIdFilter);
    if (action) query = query.eq('action', action);
    if (risk) query = query.eq('risk_level', risk);

    const { data, error, count } = await query;

    if (error) {
      logger.warn(`[Audit API] Admin query failed: ${error.message}`);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    return NextResponse.json({
      logs: data || [],
      total: count || 0,
      limit,
      offset,
      filter: { action, risk, user_id: userIdFilter },
      admin: true,
    });
  }

  // ============================================================
  // 路径 B: 普通用户查询（仅自己的日志）
  // ============================================================
  const { supabase, user, error: authError, json } = await createAuthenticatedClient(req);
  if (authError || !supabase || !user) {
    return json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  let query = supabase
    .from('ai_audit_logs')
    .select('id, action, risk_level, user_input, ai_output, tool_calls, context, ai_path, compensated, review_status, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) query = query.eq('action', action);
  if (risk) query = query.eq('risk_level', risk);

  const { data, error, count } = await query;

  if (error) {
    logger.warn(`[Audit API] User query failed: ${error.message}`);
    return json({ error: 'Query failed' }, { status: 500 });
  }

  return json({
    logs: data || [],
    total: count || 0,
    limit,
    offset,
    filter: { action, risk },
    admin: false,
  });
}

// ============================================================
// POST /api/audit/ai — Admin 审查日志（标记 review_status）
// ============================================================

  // eslint-disable-next-line require-await -- async for API consistency
export async function POST(req: NextRequest) {
  // 仅 admin 可写审查状态
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码 `!verifyAdminAuth(req)` 永远 false → 鉴权绕过。
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // 🔧 ARCH fix (Round 14 BUG-14): 接入 withAdminAudit 审计日志
  return withAdminAudit(req, authResult, async () => {
    // 🔧 ARCH fix (Round 9 AUDIT-3 P0 #1): 用 zod 替代手写 validation
    const reviewSchema = z.object({
      log_id: z.string().min(1, 'log_id and review_status are required').max(200),
      review_status: z.enum(['pending', 'reviewed_ok', 'reviewed_violation'], { message: 'Invalid review_status' }),
      review_note: z.string().max(2000, 'review_note too long (max 2000 chars)').optional(),
    });
    let body;
    try {
      body = reviewSchema.parse(await req.json());
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }
      const issues = parseErr instanceof z.ZodError ? parseErr.issues : [];
      const message = issues[0]?.message || 'Validation failed';
      return NextResponse.json({ error: message, issues }, { status: 400 });
    }
    const { log_id, review_status: typedReviewStatus, review_note } = body;

  const { supabase, error: adminError } = createAdminClient();
  if (!supabase || adminError) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  // 🔧 ARCH fix (Round 12 H7): 旧代码不检查 rowsAffected → log_id 不存在时返回 ok:true
  //    根因修复: 用 .select('id') 检查实际更新的行
  const { data: updatedRow, error: updateError } = await supabase
    .from('ai_audit_logs')
    .update({
      review_status: typedReviewStatus,
      review_note: review_note || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', log_id)
    .select('id')
    .maybeSingle();

  if (updateError) {
    logger.warn(`[Audit API] Review update failed: ${updateError.message}`);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  if (!updatedRow) {
    return NextResponse.json({ error: 'Audit log not found' }, { status: 404 });
  }

    return NextResponse.json({ ok: true, log_id, review_status: typedReviewStatus });
  }); // end withAdminAudit
}
