/**
 * POST /api/buddy/proactive-messages — 标记主动留言已读
 *
 * P1-5: 宠物陪伴感与个性成长系统
 *
 * Body: { messageId: string }
 * 调用 mark_proactive_message_read RPC (SECURITY DEFINER, 原子操作)
 *
 * 返回: { success: true, messages: ProactiveMessage[] }
 *
 * 🔧 Round 104: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 3 of 5 returns — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  messageId: z.string().min(1).max(200),
});

export const POST = withAuth(async ({ request, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { messageId } = bodyResult;

  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) {
    logger.error('[Proactive Messages] admin client error:', adminError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { data, error } = await supabase
    .rpc('mark_proactive_message_read', {
      p_user_id: user.id,
      p_message_id: messageId,
    });

  if (error) {
    logger.error('[Proactive Messages] RPC error:', error.message);
    return NextResponse.json({ error: 'Failed to mark message read' }, { status: 500 });
  }

  return NextResponse.json({ success: true, messages: data ?? [] });
});
