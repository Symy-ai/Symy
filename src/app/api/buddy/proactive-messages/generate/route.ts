/**
 * POST /api/buddy/proactive-messages/generate — 生成并存储主动留言
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (auto cookie + Cache-Control + error handling)
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { logger } from '@/lib/logger';
import { generateProactiveMessages } from '@/lib/buddy-proactive-messages';
import { fireAddProactiveMessages } from '@/lib/companion-rpc';
import type { BuddyState } from '@/types/buddy-state';
import { DEFAULT_STATE } from '@/hooks/buddy-state-helpers';
import { getErrorMessage } from '@/lib/error-utils';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  lastOpenDate: z.string().optional(),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const bodyResult = await validateBody(request, schema);
  const lastOpenDate = isValidationError(bodyResult) ? undefined : bodyResult.lastOpenDate;

  try {
    const { data: buddyRow, error: fetchError } = await supabase
      .from('buddy_state')
      .select('vitality, streak, proactive_messages, last_active_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      logger.warn('[Proactive Messages Generate] Failed to fetch buddy_state:', fetchError.message);
      return NextResponse.json({ error: 'Failed to fetch buddy state' }, { status: 500 });
    }

    const buddyState: BuddyState = {
      ...DEFAULT_STATE,
      vitality: Number(buddyRow?.vitality ?? 72),
      streak: Number(buddyRow?.streak ?? 0),
      proactiveMessages: Array.isArray(buddyRow?.proactive_messages)
        ? (buddyRow.proactive_messages as unknown as BuddyState['proactiveMessages'])
        : [],
      lastActiveAt: buddyRow?.last_active_at ?? null,
    };

    const now = new Date();
    const newMessages = generateProactiveMessages({ buddyState, now, lastOpenDate });

    if (newMessages.length === 0) {
      return NextResponse.json({ success: true, generated: 0 });
    }

    await fireAddProactiveMessages(user.id, newMessages);

    try {
      const { createAdminClient } = await import('@/lib/supabase-admin');
      const { supabase: adminSupabase } = createAdminClient();
      if (adminSupabase) {
        await adminSupabase
          .from('buddy_state')
          .update({ last_active_at: now.toISOString() })
          .eq('user_id', user.id);
      }
    } catch (updateErr) {
      // safe to ignore: non-critical error, logged for observability
      logger.warn('[Proactive Messages Generate] Failed to update last_active_at:', getErrorMessage(updateErr));
    }

    logger.info(`[Proactive Messages Generate] Generated ${newMessages.length} messages for user ${user.id.substring(0, 8)}`);

    return NextResponse.json({ success: true, generated: newMessages.length });
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Proactive Messages Generate] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
