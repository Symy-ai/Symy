/**
 * POST /api/challenge/resume
 * 恢复过期挑战（expired → active）
 * Body: { challengeId: string }
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (consistent auth + cookie handling)
 */
import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { resumeChallenge } from '@/lib/challenge-store';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const resumeSchema = z.object({
  challengeId: z.string().min(1, 'challengeId is required').max(200),
});

export const POST = withAuth(async ({ request, user }) => {
  const body = await validateBody(request, resumeSchema);
  if (isValidationError(body)) return body;

  const result = await resumeChallenge(body.challengeId, user.id);

  if (!result.success || !result.challenge) {
    return NextResponse.json({ error: result.error || 'Failed to resume challenge' }, { status: 500 });
  }

  return NextResponse.json({
    challenge: {
      challengeId: result.challenge.id,
      itemName: result.challenge.item_name,
      amount: result.challenge.amount,
      challengeType: result.challenge.challenge_type,
    },
  });
});
