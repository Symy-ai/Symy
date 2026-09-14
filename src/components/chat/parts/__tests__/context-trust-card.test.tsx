// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContextTrustCard } from '../context-trust-card';
import type { TrustEvidence } from '@/lib/context-trust';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string) => ({
      'chat.contextTrust.title': 'Why Symy brought this up',
      'chat.contextTrust.minimal': 'Based only on what you said in this conversation.',
      'chat.contextTrust.whyNow': 'Why now:',
      'chat.contextTrust.time': 'Time basis',
      'chat.contextTrust.facts': 'What I know',
      'chat.contextTrust.history': 'Patterns',
      'chat.contextTrust.conflicts': 'Needs your judgment',
      'chat.contextTrust.inferred': 'inferred',
      'chat.contextTrust.stale': 'may be outdated',
      'chat.contextTrust.notQuite': 'Not quite right?',
      'chat.contextTrust.correction.not_me': "This isn't me",
      'chat.contextTrust.correction.expired': 'It expired',
      'chat.contextTrust.correction.different_context': 'Different context',
      'chat.contextTrust.ack.not_me': 'Got it',
      'chat.contextTrust.ack.expired': 'Set aside',
      'chat.contextTrust.ack.different_context': 'Context changed',
    })[key] ?? key,
  }),
}));

vi.mock('../context-trust-correction', () => ({
  readTrustCorrections: () => [],
  reportTrustCorrection: vi.fn(() => Promise.resolve()),
}));

const minimal: TrustEvidence = {
  signals: [{ id: 'signal', zh: '奖励自己', en: 'reward myself' }],
  time: [{ source: 'conversation', zh: '当前话语', en: 'current message' }],
  facts: [], history: [], conflicts: [], minimal: true,
};

const full: TrustEvidence = {
  ...minimal,
  minimal: false,
  facts: [{ source: 'fact', zh: '尺码：42', en: 'Size: 42', stale: true }],
  history: [{ source: 'inference', zh: '推测', en: 'possible pattern', inferred: true }],
  conflicts: [],
};

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe('ContextTrustCard', () => {
  it('renders the evidence layers and inference labels', () => {
    render(<ContextTrustCard evidence={full} />);
    expect(screen.getByText(/Size: 42 · may be outdated/)).toBeTruthy();
    expect(screen.getByText(/possible pattern · inferred/)).toBeTruthy();
  });

  it('degrades to one current-conversation line when data is insufficient', () => {
    render(<ContextTrustCard evidence={minimal} />);
    expect(screen.getByTestId('context-trust-minimal').textContent).toContain('this conversation');
    expect(screen.queryByTestId('context-trust-details')).toBeNull();
  });

  it('supports all three same-level correction entries', () => {
    render(<ContextTrustCard evidence={minimal} />);
    for (const kind of ['not_me', 'expired', 'different_context']) {
      expect(screen.getByTestId(`context-trust-correct-${kind}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId('context-trust-correct-different_context'));
    expect(screen.getByTestId('context-trust-corrected').textContent).toContain('Context changed');
    expect(screen.queryByTestId('context-trust-corrections')).toBeNull();
  });
});
