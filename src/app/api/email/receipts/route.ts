/**
 * 获取用户的邮件收据
 * GET /api/email/receipts?status=actionable&limit=50
 *
 * 更新邮件收据状态（忽略/退款等）
 * PATCH /api/email/receipts?id=xxx  body: { status: 'ignored' | 'refunding' | 'refunded' }
 *
 * 清空用户的邮件收据（假数据清理）
 * DELETE /api/email/receipts?action=purge
 *
 * 🔧 2026-07-21: Migrated all 3 handlers to withAuth HOF (was manual
 *    createAuthenticatedClient with ~15 mergeCookies calls — now handled
 *    automatically by withAuth).
 *    Admin client still used for PATCH/DELETE (migration 111 GRANT compatibility).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError, validateQuery } from '@/lib/api-validation';
import { z } from 'zod';

export const GET = withAuth(async ({ supabase, user, request }) => {
  const queryParams = validateQuery(request, z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    status: z.string().max(50).optional(),
  }));
  if (isValidationError(queryParams)) return queryParams;
  const { limit, status: statusFilter } = queryParams;

  let query = supabase
    .from('email_receipts')
    .select('*')
    .eq('user_id', user.id)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (statusFilter === 'actionable') {
    query = query.in('status', ['detected', 'actionable']);
  } else if (statusFilter) {
    query = query.eq('status', statusFilter as 'detected' | 'actionable' | 'ignored' | 'refunding' | 'refunded');
  }

  const { data, error } = await query;

  if (error) {
    logger.warn('[Email Receipts] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 });
  }

  return NextResponse.json({ receipts: data || [] });
});

// PATCH: Update receipt status (ignore, refund, etc.)
export const PATCH = withAuth(async ({ supabase, user, request }) => {
  const queryParams = validateQuery(request, z.object({
    id: z.string().min(1, 'Missing receipt id').max(200),
  }));
  if (isValidationError(queryParams)) return queryParams;
  const receiptId = queryParams.id;

  const patchSchema = z.object({
    status: z.enum(['ignored', 'refunding', 'refunded', 'actionable', 'detected'], {
      message: `Invalid status. Must be one of: ignored, refunding, refunded, actionable, detected`,
    }),
  });
  const body = await validateBody(request, patchSchema);
  if (isValidationError(body)) return body;
  const { status } = body;

  // 🔧 2026-07-15 (ARCH-12 #6 修复): 用 admin client UPDATE email_receipts
  const { createAdminClient } = await import('@/lib/supabase-admin');
  const { supabase: adminSupabaseForUpdate } = createAdminClient();
  if (!adminSupabaseForUpdate) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  const { data: receiptData, error: updateError } = await adminSupabaseForUpdate
    .from('email_receipts')
    .update({ status })
    .eq('id', receiptId)
    .eq('user_id', user.id)
    .neq('status', status)
    .select('platform, amount, impulse_score, item_name')
    .maybeSingle();

  if (updateError) {
    logger.warn('[Email Receipts] PATCH error:', updateError.message);
    return NextResponse.json({ error: 'Failed to update receipt status' }, { status: 500 });
  }

  if (!receiptData) {
    const { data: existing } = await supabase
      .from('email_receipts')
      .select('status')
      .eq('id', receiptId)
      .eq('user_id', user.id)
      .maybeSingle<{ status: string }>();

    if (!existing) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    logger.info(`[Email Receipts] No-op PATCH: receipt ${receiptId} already in status "${status}"`);
    return NextResponse.json({ success: true, status, noOp: true, healthImpactApplied: true });
  }

  // ====== Health Impact: Refund boost or Mindful recovery ======
  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    const { getUserLocale } = await import('@/lib/mcp-tools/handlers/_shared');
    const { refundBoostDesc, mindfulRecoveryDesc } = await import('@/lib/mcp-tools/handlers/descriptions');
    const { getUserHourlyRate } = await import('@/lib/user-hourly-rate');
    const userLocale = await getUserLocale(user.id);
    const userHourlyRate = await getUserHourlyRate(user.id);

    if (status === 'refunded') {
      await createHealthEvent({
        userId: user.id,
        eventType: 'refund_boost',
        triggerSource: 'email_refund',
        triggerId: receiptId,
        description: refundBoostDesc(userLocale, Number(receiptData.amount || 0), receiptData.platform || "", receiptData.item_name || "", userHourlyRate),
        metadata: {
          amount: Number(receiptData.amount || 0),
          platform: receiptData.platform,
          itemName: receiptData.item_name,
        },
      });
      logger.info(`[Email Receipts] Refund boost applied for receipt ${receiptId}`);
    } else if (status === 'ignored') {
      const impulseScore = Number(receiptData.impulse_score || 0);
      if (impulseScore >= 60) {
        await createHealthEvent({
          userId: user.id,
          eventType: 'mindful_recovery',
          triggerSource: 'email_ignore',
          triggerId: receiptId,
          description: mindfulRecoveryDesc(userLocale, Number(receiptData.amount || 0), receiptData.platform || "", userHourlyRate),
          metadata: {
            impulseScore,
            amount: Number(receiptData.amount || 0),
            platform: receiptData.platform,
          },
        });
        logger.info(`[Email Receipts] Mindful recovery applied for receipt ${receiptId}`);
      }
    }
  } catch (healthErr) {
    // safe to ignore: non-critical background operation, error already logged
    logger.error('[Email Receipts] Health impact error (non-critical):', healthErr);
    return NextResponse.json({ success: true, status, healthImpactApplied: false });
  }

  return NextResponse.json({ success: true, status, healthImpactApplied: true });
});

export const DELETE = withAuth(async ({ supabase, user, request }) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'purge') {
    const { createAdminClient } = await import('@/lib/supabase-admin');
    const { supabase: adminSupabase } = createAdminClient();
    let receiptsError: { message?: string } | null = null;
    let eventsError: { message?: string } | null = null;
    let receiptCount: number | null = null;
    let afterCount: number | null = null;

    if (adminSupabase) {
      const { count: rc } = await adminSupabase
        .from('email_receipts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      receiptCount = rc;

      const { error: rErr } = await adminSupabase
        .from('email_receipts')
        .delete()
        .eq('user_id', user.id);
      receiptsError = rErr;

      const { count: ac } = await adminSupabase
        .from('email_receipts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      afterCount = ac;

      logger.info(`[Purge] receipts: ${receiptCount} -> ${afterCount} (error: ${rErr?.message || 'none'})`);

      const { error: eErr } = await adminSupabase
        .from('impulse_events')
        .delete()
        .eq('user_id', user.id)
        .eq('source', 'patrol');
      eventsError = eErr;

      const { error: hErr } = await adminSupabase
        .from('health_events')
        .delete()
        .eq('user_id', user.id)
        .in('trigger_source', ['email_receipt', 'email_refund', 'email_ignore']);
      if (hErr) {
        logger.warn('[Purge] health_events deletion failed (non-critical):', hErr.message);
      }
    } else {
      logger.info('[Purge] No admin key available, using regular client');
      const { error: rErr } = await supabase
        .from('email_receipts')
        .delete()
        .eq('user_id', user.id);
      receiptsError = rErr;

      const { error: eErr } = await supabase
        .from('impulse_events')
        .delete()
        .eq('user_id', user.id)
        .eq('source', 'patrol');
      eventsError = eErr;

      const { error: hErr2 } = await supabase
        .from('health_events')
        .delete()
        .eq('user_id', user.id)
        .in('trigger_source', ['email_receipt', 'email_refund', 'email_ignore']);
      if (hErr2) {
        logger.warn('[Purge] health_events deletion failed (fallback path, non-critical):', hErr2.message);
      }
    }

    if (receiptsError || eventsError) {
      logger.error('[Email Receipts] Purge error:', receiptsError, eventsError);
      return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'All receipts and patrol impulse events purged',
    });
  }

  // Delete single receipt by ID
  const receiptId = searchParams.get('id');
  if (!receiptId) {
    return NextResponse.json({ error: 'Provide ?id=<receiptId> or ?action=purge' }, { status: 400 });
  }

  // 🔧 ARCH fix (Round 15 adversarial review C1+C2): 先 SELECT message_id, 再 DELETE
  const { data: receiptBeforeDelete } = await supabase
    .from('email_receipts')
    .select('message_id')
    .eq('id', receiptId)
    .eq('user_id', user.id)
    .maybeSingle();
  const messageId = (receiptBeforeDelete as { message_id?: string } | null)?.message_id || null;

  const { error: deleteError } = await supabase
    .from('email_receipts')
    .delete()
    .eq('id', receiptId)
    .eq('user_id', user.id);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete receipt' }, { status: 500 });
  }

  // Clean up orphan events
  try {
    if (messageId) {
      await supabase
        .from('health_events')
        .delete()
        .eq('user_id', user.id)
        .eq('trigger_source', 'email_receipt')
        .eq('trigger_id', messageId);
    }

    await supabase
      .from('health_events')
      .delete()
      .eq('user_id', user.id)
      .in('trigger_source', ['email_refund', 'email_ignore'])
      .eq('trigger_id', receiptId);

    const { error: impulseDeleteError } = await supabase
      .from('impulse_events')
      .delete()
      .eq('user_id', user.id)
      .eq('source', 'patrol')
      .eq('receipt_id', receiptId);

    if (impulseDeleteError) {
      const searchText = messageId || receiptId;
      if (searchText) {
        try {
          await supabase
            .from('impulse_events')
            .delete()
            .eq('user_id', user.id)
            .eq('source', 'patrol')
            .like('raw_text', `%${searchText}%`);
        } catch (fallbackErr) {
          logger.warn('[Email Receipts] Fallback LIKE cleanup also failed:', fallbackErr);
        }
      }
    }
    // safe to ignore: non-critical background operation, error already logged
  } catch (cleanupErr) {
    // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Email Receipts] Failed to clean up orphan impulse/health events:', cleanupErr);
  }

  return NextResponse.json({ success: true });
});
