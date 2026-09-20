/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * 扫描邮箱中的购物收据
 * POST /api/email/scan
 * Body: { daysBack?: number }
 *
 * 使用 Gmail API 获取最近邮件，通过收据解析器识别购物收据，
 * 存入 email_receipts 表，并创建对应的 impulse_events。
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with mergeCookies calls — now handled automatically by withAuth).
 *    Distributed lock + token refresh + batch insert all preserved.
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { parseReceipt, isReceiptEmail, buildGmailReceiptQuery } from '@/lib/email/receipt-parser';
import { GMAIL_OAUTH_CONFIG } from '@/lib/email/gmail-config';
import { calculateEmailImpulseScore } from '@/lib/email/impulse-score';
import { logger } from '@/lib/logger';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { decryptSensitive, encryptSensitive } from '@/lib/crypto-helpers';
import { asInsertArray } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

type EmailReceiptsInsert = Database['public']['Tables']['email_receipts']['Insert'];
type ImpulseEventsInsert = Database['public']['Tables']['impulse_events']['Insert'];

const SCAN_LOCK_TTL_MS = 180_000; // 180s (50 msgs × 2s + 余量)
export const maxDuration = 180;

export const POST = withAuth(async ({ supabase, user, request }) => {
  const lockKey = `email-scan:${user.id}`;
  const locked = await acquireLock(lockKey, SCAN_LOCK_TTL_MS, true);
  if (!locked) {
    return NextResponse.json(
      { error: 'Scan already in progress. Please wait.', receipts: [], scanned: 0, newReceipts: 0 },
      { status: 429 },
    );
  }

  let connectionIdForCatch: string | null = null;
  try {
    const scanSchema = z.object({
      daysBack: z.number().int().finite().min(1).max(90).default(7),
    }).passthrough();
    let body;
    try {
      body = scanSchema.parse(await request.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 });
      }
      body = { daysBack: 7 };
    }
    const { daysBack } = body;
    const userId = user.id;

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    const userTimezone = (profileRow as { timezone?: string } | null)?.timezone || undefined;

    const { data: connections, error: connError } = await supabase
      .from('email_connections')
      .select('id, user_id, email_address, provider, access_token, refresh_token, token_expiry, scopes, status, last_history_id')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (connError || !connections?.length) {
      return NextResponse.json(
        { error: 'No active email connection found. Please connect an email account first.', receipts: [], scanned: 0 },
        { status: 400 },
      );
    }

    const connection = connections[0];
    connectionIdForCatch = connection?.id || null;

    const rawAccessToken = connection.access_token;
    const rawRefreshToken = connection.refresh_token;
    const decryptedAccessToken = rawAccessToken ? decryptSensitive(rawAccessToken) : null;
    const decryptedRefreshToken = rawRefreshToken ? decryptSensitive(rawRefreshToken) : null;

    if (!decryptedAccessToken) {
      logger.error('[Email Scan] access_token decryption failed (key rotated?) or token empty for connection:', connection.id);
      await supabase
        .from('email_connections')
        .update({ status: 'expired', error_message: 'Token decryption failed — please reconnect', updated_at: new Date().toISOString() })
        .eq('id', connection.id);
      return NextResponse.json(
        { error: 'Token decryption failed, please reconnect email', receipts: [], scanned: 0 },
        { status: 401 },
      );
    }

    let accessToken = decryptedAccessToken;
    const tokenExpiry = connection.token_expiry ? new Date(connection.token_expiry) : null;
    const isTokenExpired = !tokenExpiry || Number.isNaN(tokenExpiry.getTime()) || tokenExpiry < new Date();

    if (isTokenExpired && decryptedRefreshToken) {
      try {
        const redirectUri = GMAIL_OAUTH_CONFIG.redirectUri || `${request.nextUrl.origin}/api/email/callback`;
        const oauth2Client = new google.auth.OAuth2(
          GMAIL_OAUTH_CONFIG.clientId,
          GMAIL_OAUTH_CONFIG.clientSecret,
          redirectUri,
        );
        oauth2Client.setCredentials({
          refresh_token: decryptedRefreshToken,
        });
        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token!;

        let newEncryptedAccessToken: string;
        try {
          newEncryptedAccessToken = encryptSensitive(accessToken);
        } catch (encErr) {
          logger.error('[Email Scan] Re-encrypting refreshed access_token failed:', encErr);
          newEncryptedAccessToken = rawAccessToken;
        }
        await supabase
          .from('email_connections')
          .update({
            access_token: newEncryptedAccessToken,
            token_expiry: credentials.expiry_date
              ? new Date(credentials.expiry_date).toISOString()
              : new Date(Date.now() + 3600 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);
      } catch (refreshError) {
        logger.error('Token refresh failed:', refreshError);
        await supabase
          .from('email_connections')
          .update({ status: 'expired', error_message: 'Token refresh failed', updated_at: new Date().toISOString() })
          .eq('id', connection.id);

        return NextResponse.json(
          { error: 'Token expired, please reconnect email', receipts: [], scanned: 0 },
          { status: 401 },
        );
      }
    }

    // Scan Gmail for receipts
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const query = buildGmailReceiptQuery(daysBack);

      const { data: messagesList } = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50,
      });

      const messages = messagesList.messages || [];
      const newReceipts: Record<string, unknown>[] = [];
      const pendingImpulseEvents: Record<string, unknown>[] = [];

      const allMsgIds = messages.map(m => m.id!).filter(Boolean);
      const { data: existingReceipts } = await supabase
        .from('email_receipts')
        .select('message_id')
        .eq('user_id', userId)
        .in('message_id', allMsgIds);
      const existingMsgIds = new Set(
        ((existingReceipts || []) as Array<{ message_id: string }>).map(r => r.message_id)
      );

      for (const msg of messages) {
        if (existingMsgIds.has(msg.id!)) continue;

        const { data: message } = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        if (!message) continue;

        const headers = message.payload?.headers || [];
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const dateStr = headers.find((h) => h.name === 'Date')?.value || '';
        const snippet = message.snippet || '';
        const receivedAt = message.internalDate
          ? new Date(parseInt(message.internalDate))
          : dateStr ? new Date(dateStr) : new Date();

        if (!isReceiptEmail(from, subject, snippet)) continue;

        const parsed = parseReceipt(from, subject, snippet);
        if (!parsed.isReceipt) continue;

        const impulseScore = calculateEmailImpulseScore(parsed, receivedAt, userTimezone);
        const refundDeadline = parsed.refundDeadlineDays
          ? new Date(receivedAt.getTime() + parsed.refundDeadlineDays * 86400000)
          : null;
        const isWithinWindow = refundDeadline ? new Date() < refundDeadline : true;

        const receiptData = {
          user_id: userId,
          connection_id: connection.id,
          message_id: msg.id,
          thread_id: msg.threadId,
          from_address: from,
          subject,
          snippet: snippet.substring(0, 500),
          platform: parsed.platform,
          order_id: parsed.orderId,
          item_name: parsed.itemName,
          amount: parsed.amount,
          currency: parsed.currency,
          received_at: receivedAt.toISOString(),
          impulse_score: impulseScore,
          refund_eligible: parsed.refundEligible && isWithinWindow,
          refund_deadline: refundDeadline?.toISOString(),
          status: impulseScore >= 60 ? 'actionable' : 'detected',
        };

        newReceipts.push(receiptData);

        if (impulseScore >= 40 && parsed.amount) {
          pendingImpulseEvents.push({
            user_id: userId,
            platform: parsed.platform,
            source: 'patrol',
            title: subject,
            amount: parsed.amount,
            category: parsed.platform,
            is_livestream: false,
            is_flash_sale: false,
            impulse_score: impulseScore,
            reasons: [`Email receipt from ${parsed.platform}`, parsed.amount > 50 ? 'High amount' : ''].filter(Boolean),
            raw_text: snippet.substring(0, 1000),
            _message_id: msg.id,
          });
        }
      }

      if (newReceipts.length > 0) {
        const { error: insertError } = await supabase
          .from('email_receipts')
          .insert(asInsertArray<EmailReceiptsInsert>(newReceipts));

        if (insertError) {
          logger.error('Failed to insert receipts:', insertError);
        } else {
          if (pendingImpulseEvents.length > 0) {
            try {
              const msgIds = pendingImpulseEvents.map(e => e._message_id).filter(Boolean) as string[];
              const { data: insertedReceipts } = await supabase
                .from('email_receipts')
                .select('id, message_id')
                .eq('user_id', userId)
                .in('message_id', msgIds);
              const receiptIdMap = new Map(
                ((insertedReceipts || []) as Array<{ id: string; message_id: string }>).map(r => [r.message_id, r.id])
              );
              const eventsToInsert = pendingImpulseEvents.map(e => {
                const msgId = e._message_id as string | undefined;
                const { _message_id: _unused, ...eventData } = e;
                return {
                  ...eventData,
                  receipt_id: msgId ? (receiptIdMap.get(msgId) || null) : null,
                } as Record<string, unknown>;
              });
              const { error: eventsError } = await supabase
                .from('impulse_events')
                .insert(asInsertArray<ImpulseEventsInsert>(eventsToInsert));
              if (eventsError) {
                logger.error('[Email Scan] Failed to insert impulse_events:', eventsError);
              }
            } catch (eventsErr) {
              logger.error('[Email Scan] Impulse events insert error (non-critical):', eventsErr);
            }
          }

          try {
            const { processReceiptsHealthImpact } = await import('@/lib/health-impact');
            const impulseReceipts = newReceipts
              .filter((r) => (r.impulse_score as number) >= 60 && r.amount)
              .map((r) => ({
                receiptId: r.message_id as string,
                platform: r.platform as string,
                amount: r.amount as number,
                impulseScore: r.impulse_score as number,
                itemName: r.item_name as string | undefined,
              }));

            if (impulseReceipts.length > 0) {
              const healthResults = await processReceiptsHealthImpact(userId, impulseReceipts);
              logger.info(`[Email Scan] Health impact: ${healthResults.length} impulse events processed`);
            }
          } catch (healthErr) {
            logger.error('[Email Scan] Health impact error (non-critical):', healthErr);
          }
        }
      }

      await supabase
        .from('email_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_history_id: (messagesList as { historyId?: string }).historyId || connection.last_history_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      return NextResponse.json({
        receipts: newReceipts,
        scanned: messages.length,
        newReceipts: newReceipts.length,
      });
    } catch (err) {
      logger.error('Gmail scan error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (connectionIdForCatch && (errorMessage.includes('401') || errorMessage.includes('invalid'))) {
        await supabase
          .from('email_connections')
          .update({ status: 'expired', error_message: errorMessage, updated_at: new Date().toISOString() })
          .eq('id', connectionIdForCatch);
      }

      return NextResponse.json(
        { error: 'Email scan failed. Please try again.', receipts: [], scanned: 0 },
        { status: 500 },
      );
    }
  } finally {
    await releaseLock(lockKey);
  }
});
