/**
 * /api/admin/letta-diag — Letta availability diagnostic (read-only, admin-only)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';

const UPSTREAM_TIMEOUT_MS = 5_000;

export async function GET(request: NextRequest) {
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const apiKey = process.env.LETTA_API_KEY || '';
  const baseUrl = process.env.LETTA_BASE_URL || 'https://api.letta.com';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/agents?limit=1`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });

    return NextResponse.json({
      lettaConfigured: !!apiKey,
      baseUrl: process.env.LETTA_BASE_URL ? 'set' : 'unset',
      upstream: 'ok',
      upstreamLatencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const aborted = error instanceof Error && (
      error.name === 'AbortError' || error.name === 'TimeoutError'
    );

    return NextResponse.json({
      lettaConfigured: !!apiKey,
      baseUrl: process.env.LETTA_BASE_URL ? 'set' : 'unset',
      upstream: aborted ? 'timeout' : 'fail',
      upstreamLatencyMs: Date.now() - startedAt,
    });
  } finally {
    clearTimeout(timeout);
  }
}
