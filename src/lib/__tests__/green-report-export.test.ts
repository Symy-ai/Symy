import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildGreenReport, exportGreenReportBlob, greenReportFilename, type GreenReport, type GreenReportPeriod } from '../green-report-export';

function mockFetchJson(response: unknown) {
  return vi.fn().mockResolvedValue(response);
}

describe('green report export', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('builds a 30d report with normalized summary and events', async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);

    const mockResponse = {
      events: [
        { eventType: 'challenge_completed', createdAt: tenDaysAgo.toISOString(), metadata: { amount: 25 } },
        { eventType: 'mindful_recovery', createdAt: tenDaysAgo.toISOString(), metadata: {} },
        { eventType: 'refund_boost', createdAt: tenDaysAgo.toISOString(), metadata: { amount: 50 } },
        { eventType: 'impulse_damage', createdAt: tenDaysAgo.toISOString() },
        { eventType: 'challenge_completed', createdAt: now.toISOString(), metadata: { amount: 10 } },
      ],
    };

    const fetchJson = mockFetchJson(mockResponse);
    const report = await buildGreenReport('30d', { fetchJson });

    const expectedDate = tenDaysAgo.toISOString().slice(0, 10);
    expect(report.period).toBe('30d');
    expect(typeof report.exportedAt).toBe('string');
    expect(report.summary).toEqual({ totalIntercepts: 4, totalSavedHours: 3.4, streakDays: 2 });
    expect(report.events).toEqual([
      { date: expectedDate, type: 'challenge_completed', savedHours: 1 },
      { date: expectedDate, type: 'mindful_recovery', savedHours: 0 },
      { date: expectedDate, type: 'refund_boost', savedHours: 2 },
      { date: now.toISOString().slice(0, 10), type: 'challenge_completed', savedHours: 0.4 },
    ]);
    expect(report.events[0]).not.toHaveProperty('amount');
    expect(report.events[1]).not.toHaveProperty('amount');
  });

  it('builds a 90d report with empty events on fetch failure', async () => {
    const fetchJson = mockFetchJson(new Error('boom'));
    const report = await buildGreenReport('90d', { fetchJson });

    expect(report.period).toBe('90d');
    expect(report.summary).toEqual({ totalIntercepts: 0, totalSavedHours: 0, streakDays: 0 });
    expect(report.events).toEqual([]);
  });

  it('respects hourly rate override', async () => {
    const now = new Date();
    const fetchJson = mockFetchJson({
      events: [
        { eventType: 'challenge_completed', createdAt: now.toISOString(), metadata: { amount: 100 } },
      ],
    });

    const report = await buildGreenReport('30d', { fetchJson, hourlyRateOverride: 50 });

    expect(report.summary.totalSavedHours).toBe(2);
    expect(report.events[0].savedHours).toBe(2);
  });

  it('generates downloadable blob with expected filename', async () => {
    const blob = await exportGreenReportBlob('30d', { fetchJson: mockFetchJson({ events: [] }) });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    const filename = greenReportFilename('30d', 'user_123');
    expect(filename).toMatch(/^symy-green-report-user_123-30d-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
