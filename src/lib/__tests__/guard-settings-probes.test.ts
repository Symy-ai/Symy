import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGuardProbeCachesForTest,
  loadGuardCoverageProbe,
  loadGuardEvidenceProbe,
  loadGuardPushProbe,
} from '../guard-settings-probes';
import type { GreenRuleCoverageResult } from '../green-rule-coverage';

vi.mock('@/lib/green-alternatives', () => ({
  GREEN_ALTERNATIVES: [],
}));

vi.mock('@/lib/green-rule-coverage', () => ({
  analyzeGreenRuleCoverage: vi.fn(),
}));

const analyzeGreenRuleCoverage = vi.mocked(
  (await import('@/lib/green-rule-coverage')).analyzeGreenRuleCoverage,
);

const fetchMock = vi.fn<((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)>();
const now = new Date('2026-09-20T08:00:00.000Z');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function eventsResponse(events: unknown[] | undefined): Response {
  return jsonResponse({ events });
}

function coverageResult(
  status: GreenRuleCoverageResult['status'],
  categoryGaps: Array<{ key: string; count: number }>,
): GreenRuleCoverageResult {
  return {
    status,
    totalEntries: 20,
    totalEvents: 12,
    matchedEvents: 9,
    coverageRate: 0.75,
    activeDays: 4,
    categoryGaps,
    triggerGaps: [],
    recentEntryIds: [],
    topTriggeredEntryIds: [],
  };
}

function stubWindowOrigin(): void {
  vi.stubGlobal('window', { location: { origin: 'https://settings.example' } });
}

function stubHealthEvents(responses: Record<string, unknown[] | undefined>): void {
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), 'https://settings.example');
    const eventType = url.searchParams.get('event_type') ?? '';
    if (!(eventType in responses)) throw new Error(`unexpected-event-${eventType}`);
    return Promise.resolve(eventsResponse(responses[eventType]));
  });
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

beforeEach(() => {
  _resetGuardProbeCachesForTest();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  stubWindowOrigin();
  vi.stubGlobal('fetch', fetchMock);
  analyzeGreenRuleCoverage.mockReturnValue(coverageResult('healthy', []));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadGuardCoverageProbe', () => {
  it('requests both bounded event sources and maps the conclusion only', async () => {
    stubHealthEvents({
      challenge_completed: [{ metadata: { itemTitle: 'needle' } }],
      manual_adjustment: [{ metadata: { itemTitle: 'paper tissue' } }],
    });
    analyzeGreenRuleCoverage.mockReturnValueOnce(
      coverageResult('partial', [
        { key: 'wear', count: 2 },
        { key: 'food', count: 1 },
      ]),
    );

    await expect(loadGuardCoverageProbe()).resolves.toEqual({
      health: 'partial',
      uncoveredCategories: 2,
    });
    expect(calledUrls()).toEqual([
      'https://settings.example/api/buddy/health-events?event_type=challenge_completed&limit=100',
      'https://settings.example/api/buddy/health-events?event_type=manual_adjustment&limit=100',
    ]);
    expect(analyzeGreenRuleCoverage).toHaveBeenCalledWith([], [
      { metadata: { itemTitle: 'needle' } },
      { metadata: { itemTitle: 'paper tissue' } },
    ]);
  });

  it('maps no-data and zero-gap coverage statuses without event details', async () => {
    stubHealthEvents({
      challenge_completed: [],
      manual_adjustment: undefined,
    });
    analyzeGreenRuleCoverage.mockReturnValueOnce(coverageResult('noData', []));

    await expect(loadGuardCoverageProbe()).resolves.toEqual({
      health: 'noData',
      uncoveredCategories: 0,
    });
  });
});

describe('loadGuardEvidenceProbe', () => {
  it('requests only five events per source and sums their counts', async () => {
    stubHealthEvents({
      challenge_completed: [{}, {}, {}, {}, {}],
      mindful_recovery: [{}],
    });

    await expect(loadGuardEvidenceProbe()).resolves.toEqual({ totalEvents: 6 });
    expect(calledUrls()).toEqual([
      'https://settings.example/api/buddy/health-events?event_type=challenge_completed&limit=5',
      'https://settings.example/api/buddy/health-events?event_type=mindful_recovery&limit=5',
    ]);
  });

  it('maps empty and missing event lists to zero', async () => {
    stubHealthEvents({
      challenge_completed: [],
      mindful_recovery: undefined,
    });

    await expect(loadGuardEvidenceProbe()).resolves.toEqual({ totalEvents: 0 });
  });
});

describe('loadGuardPushProbe', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ preferences: null })),
    );
  });

  it('requests credentials and normalizes a complete custom preference shape', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          preferences: {
            frequency: 'weekly',
            missYou: false,
            dreamFund: true,
            challenge: false,
            weeklyGuardian: true,
          },
        }),
      ),
    );

    await expect(loadGuardPushProbe()).resolves.toEqual({
      frequency: 'weekly',
      channels: {
        missYou: false,
        dreamFund: true,
        challenge: false,
        weeklyGuardian: true,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/push/preferences', {
      credentials: 'include',
    });
  });

  it('falls back to defaults for missing or invalid preferences', async () => {
    await expect(loadGuardPushProbe()).resolves.toEqual({
      frequency: 'daily',
      channels: {
        missYou: true,
        dreamFund: true,
        challenge: true,
        weeklyGuardian: true,
      },
    });
  });
});

describe('guard probe cache lifecycle', () => {
  function primeCaches(): void {
    stubHealthEvents({
      challenge_completed: [],
      manual_adjustment: [],
      mindful_recovery: [],
    });
    fetchMock.mockImplementation((input) => {
      if (String(input) === '/api/push/preferences') {
        return Promise.resolve(jsonResponse({}));
      }
      return Promise.resolve(eventsResponse([]));
    });
  }

  it('deduplicates concurrent in-flight requests', async () => {
    primeCaches();

    const coverage = [loadGuardCoverageProbe(), loadGuardCoverageProbe()];
    const evidence = [loadGuardEvidenceProbe(), loadGuardEvidenceProbe()];
    const push = [loadGuardPushProbe(), loadGuardPushProbe()];

    await expect(Promise.all([...coverage, ...evidence, ...push])).resolves.toHaveLength(6);
    expect(coverage[0]).toBe(coverage[1]);
    expect(evidence[0]).toBe(evidence[1]);
    expect(push[0]).toBe(push[1]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('uses cache before the TTL boundary and refreshes at exactly 60 seconds', async () => {
    primeCaches();
    await Promise.all([loadGuardCoverageProbe(), loadGuardEvidenceProbe(), loadGuardPushProbe()]);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    vi.advanceTimersByTime(59_999);
    await Promise.all([loadGuardCoverageProbe(), loadGuardEvidenceProbe(), loadGuardPushProbe()]);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    vi.advanceTimersByTime(1);
    await Promise.all([loadGuardCoverageProbe(), loadGuardEvidenceProbe(), loadGuardPushProbe()]);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('force refresh bypasses a fresh cache', async () => {
    primeCaches();
    await Promise.all([loadGuardCoverageProbe(), loadGuardEvidenceProbe(), loadGuardPushProbe()]);

    await Promise.all([
      loadGuardCoverageProbe(true),
      loadGuardEvidenceProbe(true),
      loadGuardPushProbe(true),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('does not cache failures and clears in-flight state for a light retry', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({}, 503)));

    await expect(loadGuardCoverageProbe()).rejects.toThrow('guard-probe-challenge_completed-failed');
    await expect(loadGuardEvidenceProbe()).rejects.toThrow('guard-probe-challenge_completed-failed');
    await expect(loadGuardPushProbe()).rejects.toThrow('guard-probe-push-preferences-failed');

    primeCaches();
    await expect(Promise.all([
      loadGuardCoverageProbe(),
      loadGuardEvidenceProbe(),
      loadGuardPushProbe(),
    ])).resolves.toHaveLength(3);
  });

  it('reset clears every probe cache', async () => {
    primeCaches();
    await Promise.all([loadGuardCoverageProbe(), loadGuardEvidenceProbe(), loadGuardPushProbe()]);
    _resetGuardProbeCachesForTest();

    await Promise.all([loadGuardCoverageProbe(), loadGuardEvidenceProbe(), loadGuardPushProbe()]);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
