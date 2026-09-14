'use client';

/**
 * BlindSpotMap — 盲区地图组件
 *
 * 展示用户的 5 个盲区维度 (深夜/直播/情绪/金额/冲动)
 * 位于 Me 页, "This week's seeing" 下方, Premium 卡片上方
 *
 * 数据不足 (< 3 次) 的盲区不展示
 * 完全没有数据时展示引导文案
 */

import { useState, useEffect, useRef } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';

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

interface BlindSpotData {
  total_challenges: number;
  blind_spots: BlindSpot[];
  completed_blind_spots: number;
  total_blind_spots: number;
  empathy_text: string;
  // 🔧 PM-P1-13 fix: 附加元数据供前端构造 i18n 文案
  amount_tier?: string | null;
  emotional_type?: string | null;
}

// 🔧 PM-P1-13 fix: 前端 i18n 文案表 (替代后端硬编码中文)
// 🔧 PM-#14 fix: insight 改为可选函数, 根据 rate 动态选择文案 (避免 0% 时 "Slow down" 矛盾)
const BLIND_SPOT_I18N: Record<string, {
  label: { en: string; zh: string };
  description: { en: (rate: number, tier?: string, type?: string) => string; zh: (rate: number, tier?: string, type?: string) => string };
  insight: { en: string | ((rate: number) => string); zh: string | ((rate: number) => string) };
}> = {
  night: {
    label: { en: 'Night Blind Spot', zh: '深夜盲区' },
    description: {
      en: () => `of late-night temptations arrived after 10 PM — your elephant kept watch`,
      zh: () => `的深夜诱惑出现在晚上 10 点后——小象一直替你留意`,
    },
    insight: {
      en: 'That\'s when you\'re most tired\nYour guardian watches the late-night cart for you',
      zh: '那是你最累的时候\n守护者会替你守着深夜购物车',
    },
  },
  livestream: {
    label: { en: 'Livestream Blind Spot', zh: '直播盲区' },
    description: {
      en: () => `of temptations arrived during livestreams — your elephant kept watch`,
      zh: () => `的诱惑出现在直播间——小象一直替你留意`,
    },
    insight: {
      en: 'That\'s where urgency is strongest\nYour guardian holds the pause for you',
      zh: '那是紧迫感最强的地方\n守护者会替你按住停顿',
    },
  },
  emotional: {
    label: { en: 'Emotional Blind Spot', zh: '情绪盲区' },
    description: {
      en: (_rate, _tier, type) => `of guarded moments clustered on ${type === 'weekday' ? 'stressful workdays' : 'weekends'} — your elephant noticed them first`,
      zh: (_rate, _tier, type) => `的守护时刻集中在${type === 'weekday' ? '压力大的工作日' : '周末'}——小象最先注意到`,
    },
    insight: {
      en: 'Stress asks for quick relief\nYour guardian keeps a calmer option nearby\nTime back is worth more than a quick fix',
      zh: '压力会催促快点解脱\n守护者会备好更安稳的选择\n赢回时间，比快速缓解更珍贵',
    },
  },
  amount: {
    label: { en: 'Amount Blind Spot', zh: '金额盲区' },
    description: {
      en: (_rate, tier) => `of guarded pauses landed on ${tier === 'small' ? '$10-$50 small purchases' : tier === 'medium' ? '$51-$200 medium purchases' : '$200+ large purchases'} — your elephant noticed the pattern`,
      zh: (_rate, tier) => `的守护停顿落在${tier === 'small' ? '$10-$50 小额' : tier === 'medium' ? '$51-$200 中额' : '$200+ 大额'}消费——小象看见了规律`,
    },
    insight: {
      en: '"I deserve it" often sounds like an ad\nYour guardian keeps the decision with you\nand protects the moment you really want',
      zh: '"我值得"常常像广告的声音\n守护者会把决定权留给你\n也守住你真正想要的时刻',
    },
  },
  impulse: {
    label: { en: 'Induced Blind Spot', zh: '被诱导盲区' },
    description: {
      en: () => `of quick decisions arrived in under 30 seconds — your elephant caught them`,
      zh: () => `的快速决定发生在 30 秒内——小象替你接住了`,
    },
    // 🔧 PM-#14 fix: 根据 rate 动态选择 insight, 避免 0% 时 "Slow down" 矛盾
    //   高冲动 (≥50%): 警示文案
    //   中冲动 (20-49%): 提醒文案
    //   低冲动 (<20%): 肯定文案 (用户不是冲动型, 不该说 "Slow down")
    insight: {
      en: (rate: number) => rate >= 50
        ? 'Urgency raced ahead of thought\nYour guardian brings a 30-second pause'
        : rate >= 20
          ? 'Urgency sometimes moves quickly\nA gentle pause is already on your side'
          : 'You take your time before paying\nThat\'s rare — protect it',
      zh: (rate: number) => rate >= 50
        ? '紧迫感跑在了思考前面\n守护者会给你 30 秒的停顿'
        : rate >= 20
          ? '紧迫感有时来得很快\n一次轻柔的停顿已经站在你这边'
          : '你付款前会花时间思考\n这很罕见——保护它',
    },
  },
};

// 🔧 PM-P1-13 fix: 共情文案 i18n
const EMPATHY_TEXT = {
  en: 'This isn\'t your fault.\nThese spending patterns took years to build.\nBut now you see them.\nSeeing the blind spot is the first step to shrinking it.',
  zh: '这不是你的错。\n这些盲区，是算法花了 20 年找到的。\n但现在你看见了盲区。\n看见盲区，盲区就开始缩小。',
};

// 🔧 P2-9 fix (2026-07-20): 盲点应对建议 (点击展开显示)
const BLIND_SPOT_ADVICE: Record<string, { en: string; zh: string }> = {
  night: {
    en: '📱 Turn off shopping app notifications after 10 PM\n⏰ Set a "no buy after midnight" rule\n🌙 Charge your phone outside the bedroom',
    zh: '📱 晚上 10 点后关闭购物 App 通知\n⏰ 设定"午夜后不买"规则\n🌙 把手机放在卧室外充电',
  },
  amount: {
    en: '⏳ Add a 24-hour cooling-off period for purchases over $200\n💬 Tell a friend before big purchases\n📝 Keep a "want list" and review it weekly',
    zh: '⏳ $200 以上消费强制 24 小时冷静期\n💬 大额消费前告诉朋友\n📝 保持"想要清单"，每周回顾',
  },
  impulse: {
    en: '🧘 Take 3 deep breaths before any purchase\n❓ Ask: "What need am I trying to fill?"\n🚫 Unsubscribe from promotional emails',
    zh: '🧘 任何消费前深呼吸 3 次\n❓ 问自己："我在试图填补什么需求？"\n🚫 退订促销邮件',
  },
};

interface BlindSpotMapProps {
  isActive?: boolean;
  onOpenPremium?: () => void;
}

export function BlindSpotMap({ isActive = true }: BlindSpotMapProps) {
  const { t: _t, locale } = useI18n();
  const [data, setData] = useState<BlindSpotData | null>(null);
  const [isLoading, setIsLoading] = useState(isActive);
  const abortRef = useRef<AbortController | null>(null);
  // 🔧 P2-9 fix (2026-07-20): 盲点展开状态 — 点击展开应对建议
  const [expandedSpot, setExpandedSpot] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    (async () => {
      try {
  // eslint-disable-next-line symy/no-raw-fetch-in-use-effect
        const result = await apiFetch<BlindSpotData>('/api/blind-spot-map', {
          signal: controller.signal,
        });
        setData(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.warn('[BlindSpotMap] fetch failed:', err);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [isActive]);

  if (isLoading) {
    return (
      <div className="w-full bg-gradient-to-br from-amber-500/8 to-orange-500/5 dark:from-amber-500/12 dark:to-orange-500/8 border border-amber-500/20 dark:border-amber-500/30 rounded-2xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-glass-fill rounded" />
          <div className="h-20 bg-glass-fill rounded-xl" />
          <div className="h-20 bg-glass-fill rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const visibleSpots = data.blind_spots.filter(b => b.show);
  // 🔧 2026-07-15 (ARCH-6 #5): Use i18n key instead of locale === 'zh'
  const title = _t('blindSpot.title');
  // 🔧 cleanup: removed dead code _empathyLines (was assigned but never used)

  // 新用户 (无数据)
  if (data.total_challenges === 0) {
    return (
      <div className="w-full bg-gradient-to-br from-amber-500/8 to-orange-500/5 dark:from-amber-500/12 dark:to-orange-500/8 border border-amber-500/20 dark:border-amber-500/30 rounded-2xl p-5">
        <h3 className="text-base font-bold text-amber-700 dark:text-amber-300 mb-3">{title}</h3>
        <p className="text-sm text-text-tertiary text-center py-4">
          {_t('blindSpot.emptyData')}
        </p>
      </div>
    );
  }

  // 数据不足
  if (visibleSpots.length === 0) {
    return (
      <div className="w-full bg-gradient-to-br from-amber-500/8 to-orange-500/5 dark:from-amber-500/12 dark:to-orange-500/8 border border-amber-500/20 dark:border-amber-500/30 rounded-2xl p-5">
        <h3 className="text-base font-bold text-amber-700 dark:text-amber-300 mb-3">{title}</h3>
        <p className="text-sm text-text-tertiary text-center py-4">
          {_t('blindSpot.insufficientData', { completed: String(data.completed_blind_spots), total: String(data.total_blind_spots) })}
        </p>
      </div>
    );
  }

  // 正常渲染
  return (
    <div className="w-full bg-gradient-to-br from-amber-500/8 to-orange-500/5 dark:from-amber-500/12 dark:to-orange-500/8 border border-amber-500/20 dark:border-amber-500/30 rounded-2xl p-5">
      {/* 标题 */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/30 flex items-center justify-center">
          <MapIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-amber-700 dark:text-amber-300">{title}</h3>
      </div>

      {/* 盲区列表 */}
      <div className="space-y-4">
        {visibleSpots.map((spot, i) => {
          // 🔧 PM-P1-13 fix: 从前端 i18n 表获取文案, 而非后端硬编码中文
          const i18nEntry = BLIND_SPOT_I18N[spot.type];
          const label = i18nEntry ? i18nEntry.label[locale] : spot.type;
          const description = spot.rate !== null && i18nEntry
            ? i18nEntry.description[locale](spot.rate, data?.amount_tier || undefined, data?.emotional_type || undefined)
            : null;
          // 🔧 PM-#14 fix: insight 支持函数类型, 根据 rate 动态选择文案
          const rawInsight = i18nEntry ? i18nEntry.insight[locale] : null;
          // 🔧 2026-07-15: Fix TS error — rawInsight can be string | function, resolve to string only
          const insight: string | null = typeof rawInsight === 'function' && spot.rate !== null
            ? rawInsight(spot.rate)
            : (typeof rawInsight === 'string' ? rawInsight : null);
          return (
          <div key={spot.type} className={i > 0 ? 'pt-4 border-t border-amber-500/15' : ''}>
            {/* 🔧 P2-9 fix: 盲点卡片可点击, 展开应对建议 */}
            <div
              onClick={() => spot.sample_count >= 10 && setExpandedSpot(expandedSpot === spot.type ? null : spot.type)}
              className={spot.sample_count >= 10 ? 'cursor-pointer hover:bg-amber-500/5 rounded-lg p-1 -m-1 transition-colors' : ''}
            >
            {/* 盲区标题 */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{spot.emoji}</span>
              <span className="text-sm font-semibold text-text-primary">{label}</span>
              {spot.sample_count >= 10 && (
                <span className="ml-auto text-[10px] text-text-tertiary">
                  {expandedSpot === spot.type ? '▲' : '▼'}
                </span>
              )}
            </div>
            {/* 🔧 P1-2 fix: 数据不足 (<10 条) 时显示提示, 不显示 0% 误导用户 */}
            {spot.sample_count < 10 ? (
              <p className="text-sm text-text-tertiary leading-relaxed">
                {locale === 'zh'
                  ? `数据不足（${spot.sample_count} 条记录），继续使用 Symy 来发现你的盲点`
                  : `Insufficient data (${spot.sample_count} records). Keep using Symy to discover your blind spots.`}
              </p>
            ) : (
            <>
            {/* 比率 + 描述 */}
            {spot.rate !== null && description && (
              <p className="text-sm text-text-secondary leading-relaxed">
                <span className="text-lg font-bold text-amber-500 dark:text-amber-400">{spot.rate}%</span>{' '}
                {description}
              </p>
            )}
            {/* 洞察 */}
            {insight && (
              <p className="text-xs text-text-tertiary leading-relaxed mt-1 whitespace-pre-line">
                {insight}
              </p>
            )}
            </>
            )}
            </div>
            {/* 🔧 P2-9 fix: 展开应对建议 */}
            {expandedSpot === spot.type && BLIND_SPOT_ADVICE[spot.type] && (
              <div className="mt-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1">
                  {locale === 'zh' ? '💡 如何应对' : '💡 How to cope'}
                </p>
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                  {BLIND_SPOT_ADVICE[spot.type][locale]}
                </p>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* 共情段 */}
      {/* 🔧 PM-P1-13 fix: 用前端 i18n 共情文案, 而非后端硬编码 */}
      <div className="mt-4 pt-4 border-t border-amber-500/15">
        <p className="text-xs text-text-tertiary text-center leading-relaxed whitespace-pre-line">
          {EMPATHY_TEXT[locale]}
        </p>
      </div>

      {/* Premium 引导 */}
      <div className="mt-4 pt-4 border-t border-amber-500/15">
        <div className="text-center">
          <p className="text-xs text-text-secondary mb-2">
            🛡️ {_t('blindSpot.symyWillFindYou')}
          </p>
          <p className="text-[10px] text-text-tertiary mb-2">
            {_t('blindSpot.pushHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
