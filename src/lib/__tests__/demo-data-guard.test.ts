import { describe, expect, it } from 'vitest';

import { DEMO_CHAT_MESSAGES } from '../demo-data';

describe('demo data guard', () => {
  it('keeps demo chat copy in the elephant tone', () => {
    const copy = DEMO_CHAT_MESSAGES
      .map(({ content, reasoning }) => [content, reasoning].filter(Boolean).join(' '))
      .join(' ');

    expect(copy).not.toMatch(/mirror|You saw|You already know|The money stays|You know the rest/i);
  });

  it('keeps the guardian and freedom-hour mechanics visible', () => {
    const assistantCopy = DEMO_CHAT_MESSAGES
      .filter(({ role }) => role === 'assistant')
      .map(({ content }) => content)
      .join(' ');

    expect(assistantCopy).toContain('🐘');
    expect(assistantCopy).toContain('$89');
    expect(assistantCopy).toContain('4.5');
  });
});
