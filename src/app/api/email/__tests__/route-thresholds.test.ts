import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

type RouteName = 'imap-connect' | 'receipts' | 'scan';

const ROUTE_SOURCES: Record<RouteName, string> = {
  'imap-connect': readFileSync(
    join(process.cwd(), 'src/app/api/email/imap-connect/route.ts'),
    'utf-8',
  ),
  receipts: readFileSync(
    join(process.cwd(), 'src/app/api/email/receipts/route.ts'),
    'utf-8',
  ),
  scan: readFileSync(
    join(process.cwd(), 'src/app/api/email/scan/route.ts'),
    'utf-8',
  ),
};

function parseNumber(source: string, pattern: RegExp): number | null {
  const match = source.match(pattern);
  return match ? Number(match[1].replace(/_/g, '')) : null;
}

function lockTtlMs(route: RouteName): number | null {
  return parseNumber(ROUTE_SOURCES[route], /const [A-Z_]+LOCK_TTL_MS = (\d[\d_]*)/);
}

function maxDurationSeconds(route: RouteName): number | null {
  return parseNumber(ROUTE_SOURCES[route], /export const maxDuration = (\d+)/);
}

function imapConnectionTimeoutMs(route: RouteName): number | null {
  return parseNumber(
    ROUTE_SOURCES[route],
    /raceWithTimeoutReject\(\s*client\.connect\(\),\s*(\d[\d_]*)/,
  );
}

function scannedMessagesCap(route: RouteName): number | null {
  if (route === 'receipts') return null;
  return parseNumber(
    ROUTE_SOURCES[route],
    route === 'scan' ? /maxResults: (\d+)/ : /matchedUids\.slice\(0, (\d+)\)/,
  );
}

function scanWindowDays(route: RouteName): { min: number; max: number; default: number } | null {
  const match = ROUTE_SOURCES[route].match(
    /daysBack: z\.number\(\)\.int\(\)(?:\.finite\(\))?\.min\((\d+)\)\.max\((\d+)\)\.default\((\d+)\)/,
  );
  return match
    ? { min: Number(match[1]), max: Number(match[2]), default: Number(match[3]) }
    : null;
}

function listLimit(route: RouteName): { min: number; max: number; default: number } | null {
  const match = ROUTE_SOURCES[route].match(
    /limit: z\.coerce\.number\(\)\.int\(\)\.min\((\d+)\)\.max\((\d+)\)\.default\((\d+)\)/,
  );
  return match
    ? { min: Number(match[1]), max: Number(match[2]), default: Number(match[3]) }
    : null;
}

describe('email route threshold contract', () => {
  it.each([
    { semantic: 'distributed lock TTL', actual: lockTtlMs, expected: 180_000, sharedBy: ['imap-connect', 'scan'] },
    { semantic: 'function max duration', actual: maxDurationSeconds, expected: 180, sharedBy: ['imap-connect', 'scan'] },
    { semantic: 'scanned message cap', actual: scannedMessagesCap, expected: 50, sharedBy: ['imap-connect', 'scan'] },
  ] as const)('$semantic is aligned and receipts is not a scanning route', ({ actual, expected, sharedBy }) => {
    const values = sharedBy.map((route) => actual(route));
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe(expected);
    expect(actual('receipts')).toBeNull();
  });

  it('uses one scan-window policy for both scanning routes', () => {
    expect(scanWindowDays('imap-connect')).toEqual(scanWindowDays('scan'));
    expect(scanWindowDays('imap-connect')).toEqual({ min: 1, max: 90, default: 7 });
    expect(scanWindowDays('receipts')).toBeNull();
  });

  it('uses one IMAP connection timeout policy', () => {
    expect(imapConnectionTimeoutMs('imap-connect')).toBe(15_000);
    expect(imapConnectionTimeoutMs('receipts')).toBeNull();
    expect(imapConnectionTimeoutMs('scan')).toBeNull();
  });

  it('keeps the receipts list pagination policy explicit', () => {
    expect(listLimit('receipts')).toEqual({ min: 1, max: 200, default: 50 });
    expect(listLimit('imap-connect')).toBeNull();
    expect(listLimit('scan')).toBeNull();
  });
});
