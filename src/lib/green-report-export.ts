/**
 * Green report export — 纯前端生成近 30/90 天绿色守护简报 JSON。
 *
 * 数据源：
 * - /api/buddy/health-events（前端可读，无需 rescue 域）
 * - /api/buddy/state  读取摘要（可选 fallback）
 *
 * JSON 结构：
 * {
 *   "period": "30d" | "90d",
 *   "exportedAt": "...",
 *   "summary": { "totalIntercepts": 0, "totalSavedHours": 0, "streakDays": 0 },
 *   "events": [ { "date": "...", "type": "...", "savedHours": 0 } ]
 * }
 *
 * 红线：
 * - 不导出 raw money，事件摘要只含 date / type / savedHours
 * - 不新增后端 API，纯前端计算 + localStorage
 */

export type GreenReportPeriod = '30d' | '90d';

export interface GreenReportEvent {
  date: string;
  type: string;
  savedHours: number;
}

export interface GreenReport {
  period: GreenReportPeriod;
  exportedAt: string;
  summary: {
    totalIntercepts: number;
    totalSavedHours: number;
    streakDays: number;
  };
  events: GreenReportEvent[];
}

const DEFAULT_HOURLY_RATE = 25;

export interface ExportGreenReportOptions {
  /** 调用方提供的 fetcher，便于测试 mock；默认使用全局 apiFetch */
  fetchJson?: <T = unknown>(input: string, init?: RequestInit) => Promise<T>;
  /** 自定义时薪，覆盖默认 $25/hr */
  hourlyRateOverride?: number | null;
}

function isClientSafeEventType(eventType: string | undefined): boolean {
  if (!eventType) return false;
  // 只保留具象守护/干预事件，避免导出太多系统噪声。
  return [
    'challenge_completed',
    'challenge_won',
    'impulse_confessed',
    'mindful_recovery',
    'refund_boost',
    'daily_recovery',
    'revived',
  ].includes(eventType);
}

function startOfDay(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

function windowStart(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function buildGreenReport(period: GreenReportPeriod, options: ExportGreenReportOptions = {}): Promise<GreenReport> {
  const days = period === '30d' ? 30 : 90;
  const cutoff = windowStart(days);
  const exportedAt = new Date().toISOString();
  const hourlyRate = options.hourlyRateOverride && options.hourlyRateOverride > 0 ? options.hourlyRateOverride : DEFAULT_HOURLY_RATE;

  const fetchJson = options.fetchJson || ((await import('@/lib/api-client')).apiFetch as unknown as <T = unknown>(input: string, init?: RequestInit) => Promise<T>);

  let events: Array<{ eventType?: string; createdAt?: string; metadata?: Record<string, unknown> }> = [];
  try {
    const data = await fetchJson<{ events?: Array<{ eventType?: string; createdAt?: string; metadata?: Record<string, unknown> }> }>('/api/buddy/health-events?limit=200');
    events = Array.isArray(data?.events) ? data.events : [];
  } catch {
    // 只读导出失败时不阻塞，降级为空事件
  }

  const filtered = events
    .filter((e) => {
      if (!isClientSafeEventType(e.eventType)) return false;
      const created = e.createdAt ? new Date(e.createdAt) : null;
      if (!created || Number.isNaN(created.getTime())) return false;
      return created >= cutoff;
    })
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });

  const mappedEvents: GreenReportEvent[] = filtered.map((e) => {
    const amount = typeof e.metadata?.amount === 'number' ? (e.metadata.amount as number) : 0;
    const hours = amount > 0 ? Number((amount / hourlyRate).toFixed(2)) : 0;
    const date = e.createdAt ? new Date(e.createdAt) : new Date();
    return {
      date: startOfDay(date),
      type: e.eventType || 'event',
      savedHours: hours,
    };
  });

  const totalSavedHours = Number(mappedEvents.reduce((sum, item) => sum + item.savedHours, 0).toFixed(2));
  const totalIntercepts = mappedEvents.length;

  // 最佳-effort streak：统计有多少个不同日期发生了至少 1 次拦截
  const dates = new Set(mappedEvents.map((item) => item.date));
  const streakDays = dates.size;

  return {
    period,
    exportedAt,
    summary: {
      totalIntercepts,
      totalSavedHours,
      streakDays,
    },
    events: mappedEvents,
  };
}

export async function exportGreenReportBlob(period: GreenReportPeriod, options: ExportGreenReportOptions = {}): Promise<Blob> {
  const report = await buildGreenReport(period, options);
  const json = JSON.stringify(report, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function greenReportFilename(period: GreenReportPeriod, userId?: string | null): string {
  const prefix = userId ? `symy-green-report-${userId.slice(0, 8)}` : 'symy-green-report';
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${period}-${today}.json`;
}
