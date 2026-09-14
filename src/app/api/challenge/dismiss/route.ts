/**
 * POST /api/challenge/dismiss
 * 永久放弃过期挑战（expired → failed, 不再提醒）
 * Body: { challengeId: string }
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (consistent auth + cookie handling)
 */
import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { dismissChallenge } from '@/lib/challenge-store';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const dismissSchema = z.object({
  challengeId: z.string().min(1, 'challengeId is required').max(200),
});

export const POST = withAuth(async ({ request, user }) => {
  const body = await validateBody(request, dismissSchema);
  if (isValidationError(body)) return body;

  const result = await dismissChallenge(body.challengeId, user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
