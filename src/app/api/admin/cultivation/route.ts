/**
 * /api/admin/cultivation — 用户修身阶段管理 API（需 admin 鉴权）
 *
 * GET /api/admin/cultivation?action=stats
 *   返回全平台 cultivation 统计（各阶段用户数 / 各 severity 用户数）
 *
 * GET /api/admin/cultivation?action=profile&user_id=UUID
 *   返回单个用户的完整画像
 *
 * POST /api/admin/cultivation?action=assess&user_id=UUID
 *   手动触发单个用户的重新评估
 *
 * POST /api/admin/cultivation?action=assess_all
 *   批量重新评估所有用户（慎用，耗 DB 查询）
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { getProfile, reassessProfile } from '@/lib/cultivation';

// ============================================================
// 🔧 ARCH fix (Round 21 BUG-R21-H4 — admin batch 操作缺 maxDuration):
//    assess_all 处理 1000 用户 × 6 queries × 50ms = 300s, Vercel 默认 60s 必超时。
export const maxDuration = 300;

// ============================================================
// GET
// ============================================================

export async function GET(req: NextRequest) {
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码鉴权绕过。
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'stats';

  const { supabase, error: adminError } = createAdminClient();
  if (!supabase || adminError) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  // 单用户画像
  if (action === 'profile') {
    // 🔧 2026-07-15 (deep audit UNFIXED #9): UUID-validate user_id
    const userId = url.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }
    const uuidSchema = (await import('zod')).z.string().uuid();
    if (!uuidSchema.safeParse(userId).success) {
      return NextResponse.json({ error: 'user_id must be a valid UUID' }, { status: 400 });
    }

    const profile = await getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Failed to get profile' }, { status: 500 });
    }

    return NextResponse.json({ profile });
  }

  // 全平台统计（默认）
  // 🔧 ARCH fix (Round 12 M12): 旧代码 SELECT * 加载全部行 → 大规模 OOM
  //    根因修复: 用 count 查询按 severity_tier / cultivation_stage 分组
  // 🔧 ARCH fix (Round 44 — database.types.ts 加 Relationships 后暴露真实类型):
  //    旧代码: 数组类型推断为 string[], .eq() 参数要求字面量联合类型 → 类型不匹配。
  //    根因修复: 用 as const 让数组推断为字面量联合类型。
  const severityTiers = ['severe', 'moderate', 'light'] as const;
  const cultivationStages = ['zhi_yu', 'zhi_zhi', 'cheng_yi', 'zheng_xin'] as const;
  const bySeverity: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  let total = 0;

  for (const tier of severityTiers) {
    const { count, error: countError } = await supabase
      .from('user_intervention_profile')
      .select('*', { count: 'exact', head: true })
      .eq('severity_tier', tier);
    if (countError) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    bySeverity[tier] = count || 0;
    total += count || 0;
  }

  for (const stage of cultivationStages) {
    const { count, error: countError } = await supabase
      .from('user_intervention_profile')
      .select('*', { count: 'exact', head: true })
      .eq('cultivation_stage', stage);
    if (countError) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    byStage[stage] = count || 0;
  }

  return NextResponse.json({
    total,
    by_severity_tier: bySeverity,
    by_cultivation_stage: byStage,
  });
}

// ============================================================
// POST
// ============================================================

  // eslint-disable-next-line require-await -- async for API consistency
export async function POST(req: NextRequest) {
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码鉴权绕过。
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // 🔧 ARCH fix (Round 13 BUG-14 + ADV-R13-2): 接入 withAdminAudit 审计日志
  return withAdminAudit(req, authResult, async () => {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (!action || !['assess', 'assess_all'].includes(action)) {
      return NextResponse.json({
        error: 'Invalid action. Use: assess, assess_all',
      }, { status: 400 });
    }

  // 单用户评估
  if (action === 'assess') {
    const userId = url.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'user_id required for assess' }, { status: 400 });
    }

    logger.info(`[Admin Cultivation] Assessing user ${userId.substring(0, 8)}...`);
    const result = await reassessProfile(userId);

    if (!result) {
      return NextResponse.json({ error: 'Assessment failed' }, { status: 500 });
    }

    return NextResponse.json({ user_id: userId, assessment: result });
  }

  // 批量评估所有用户
  if (action === 'assess_all') {
    const { supabase } = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
    }

    // 获取所有用户 ID
    // 🔧 ARCH fix (Round 36 AUDIT-8 HIGH-3): Add .limit() to prevent silent truncation
    //    旧代码: 无 .limit() → Supabase 默认 1000 行 → 1000+ 用户时静默丢失
    //    根因修复: 分页拉取所有用户 (cursor pagination)
    const userIds: string[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    // 先从 user_intervention_profile 拉取
    while (true) {
      const { data: profiles, error: profileError } = await supabase
        .from('user_intervention_profile')
        .select('user_id')
        .range(offset, offset + PAGE_SIZE - 1);

      if (profileError || !profiles || profiles.length === 0) break;
      userIds.push(...(profiles as Array<{ user_id: string }>).map(p => p.user_id));
      if (profiles.length < PAGE_SIZE) break; // last page
      offset += PAGE_SIZE;
    }

    // 如果 profile 表为空，从 profiles 表拉所有用户初始化
    if (userIds.length === 0) {
      offset = 0;
      while (true) {
        const { data: authProfiles, error: authError } = await supabase
          .from('profiles')
          .select('id')
          .range(offset, offset + PAGE_SIZE - 1);

        if (authError || !authProfiles || authProfiles.length === 0) break;
        userIds.push(...(authProfiles as Array<{ id: string }>).map(p => p.id));
        if (authProfiles.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      if (userIds.length === 0) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
      }
    }

    if (userIds.length === 0) {
      return NextResponse.json({ message: 'No users to assess', total: 0 });
    }

    logger.info(`[Admin Cultivation] Assessing ALL ${userIds.length} users...`);

    // 串行处理（避免 DB 过载）
    type AssessResult = {
      user_id: string;
      severity_tier?: string;
      cultivation_stage?: string;
      stage_changed?: boolean;
      previous_stage?: string;
      error?: string;
    };
    const results: AssessResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        const result = await reassessProfile(userId);
        if (result) {
          successCount++;
          results.push({
            user_id: userId,
            severity_tier: result.severityTier,
            cultivation_stage: result.cultivationStage,
            stage_changed: result.stageChanged,
            previous_stage: result.previousStage,
          });
        } else {
          failCount++;
          results.push({ user_id: userId, error: 'assessment_failed' });
        }
      } catch (err) {
        failCount++;
        results.push({
          user_id: userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      total_users: userIds.length,
      success: successCount,
      failed: failCount,
      results,
    });
  }

  // 🔧 ARCH fix Round 75 (Finding 41): Replaced unreachable 'Unknown action' with
  //    a defensive fallback. Line 123 validates action ∈ ['assess', 'assess_all']
  //    and returns 400 otherwise, so this line is theoretically unreachable.
  //    But TypeScript needs a return at the end of the function for type safety.
  return NextResponse.json({ error: 'Unreachable: action already validated' }, { status: 400 });
  }); // end withAdminAudit
}
