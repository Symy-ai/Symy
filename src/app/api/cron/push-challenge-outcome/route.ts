/**
 * GET /api/cron/push-challenge-outcome — passed challenge honor push (batch32-b)
 *
 * Face: put the single strongest honor moment on the lock screen immediately
 * after a challenge ends ("guardian succeeded · hours won back").
 * Ledger: hours = challenge.amount ÷ the user's real hourly rate; money itself
 * never appears in push copy.
 *
 * Red lines:
 * - Only passed challenges are pushed. failed/expired rows stay silent.
 * - The cron never mutates active_challenges. Frontend lazy expiry remains the
 *   owner of the expired status transition; this route only recognizes that an
 *   active row older than 24 hours is outside its push window.
 * - push_notification_log deduplicates by notification_type + reference_id.
 * - If the deployed CHECK constraint lacks 'challenge_outcome', logging warns
 *   and the successful push is retained rather than failing the cron with 500.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUsers } from '@/lib/push/push-sender';
import { isWebPushConfigured } from '@/lib/push/web-push-config';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';
import enMessages from '@/i18n/messages/en.json';
import zhMessages from '@/i18n/messages/zh.json';

const CRON_SECRET = process.env.CRON_SECRET;

// Passed challenges older than 48 hours are intentionally outside the batch.
// Active rows created before the 24-hour boundary are also expired and silent.
const WINDOW_HOURS = 48;
const CHALLENGE_HOURS = 24;
const MAX_CHALLENGES = 200;
const DEFAULT_PUSH_LOCALE = 'zh' as const;

interface ChallengeOutcomeMessages {
  titleHours: string;
  titleMinutes: string;
  bodyHours: string;
  bodyMinutes: string;
}

const PUSH_MESSAGES: Record<'zh' | 'en', ChallengeOutcomeMessages> = {
  zh: zhMessages.push.challengeOutcome,
  en: enMessages.push.challengeOutcome,
};

interface ChallengeRow {
  id: string;
  user_id: string;
  item_name: string;
  amount: number;
  status: 'active' | 'passed' | 'failed' | 'expired';
  created_at: string;
  updated_at: string;
}

function resolvePushLocale(locale: unknown): 'zh' | 'en' {
  return locale === 'en' ? 'en' : DEFAULT_PUSH_LOCALE;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function buildChallengeOutcomeCopy(
  locale: 'zh' | 'en',
  item: string,
  hours: number,
): { title: string; body: string } {
  const msg = PUSH_MESSAGES[locale];
  const hoursRounded = Math.round(hours * 10) / 10;
  const hoursDisplay = Number.isInteger(hoursRounded) ? String(hoursRounded) : hoursRounded.toFixed(1);
  const minutesDisplay = Math.max(1, Math.round(hours * 60));

  return hoursRounded >= 1
    ? {
        title: interpolate(msg.titleHours, { hours: hoursDisplay }),
        body: interpolate(msg.bodyHours, { item, hours: hoursDisplay }),
      }
    : {
        title: interpolate(msg.titleMinutes, { minutes: minutesDisplay }),
        body: interpolate(msg.bodyMinutes, { item, minutes: minutesDisplay }),
      };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!secret || !CRON_SECRET || !timingSafeCompare(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isWebPushConfigured()) {
    logger.warn('[Cron Push Challenge Outcome] Web Push not configured, skipping');
    return NextResponse.json({ success: true, skipped: 'web-push-not-configured' });
  }

  try {
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      logger.error('[Cron Push Challenge Outcome] Admin client not available:', adminError);
      return NextResponse.json({ error: 'Admin client not available' }, { status: 500 });
    }

    const cutoff = new Date(Date.now() - CHALLENGE_HOURS * 3_600_000).toISOString();
    const windowStart = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();

    const passedBuilder = supabase
      .from('active_challenges')
      .select('id, user_id, item_name, amount, status, created_at, updated_at')
      .eq('status', 'passed')
      .gte('updated_at', windowStart)
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(MAX_CHALLENGES);
    const { data: passedRows, error: passedError } = await passedBuilder;

    if (passedError) {
      logger.error('[Cron Push Challenge Outcome] Passed challenge query error:', passedError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const challengeRows = ((passedRows || []) as ChallengeRow[]).filter((row) => row.status === 'passed');
    if (challengeRows.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const challengeIds = challengeRows.map((row) => row.id);
    const { data: logRows, error: logError } = await supabase
      .from('push_notification_log')
      .select('reference_id')
      .eq('notification_type', 'challenge_outcome')
      .in('reference_id', challengeIds);

    if (logError) {
      const pgError = logError as { code?: string };
      if (pgError.code === '23514' || pgError.code === '42883') {
        logger.warn('[Cron Push Challenge Outcome] challenge_outcome type not in CHECK constraint. Run the owner-approved migration.');
      }
      logger.error('[Cron Push Challenge Outcome] Notification log query error:', logError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const alreadyNotified = new Set(
      ((logRows || []) as { reference_id: string | null }[])
        .map((row) => row.reference_id)
        .filter((referenceId): referenceId is string => Boolean(referenceId)),
    );
    const pendingRows = challengeRows.filter((row) => !alreadyNotified.has(row.id));
    if (pendingRows.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const userIds = [...new Set(pendingRows.map((row) => row.user_id))];
    const { data: profileRows, error: localeError } = await supabase
      .from('profiles')
      .select('id, locale')
      .in('id', userIds);

    const localeByUser = new Map<string, 'zh' | 'en'>();
    if (localeError) {
      logger.warn('[Cron Push Challenge Outcome] Locale query failed, defaulting all to zh:', localeError);
    } else {
      for (const row of (profileRows || []) as { id: string; locale: string | null }[]) {
        localeByUser.set(row.id, resolvePushLocale(row.locale));
      }
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalRemoved = 0;
    let notified = 0;

    for (const challenge of pendingRows) {
      const locale = localeByUser.get(challenge.user_id) ?? DEFAULT_PUSH_LOCALE;
      const hourlyRate = await getUserHourlyRate(challenge.user_id);
      const hours = hourlyRate > 0 ? challenge.amount / hourlyRate : 0;
      const { title, body } = buildChallengeOutcomeCopy(locale, challenge.item_name, hours);
      const payload = { title, body, url: `/${locale}?tab=chat` };

      // 🔧 batch60-b: 显式 challenge 桶 — 修 url 含 tab=chat 误落 dailyAlgorithm 桶的旧错
      //   (挑战结算是事件通道, 只受 challenge 开关控制, 豁免频率; 不能被 daily 节奏误伤)
      const result = await sendPushToUsers([challenge.user_id], payload, 'challenge');
      totalSent += result.sent;
      totalFailed += result.failed;
      totalRemoved += result.removed;
      if (result.sent === 0) continue;

      notified += 1;
      const { error: insertError } = await supabase
        .from('push_notification_log')
        .upsert({
          user_id: challenge.user_id,
          notification_type: 'challenge_outcome',
          reference_id: challenge.id,
          milestone: null,
          sent_at: new Date().toISOString(),
        }, { onConflict: 'user_id,notification_type,reference_id,milestone' });

      if (insertError) {
        const pgError = insertError as { code?: string };
        if (pgError.code === '23514' || pgError.code === '42883') {
          logger.warn('[Cron Push Challenge Outcome] challenge_outcome could not be logged (CHECK constraint). Push retained; owner decision required for migration.');
        } else {
          logger.warn('[Cron Push Challenge Outcome] Notification log insert failed:', insertError);
        }
        // safe to ignore: the push already succeeded; logging is best-effort deduplication
      }
    }

    logger.info(`[Cron Push Challenge Outcome] ✅ Done. Notified: ${notified}, Sent: ${totalSent}, Failed: ${totalFailed}, Removed: ${totalRemoved}`);
    return NextResponse.json({ success: true, notified, sent: totalSent, failed: totalFailed, removed: totalRemoved });
  } catch (err) {
    // safe to ignore: the error is reported and converted to a 500 response
    logger.error('[Cron Push Challenge Outcome] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
