import { randomInt } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { createAdminClient } from '@/lib/supabase-admin';
import { checkRateLimit } from '@/lib/distributed-lock';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export async function POST(request: NextRequest): Promise<Response> {
  const { user, error: authError, mergeCookies } = await createAuthenticatedClient(request);
  if (authError || !user) {
    return mergeCookies(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
  }

  const { allowed } = await checkRateLimit(`bind:code:${user.id}`, 1, 60_000);
  if (!allowed) {
    return mergeCookies(NextResponse.json({ error: 'Please wait before requesting another code.' }, { status: 429 }));
  }

  const { supabase, error } = createAdminClient();
  if (error || !supabase) {
    return mergeCookies(NextResponse.json({ error: 'Service unavailable' }, { status: 503 }));
  }

  const { data: code, error: issueError } = await supabase.rpc('issue_channel_bind_code', {
    p_user_id: user.id,
    p_code: generateCode(),
    p_platform: 'telegram',
  });
  if (issueError || !code) {
    logger.error('[Channel] bind_code_issue_failed user=%s', user.id.substring(0, 8), issueError?.message ?? 'empty code');
    return mergeCookies(NextResponse.json({ error: 'Could not create binding code' }, { status: 500 }));
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  return mergeCookies(NextResponse.json({ ok: true, code, deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null }));
}
