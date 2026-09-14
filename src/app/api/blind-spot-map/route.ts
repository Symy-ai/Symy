/**
 * GET /api/blind-spot-map — 盲区地图数据
 *
 * 从用户挑战历史计算 5 个盲区维度:
 * 1. 深夜盲区 (night): 22-2 点的"没看见"比例
 * 2. 直播盲区 (livestream): TikTok Shop 的"没看见"比例
 * 3. 情绪盲区 (emotional): 工作日 vs 周末的"没看见"率差异
 * 4. 金额盲区 (amount): 3 档金额的"没看见"率,取最高
 * 5. 冲动盲区 (impulse): challenge_duration < 30s 的"没看见"比例
 *
 * 数据不足 (< 3 次) 的盲区 show: false
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/error-utils';

interface ChallengeRecord {
  created_at: string;
  status: string; // 'passed' | 'failed' | 'active' | 'expired'
  amount: number;
  item_name: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * 从 metadata JSONB 提取 platform (active_challenges 表没有 platform 列).
 * 旧记录可能没有 platform, 返回空字符串.
 */
function getPlatform(r: ChallengeRecord): string {
  const meta = r.metadata as Record<string, unknown> | null | undefined;
  const platform = meta?.platform;
  return typeof platform === 'string' ? platform.toLowerCase() : '';
}

interface BlindSpot {
  type: string;
  label: string;
  emoji: string;
  rate: number | null;
  description: string | null;
  insight: string | null;
  sample_count: number;
  show: boolean;
}

const MIN_SAMPLES = 3;

function isBlind(record: ChallengeRecord): boolean {
  // "没看见" = challenge status = 'failed' (用户买了, 没看见)
  // 或者 status = 'passed' 但 result 是 bought_without_seeing
  return record.status === 'failed';
}

function getHour(timestamp: string): number {
  return new Date(timestamp).getHours();
}

function getDayOfWeek(timestamp: string): number {
  // 0=Sunday, 1=Monday, ..., 6=Saturday
  return new Date(timestamp).getDay();
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function isNightTime(hour: number): boolean {
  // 22-2 (10PM to 2AM)
  return hour >= 22 || hour <= 2;
}

function calcRate(blind: number, total: number): number | null {
  if (total < MIN_SAMPLES) return null;
  return Math.round((blind / total) * 100);
}

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    // 查询用户所有挑战记录
    const { data: challenges, error } = await supabase
      .from('active_challenges')
      .select('created_at, status, amount, item_name, metadata')
      .eq('user_id', user.id)
      .in('status', ['passed', 'failed'])
      .order('created_at', { ascending: true });

    if (error) {
      logger.warn('[BlindSpotMap] query error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch blind spot data' }, { status: 500 });
    }

    const records: ChallengeRecord[] = (challenges || []) as ChallengeRecord[];

    // 🔧 2026-07-15: 把用户自己输入的盲盒数据 (is_example=false, decision_type='bought') 也纳入盲区地图
    //   理由: 用户在盲盒中输入的真实消费行为 (非示例)，大概率是他们在现实生活中真的执行了的
    //   这些数据作为 'failed' 记录 (bought = 没看见就买了) 加入盲区地图计算
    try {
      const { data: gachaSessions, error: gachaError } = await supabase
        .from('butterfly_sessions')
        .select('created_at, decision_type, decision_description, amount, platform, is_example')
        .eq('user_id', user.id)
        .eq('decision_type', 'bought')
        .eq('is_example', false)
        .order('created_at', { ascending: true });

      if (!gachaError && gachaSessions) {
        const gachaRecords: ChallengeRecord[] = gachaSessions.map((s: Record<string, unknown>) => ({
          created_at: s.created_at as string,
          status: 'failed', // bought = 没看见就买了 = blind
          amount: Number(s.amount) || 0,
          item_name: s.decision_description as string,
          metadata: { platform: s.platform },
        }));
        records.push(...gachaRecords);
      }
    } catch (gachaErr) {
      // safe to ignore: non-critical error, logged for observability
      // 非关键: is_example 列可能不存在 (migration 117 未执行), 静默跳过
      logger.warn('[BlindSpotMap] Failed to fetch gacha sessions (non-blocking):', getErrorMessage(gachaErr));
    }
    const totalChallenges = records.length;

    // 1. 深夜盲区 (night)
    const nightRecords = records.filter(r => isNightTime(getHour(r.created_at)));
    const nightBlind = nightRecords.filter(isBlind).length;
    const nightRate = calcRate(nightBlind, nightRecords.length);

    // 2. 直播盲区 (livestream)
    const livestreamRecords = records.filter(r => {
      const platform = getPlatform(r);
      return platform.includes('tiktok') || platform.includes('live') || platform.includes('stream');
    });
    const livestreamBlind = livestreamRecords.filter(isBlind).length;
    const livestreamRate = calcRate(livestreamBlind, livestreamRecords.length);

    // 3. 情绪盲区 (emotional) — 工作日 vs 周末
    const weekdayRecords = records.filter(r => !isWeekend(getDayOfWeek(r.created_at)));
    const weekendRecords = records.filter(r => isWeekend(getDayOfWeek(r.created_at)));
    const weekdayBlind = weekdayRecords.filter(isBlind).length;
    const weekendBlind = weekendRecords.filter(isBlind).length;
    const weekdayRate = calcRate(weekdayBlind, weekdayRecords.length);
    const weekendRate = calcRate(weekendBlind, weekendRecords.length);

    let emotionalDiff: number | null = null;
    let emotionalType: 'weekday' | 'weekend' | null = null;
    if (weekdayRate !== null && weekendRate !== null) {
      if (weekdayRate > weekendRate + 15) {
        emotionalDiff = weekdayRate - weekendRate;
        emotionalType = 'weekday';
      } else if (weekendRate > weekdayRate + 15) {
        emotionalDiff = weekendRate - weekdayRate;
        emotionalType = 'weekend';
      }
    }

    // 4. 金额盲区 (amount)
    const smallRecords = records.filter(r => r.amount >= 10 && r.amount <= 50);
    const mediumRecords = records.filter(r => r.amount >= 51 && r.amount <= 200);
    const largeRecords = records.filter(r => r.amount > 200);
    const smallRate = calcRate(smallRecords.filter(isBlind).length, smallRecords.length);
    const mediumRate = calcRate(mediumRecords.filter(isBlind).length, mediumRecords.length);
    const largeRate = calcRate(largeRecords.filter(isBlind).length, largeRecords.length);

    let amountRate: number | null = null;
    let amountTier: 'small' | 'medium' | 'large' | null = null;
    const rates: Array<{ tier: 'small' | 'medium' | 'large'; rate: number | null }> = [
      { tier: 'small', rate: smallRate },
      { tier: 'medium', rate: mediumRate },
      { tier: 'large', rate: largeRate },
    ];
    const validRates = rates.filter(r => r.rate !== null);
    if (validRates.length > 0) {
      const max = validRates.reduce((prev, curr) => (curr.rate! > prev.rate! ? curr : prev));
      amountRate = max.rate;
      amountTier = max.tier;
    }

    // 5. 冲动盲区 (impulse) — challenge_duration < 30s
    // 从 metadata 中提取 duration (如果有的话)
    const impulseRecords = records.filter(r => {
      const meta = r.metadata as Record<string, unknown> | null;
      const duration = meta?.challenge_duration;
      return typeof duration === 'number' && duration < 30;
    });
    const impulseBlind = impulseRecords.filter(isBlind).length;
    const impulseRate = calcRate(impulseBlind, impulseRecords.length);

    // 构建盲区列表 (PM-P1-13 fix: 仅返回数据, 文案由前端 i18n 处理)
    const blindSpots: BlindSpot[] = [
      {
        type: 'night',
        label: 'night',
        emoji: '🌙',
        rate: nightRate,
        description: null,
        insight: null,
        sample_count: nightRecords.length,
        show: nightRate !== null,
      },
      {
        type: 'livestream',
        label: 'livestream',
        emoji: '📱',
        rate: livestreamRate,
        description: null,
        insight: null,
        sample_count: livestreamRecords.length,
        show: livestreamRate !== null,
      },
      {
        type: 'emotional',
        label: 'emotional',
        emoji: '💼',
        rate: emotionalDiff,
        description: null,
        insight: null,
        sample_count: Math.min(weekdayRecords.length, weekendRecords.length),
        show: emotionalDiff !== null,
      },
      {
        type: 'amount',
        label: 'amount',
        emoji: '💰',
        rate: amountRate,
        description: null,
        insight: null,
        sample_count: amountTier === 'small' ? smallRecords.length : amountTier === 'medium' ? mediumRecords.length : largeRecords.length,
        show: amountRate !== null,
      },
      {
        type: 'impulse',
        label: 'impulse',
        emoji: '⚡',
        rate: impulseRate,
        description: null,
        insight: null,
        sample_count: impulseRecords.length,
        show: impulseRate !== null,
      },
    ];

    // 🔧 PM-P1-13 fix: 返回 amount_tier + emotional_type 供前端 i18n 使用
    const completedBlindSpots = blindSpots.filter(b => b.show).length;

    return NextResponse.json({
      total_challenges: totalChallenges,
      blind_spots: blindSpots,
      completed_blind_spots: completedBlindSpots,
      total_blind_spots: 5,
      empathy_text: '',  // 🔧 PM-P1-13 fix: 文案移到前端 i18n
      // 🔧 PM-P1-13 fix: 附加元数据供前端构造 i18n 文案
      amount_tier: amountTier,
      emotional_type: emotionalType,
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[BlindSpotMap] unhandled error:', getErrorMessage(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
