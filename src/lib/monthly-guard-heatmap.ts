import type { ImpulseEvent } from './impulse-detector';

export interface Cell {
  date: Date;
  count: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export const CELL_CLASSES = [
  'bg-white/5',
  'bg-emerald-500/20',
  'bg-emerald-500/40',
  'bg-emerald-500/70',
] as const;

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function colorForCount(count: number): string {
  if (count >= 3) return CELL_CLASSES[3];
  if (count === 2) return CELL_CLASSES[2];
  if (count === 1) return CELL_CLASSES[1];
  return CELL_CLASSES[0];
}

export function buildCalendarCells(year: number, month: number): Cell[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon-based
  const cells: Cell[] = [];
  const now = new Date();
  const todayKey = dayKey(now);

  for (let i = -startOffset; i < 42; i++) {
    const d = new Date(year, month, 1 + i);
    const inMonth = d.getMonth() === month && d.getFullYear() === year;
    cells.push({
      date: d,
      count: 0,
      isCurrentMonth: inMonth,
      isToday: dayKey(d) === todayKey,
    });
  }
  return cells;
}

export interface AggregatedMonth {
  cells: Cell[];
  guardDays: number;
  intercepts: number;
  refunds: number;
  moneyLeft: number;
}

export function aggregateMonth(events: ImpulseEvent[], year: number, month: number, now: Date): AggregatedMonth {
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 29);

  const counts = new Map<string, number>();
  let intercepts = 0;
  let refunds = 0;
  let moneyLeft = 0;

  for (const e of events) {
    if (e.subType !== 'challenge_completed' && e.subType !== 'refund_processed') continue;
    const d = new Date(e.timestamp);
    if (d < windowStart || d > now) continue;
    const key = dayKey(d);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (e.subType === 'challenge_completed') intercepts += 1;
    else refunds += 1;
    moneyLeft += e.amount || 0;
  }

  const cells = buildCalendarCells(year, month);
  for (const cell of cells) {
    if (!cell.isCurrentMonth) continue;
    const key = dayKey(cell.date);
    cell.count = counts.get(key) || 0;
  }

  const guardDays = cells.filter((c) => c.isCurrentMonth && c.count > 0).length;

  return {
    cells,
    guardDays,
    intercepts,
    refunds,
    moneyLeft,
  };
}

export const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'] as const;
