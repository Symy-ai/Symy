/**
 * POST /api/challenge/complete — 直接完成挑战 (不依赖 AI)
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (auto cookie + Cache-Control + error handling)
 */

import { withAuth } from '@/lib/with-auth';
import { handleCompleteChallenge } from '@/lib/mcp-tools/handlers/complete_challenge';
import { logger } from '@/lib/logger';
import { getChallengeType } from '@/lib/challenge-rules';
import { NextResponse } from 'next/server';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const completeSchema = z.object({
  challengeId: z.string().min(1, 'Missing challengeId').max(200),
  status: z.enum(['passed', 'failed']).optional(),
  itemName: z.string().max(200).optional(),
  amount: z.number().finite().min(0).max(1_000_000).optional(),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const body = await validateBody(request, completeSchema);
  if (isValidationError(body)) return body;

  try {
    const result = await handleCompleteChallenge({
      toolCallId: `direct-${Date.now()}`,
      userId: user.id,
      supabase,
      args: {
        challenge_id: body.challengeId,
        status: body.status ?? 'passed',
        challenge_type: body.amount ? getChallengeType(body.amount) : 'quick_pass',
        saved_amount: body.amount,
      },
    });

    if (!result.success) {
      logger.warn('[Challenge Complete API] Handler returned failure:', result.message);
      return NextResponse.json({ error: result.message || 'Failed to complete challenge' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      challengeId: body.challengeId,
      result: result.result,
      message: result.message,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('[Challenge Complete API] Error:', errMsg);
    return NextResponse.json({ error: 'Failed to complete challenge' }, { status: 500 });
  }
});
