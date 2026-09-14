/**
 * POST /api/butterfly/session — 创建新的蝴蝶效应剧情会话
 * GET  /api/butterfly/session — 获取当前活跃会话
 * DELETE /api/butterfly/session — 放弃当前会话（标记为 abandoned）
 *
 * 🔧 2026-07-21: Migrated all 3 handlers to withAuth HOF (was manual
 *    createAuthenticatedClient with ~15 mergeCookies calls — now handled
 *    automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { isStoryEngineReady } from '@/features/butterfly/lib/story-engine';
import { generateMissingIllustrations } from '@/features/butterfly/lib/illustration-engine';
import { dbToSession } from '@/features/butterfly/lib/db-mappers';
import { logger } from '@/lib/logger';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { NextResponse } from 'next/server';
import type { ButterflySession } from '@/features/butterfly/types';
import { validateBody, isValidationError, validateQuery } from '@/lib/api-validation';
import { z } from 'zod';
import { toJson } from '@/lib/json-helpers';
import { getLimitWindow } from '@/lib/limit-window';

// 🔧 P0 fix: Server-side daily gacha limit check (was client-only, could be bypassed)
const DAILY_GACHA_LIMIT = 3;

// C1 streaming fix: 大纲生成流式总时长可能 60-90s，配 120 防御 Vercel 平台层硬上限
export const maxDuration = 120;

// ============================================================
// TECH-DEBT-A fix: Serverless-safe backfill dedup
// ============================================================
const BACKFILL_DEDUP_INTERVAL_MS = 180_000; // 180s (backfill 120s + 60s 余量)

// eslint-disable-next-line require-await -- async for API consistency
async function shouldStartBackfill(sessionId: string): Promise<boolean> {
  const lockKey = `butterfly-backfill:${sessionId}`;
  return acquireLock(lockKey, BACKFILL_DEDUP_INTERVAL_MS);
}

// ============================================================
// POST — 创建新会话
// ============================================================

export const POST = withAuth(async ({ supabase, user, request }) => {
  const createSessionSchema = z.object({
    decisionType: z.enum(['bought', 'resisted', 'considering'], { message: 'decisionType must be "bought", "resisted", or "considering"' }),
    decisionDescription: z.string().trim().min(1, 'decisionType and decisionDescription are required').max(500, 'decisionDescription too long (max 500 chars)'),
    amount: z.number().finite().positive('Invalid amount (must be positive)').min(10, 'Amount below minimum (10)').max(1_000_000, 'Amount exceeds maximum (1,000,000)').optional(),
    platform: z.string().max(50, 'Platform name too long (max 50 chars)').optional(),
    context: z.string().max(1000, 'Context too long (max 1000 chars)').optional(),
    isExample: z.boolean().optional().default(false),
  }).passthrough();
  const bodyResult = await validateBody(request, createSessionSchema);
  if (isValidationError(bodyResult)) return bodyResult;
  const body = bodyResult;

  // Bug 7 fix: round to 2 decimal places to eliminate float precision errors
  if (body.amount !== undefined && body.amount !== null) {
    body.amount = Math.round(body.amount * 100) / 100;
  }

  if (!isStoryEngineReady()) {
    return NextResponse.json(
      { error: 'Story engine is not available. Please try again later.' },
      { status: 503 },
    );
  }

  const sessionCreateLockKey = `butterfly-session-create:${user.id}`;
  const sessionCreateLocked = await acquireLock(sessionCreateLockKey, 120_000, true);
  if (!sessionCreateLocked) {
    return NextResponse.json(
      { error: 'Session creation already in progress. Please wait.' },
      { status: 429 },
    );
  }

  try {
    // 🔧 P0 fix: Server-side daily gacha limit check
    const todayGachaDay = getLimitWindow(new Date());
    const [{ data: limitData }, { data: profileData }] = await Promise.all([
      supabase
        .from('buddy_state')
        .select('daily_see_it_count, daily_see_it_date')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    if (limitData) {
      const isPremium = (profileData as Record<string, unknown> | null)?.plan === 'premium';
      const storedDate = (limitData as Record<string, unknown>)?.daily_see_it_date as string | null;
      const storedCount = (limitData as Record<string, unknown>)?.daily_see_it_count as number || 0;
      const effectiveCount = storedDate === todayGachaDay ? storedCount : 0;

      if (!isPremium && effectiveCount >= DAILY_GACHA_LIMIT) {
        return NextResponse.json(
          { error: 'Daily limit reached. Come back tomorrow — or Premium for unlimited.' },
          { status: 429 },
        );
      }
    }

    let userContext = body.context || '';
    try {
      const userFacts: string[] = [];

      const { data: buddyState } = await supabase
        .from('buddy_state')
        .select('vitality, tokens, level, streak, total_saved, challenges_completed, health')
        .eq('user_id', user.id)
        .maybeSingle();

      if (buddyState) {
        userFacts.push(`User's AI companion is at vitality ${buddyState.vitality}/100 (${buddyState.health}), level ${buddyState.level}, ${buddyState.streak}-day streak. Total saved: $${buddyState.total_saved}. Challenges completed: ${buddyState.challenges_completed}.`);
      }

      const { data: dreamFunds } = await supabase
        .from('dream_funds')
        .select('name, target, current, emoji')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
        .limit(3);

      if (dreamFunds && dreamFunds.length > 0) {
        const fundDescs = dreamFunds.map((f: { name: string; target: number; current: number; emoji?: string }) =>
          `${f.emoji || '💰'} ${f.name} ($${f.current}/$${f.target})`
        ).join(', ');
        userFacts.push(`User's dream funds: ${fundDescs}.`);
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentEvents } = await supabase
        .from('health_events')
        .select('event_type, description, created_at')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentEvents && recentEvents.length > 0) {
        const eventDescs = recentEvents.map((e: { event_type: string; description: string }) =>
          e.description.substring(0, 80)
        ).join(' | ');
        userFacts.push(`User's recent week activity: ${eventDescs}`);
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, created_at, locale')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.created_at) {
        const daysSinceJoin = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (24 * 60 * 60 * 1000));
        userFacts.push(`User has been using the app for ${daysSinceJoin} days.`);
      }

      if (userFacts.length > 0) {
        const enrichedContext = `[USER CONTEXT — use these real facts to make the story feel personal and immersive]\n${userFacts.join('\n')}`;
        userContext = userContext
          ? `${userContext}\n\n${enrichedContext}`
          : enrichedContext;
      }
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
      // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Butterfly API] Failed to fetch user context for story enrichment:', err);
    }

    const outline = {
      version: 1,
      decisionType: body.decisionType,
      decisionDescription: body.decisionDescription,
      chapters: [
        { index: 1, title: '', summary: '', hasChoice: false, tone: 'neutral' as const, timeSpan: 'that evening' },
        { index: 2, title: '', summary: '', hasChoice: true, tone: 'neutral' as const, timeSpan: 'the next morning' },
        { index: 3, title: '', summary: '', hasChoice: false, tone: 'twist' as const, timeSpan: 'two days later' },
      ],
      endingHint: '',
    };

    const { error: closeError } = await supabase
      .from('butterfly_sessions')
      .update({ status: 'abandoned' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (closeError) {
      logger.warn('[Butterfly API] Failed to close old sessions:', closeError.message);
    }

    const { data: sessionRow, error: insertError } = await supabase
      .from('butterfly_sessions')
      .insert({
        user_id: user.id,
        decision_type: body.decisionType,
        decision_description: body.decisionDescription,
        amount: body.amount ?? null,
        platform: body.platform ?? null,
        context: userContext ?? null,
        is_example: body.isExample ?? false,
        outline: toJson(outline),
        current_chapter: 0,
        chapters: [],
        choices: [],
        status: 'active',
      })
      .select()
      .maybeSingle();

    if (insertError) {
      if (insertError.code === '23505') {
        logger.warn('[Butterfly API] Concurrent session creation detected for user:', user.id);
        await supabase
          .from('butterfly_sessions')
          .update({ status: 'abandoned' })
          .eq('user_id', user.id)
          .eq('status', 'active');

        const { data: retryRow, error: retryError } = await supabase
          .from('butterfly_sessions')
          .insert({
            user_id: user.id,
            decision_type: body.decisionType,
            decision_description: body.decisionDescription,
            amount: body.amount ?? null,
            platform: body.platform ?? null,
            context: userContext ?? null,
            outline: toJson(outline),
            current_chapter: 0,
            chapters: [],
            choices: [],
            status: 'active',
          })
          .select()
          .maybeSingle();

        if (retryError || !retryRow) {
          logger.error('[Butterfly API] Retry session creation failed:', retryError?.message);
          return NextResponse.json({ error: 'Failed to create session. Please try again.' }, { status: 500 });
        }

        const result: ButterflySession = dbToSession(retryRow);
        return NextResponse.json({ session: result });
      }

      logger.error('[Butterfly API] Failed to create session:', insertError.message);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    if (!sessionRow) {
      return NextResponse.json({ error: 'Failed to create session — no row returned' }, { status: 500 });
    }
    const result: ButterflySession = dbToSession(sessionRow as Parameters<typeof dbToSession>[0]);

    return NextResponse.json({ session: result });
  } finally {
    await releaseLock(sessionCreateLockKey);
  }
});

// ============================================================
// GET — 获取当前活跃会话
// ============================================================

export const GET = withAuth(async ({ supabase, user, request }) => {
  const queryParams = validateQuery(request, z.object({
    sessionId: z.string().uuid().optional(),
  }));
  if (isValidationError(queryParams)) return queryParams;
  const requestedSessionId = queryParams.sessionId;

  if (requestedSessionId) {
    const { data: specificSession, error: specificError } = await supabase
      .from('butterfly_sessions')
      .select('*')
      .eq('id', requestedSessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (specificError) {
      logger.error('[Butterfly API] Failed to get session by id:', specificError.message);
      return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
    }

    return NextResponse.json({ session: specificSession ? dbToSession(specificSession) : null });
  }

  let { data: sessionRow, error } = await supabase
    .from('butterfly_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessionRow && !error) {
    const recentResult = await supabase
      .from('butterfly_sessions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['completed', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionRow = recentResult.data;
    error = recentResult.error;
  }

  if (error) {
    logger.error('[Butterfly API] Failed to get session:', error.message);
    return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
  }

  const result = sessionRow ? dbToSession(sessionRow) : null;

  if (result && result.chapters.length > 0 && await shouldStartBackfill(result.id)) {
    const chaptersWithoutIllustration = result.chapters.filter(ch => !ch.illustrationUrl);
    if (chaptersWithoutIllustration.length > 0) {
      const chapterToFill = chaptersWithoutIllustration[0];
      logger.info('[Butterfly API] Backfilling 1 illustration (chapter', chapterToFill.index, ') for session:', result.id);
      generateMissingIllustrations(
        result.id,
        result.decisionDescription,
        result.decisionType,
        [chapterToFill],
      ).catch(err => {
        logger.warn('[Butterfly API] Missing illustration backfill failed:', err);
      }).finally(() => {
        releaseLock(`butterfly-backfill:${result.id}`).catch((e: unknown) => {
          logger.warn('[Butterfly API] releaseLock failed (non-blocking):', e instanceof Error ? e.message : String(e));
        });
      });
    } else {
      releaseLock(`butterfly-backfill:${result.id}`).catch((e: unknown) => {
        logger.warn('[Butterfly API] releaseLock failed (non-blocking):', e instanceof Error ? e.message : String(e));
      });
    }
  }

  return NextResponse.json({ session: result });
});

// ============================================================
// DELETE — 放弃当前进行中的会话（仅 active → abandoned）
// ============================================================

export const DELETE = withAuth(async ({ supabase, user, request }) => {
  const deleteSchema = z.object({
    sessionId: z.string().min(1, 'sessionId is required').max(200),
  });
  const deleteBody = await validateBody(request, deleteSchema);
  if (isValidationError(deleteBody)) {
    return deleteBody;
  }
  const targetSessionId: string = deleteBody.sessionId;

  const { error: updateError } = await supabase
    .from('butterfly_sessions')
    .update({ status: 'abandoned' })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('id', targetSessionId);

  if (updateError) {
    logger.error('[Butterfly API] Failed to abandon sessions:', updateError.message);
    return NextResponse.json({ error: 'Failed to abandon session' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
