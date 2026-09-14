import { describe, expect, it } from 'vitest';
import { renderGuardProfileExport } from '../guard-profile-export';

describe('renderGuardProfileExport', () => {
  it('renders six ordered sections for the private full archive', () => {
    const result = renderGuardProfileExport({
      locale: 'zh',
      exportedAt: '2026-03-02T08:00:00Z',
      username: 'Spark',
      rankName: '🌱 守护新芽',
      totalIntercepts: 12,
      longestStreakDays: 7,
      unlockedBadges: 3,
      freedomHours: 11,
      months: [
        { monthKey: '2026-02', intercepts: 4 },
        { monthKey: '2026-03', intercepts: 8 },
      ],
      topCategories: [
        { name: 'food', count: 6 },
        { name: 'clothing', count: 4 },
      ],
      greenAdoptionRate: 0.667,
      moments: [{ eventType: 'challenge_completed', occurredAt: '2026-03-01T10:00:00Z', freedomHours: 2.4 }],
      summaryCount: 12,
      summaryHours: 11,
    });

    expect(result.sections.map((section) => section.id)).toEqual([
      'cover', 'overview', 'heatmap', 'insights', 'moments', 'summary',
    ]);
    expect(result.sections[0].lines).toContain('Spark');
    expect(result.sections[1].lines.join('\n')).toContain('11 小时');
    expect(result.sections[2].lines).toContain('最高单月：8 次');
    expect(result.sections[3].lines).toContain('高频品类 Top 3: food × 6 · clothing × 4');
    expect(result.sections[5].lines[0]).toContain('守护了 12 次');
    expect(JSON.stringify(result)).not.toMatch(/[$¥£€]|\d+\s*(元|美元)/);
  });
});
