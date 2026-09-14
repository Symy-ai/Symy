// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuardEvidenceSection } from '../guard-evidence-section';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'profile.guardEvidence.countDays') return `${params?.count} rows / ${params?.days} days`;
      if (key === 'profile.guardEvidence.explainHours') return 'Explain this number';
      if (key === 'profile.guardEvidence.hoursFormula') return `window ${params?.window}, timezone ${params?.timezone}`;
      if (key === 'profile.guardEvidence.sources.resetAudit') return 'Reset audit';
      if (key === 'profile.guardEvidence.sources.autoChallenge') return 'Automatic challenge';
      return key;
    },
  }),
}));

describe('GuardEvidenceSection', () => {
  it('renders the stable insufficient state', () => {
    render(<GuardEvidenceSection events={null} />);
    expect(screen.getByTestId('guard-evidence-empty')).toBeTruthy();
  });

  it('renders source summary, latest rows, exclusions, and explanation without money', () => {
    render(
      <GuardEvidenceSection
        events={[
          { id: '1', eventType: 'challenge_completed', triggerId: 'a', createdAt: '2026-09-01T01:02:00Z', metadata: { itemTitle: 'Blue shoes' } },
          { id: '2', eventType: 'manual_adjustment', createdAt: '2026-09-02T01:02:00Z', metadata: { source: 'data_reset' }, description: 'guard data reset' },
        ]
        }
      />,
    );
    expect(screen.getByTestId('guard-evidence-summary').textContent).toContain('1 rows / 1 days');
    expect(screen.getByTestId('guard-evidence-rows').textContent).toContain('Reset audit');
    expect(screen.getByTestId('guard-evidence-rows').textContent).toContain('profile.guardEvidence.excluded');
    expect(screen.getByTestId('guard-evidence-explain').textContent).toContain('timezone');
  });
});
