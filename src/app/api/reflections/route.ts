import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { isGatedFeedEntry } from '@/lib/content-gate';

type ReflectionRow = {
  id: string;
  avatar: string;
  text: string;
  text_zh: string | null;
  resonates: number;
  is_seed: boolean;
  created_at: string;
};

type CreatePayload = { text: string; avatar?: string };

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase, request }) => {
  try {
    const url = request.url;
    const locale = url.includes('locale=zh') ? 'zh' : 'en';

    const { data, error } = await supabase
      .from('daily_reflections')
      .select('id, avatar, text, text_zh, resonates, is_seed, created_at')
      .order('created_at', { ascending: false })
      .limit(20) as { data: ReflectionRow[] | null; error: { message?: string } | null };

    if (error) {
      logger.warn('[Reflections] GET failed:', error.message);
      return NextResponse.json({ reflections: [] });
    }

    const reflections = (data as ReflectionRow[] | null) ?? [];
    const mapped = reflections.map((row) => {
      if (row.is_seed && locale === 'zh' && row.text_zh) {
        return { ...row, text: row.text_zh };
      }
      return row;
    });

    // 🔧 显示层过滤: QA/TEST 编号条目不进社区流 (数据库铁律: 行只能由用户自己删)。
    //    text 与 text_zh 都过 gate, 被滤条目记入日志供清理清单使用。
    const gated = mapped.filter(
      (row) => !isGatedFeedEntry([row.text, row.text_zh]),
    );
    const gatedOut = mapped.length - gated.length;
    if (gatedOut > 0) {
      logger.warn(
        `[Reflections] content-gate filtered ${gatedOut} QA/test entries:`,
        JSON.stringify(mapped.filter((row) => isGatedFeedEntry([row.text, row.text_zh])).map((row) => row.text)),
      );
    }

    return NextResponse.json({ reflections: gated });
  } catch (err) {
    logger.error('[Reflections] GET unexpected error:', err);
    return NextResponse.json({ reflections: [] });
    // safe to ignore: GET reflections should not block the UI
  }
});

export const POST = withAuth(async ({ supabase, user, request }) => {
  try {
    const body = (await request.json()) as CreatePayload;

    const text = String(body?.text ?? '').trim();
    const avatar = String(body?.avatar ?? '🌙').trim() || '🌙';

    if (!text || text.length < 1 || text.length > 500) {
      return NextResponse.json({ error: 'Invalid text length' }, { status: 422 });
    }

    if (avatar.length < 1 || avatar.length > 8) {
      return NextResponse.json({ error: 'Invalid avatar' }, { status: 400 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayReflectionCount } = await supabase
      .from('daily_reflections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString());

    if ((todayReflectionCount ?? 0) > 10) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    const { data, error } = await supabase
      .from('daily_reflections')
      .insert({ user_id: user.id, text, avatar })
      .select('id, avatar, text, resonates, is_seed, created_at')
      .single() as { data: ReflectionRow | null; error: { message?: string } | null };

    if (error) {
      console.warn('[Reflections] POST failed:', error.message);
      return NextResponse.json({ error: 'internal_error' }, { status: 400 });
    }

    return NextResponse.json({ reflection: data as ReflectionRow }, { status: 201 });
  } catch (err) {
    logger.error('[Reflections] POST unexpected error:', err);
    throw err;
  }
});
