'use client';

/**
 * useGuardDiary — 每日守护日记数据源 (batch47-b)
 *
 * 读现有 /api/buddy/health-events (challenge_reward, 与 guard_ledger 同管道),
 * 过滤出本地"当日"事件, 用纯函数 generateGuardDiary 生成日记。
 * 零 DDL、不新增 API route、不调 Letta。
 * sessionStorage 按日缓存事件列表 — 同一天只取一次, 跨天自动失效。
 * 失败静默降级为 null (非关键展示路径, 不阻塞 chat)。
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { useI18n } from '@/i18n/provider';
import { useHourlyRate } from './use-hourly-rate';
import {
  generateGuardDiary,
  localDateKey,
  type GuardDiary,
  type GuardDiaryEventInput,
} from '@/lib/guard-diary';

const PAGE_SIZE = 100;
const CACHE_PREFIX = 'symy-guard-diary-cache:';

interface CachePayload {
  /** 缓存写入时的日期键 — 跨天失效 */
  date: string;
  events: GuardDiaryEventInput[];
}

function readCache(date: string): GuardDiaryEventInput[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + date);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Partial<CachePayload>;
    if (p.date !== date || !Array.isArray(p.events)) return null;
    return p.events;
  } catch {
    // safe to ignore: 缓存坏数据当未命中, 重新拉取
    return null;
  }
}

function writeCache(date: string, events: GuardDiaryEventInput[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + date, JSON.stringify({ date, events } satisfies CachePayload));
  } catch {
    // safe to ignore: 隐私模式写不了缓存, 只是当日会多取一次
  }
}

/** 拉一页守护事件 (单日展示层足够; 事件按新→旧, 首页覆盖最近 100 条) */
async function fetchGuardEvents(): Promise<GuardDiaryEventInput[]> {
  const url = new URL('/api/buddy/health-events', window.location.origin);
  url.searchParams.set('event_type', 'challenge_reward');
  url.searchParams.set('limit', String(PAGE_SIZE));
  const data = await apiFetch<{ events?: GuardDiaryEventInput[] }>(url.toString());
  return data?.events || [];
}

export interface UseGuardDiaryResult {
  /** 今日日记 (拉取完成前 / 失败 / demo → null, 调用方不渲染卡片) */
  diary: GuardDiary | null;
}

export function useGuardDiary(isDemo = false): UseGuardDiaryResult {
  const { locale } = useI18n();
  const { hourlyRate } = useHourlyRate(isDemo);
  const [events, setEvents] = useState<GuardDiaryEventInput[] | null>(null);

  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    (async () => {
      const date = localDateKey();
      const cached = readCache(date);
      if (cached) {
        if (!cancelled) setEvents(cached);
        return;
      }
      try {
        const fetched = await fetchGuardEvents();
        if (cancelled) return;
        const todayEvents = fetched.filter((e) => localDateKey(new Date(e.createdAt)) === date);
        writeCache(date, todayEvents);
        setEvents(todayEvents);
      } catch (err) {
        // safe to ignore: 非关键装饰性读 — 拉不到就不出日记卡, 不报错不阻塞 chat
        logger.warn('[useGuardDiary] fetch failed:', err instanceof Error ? err.message : String(err));
        if (!cancelled) setEvents(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  const diary = events
    ? generateGuardDiary(events, { locale: locale === 'en' ? 'en' : 'zh', hourlyRate })
    : null;

  return { diary };
}
