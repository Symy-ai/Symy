// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ShoppingClarifyCard } from '../shopping-clarify-card';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (key: string) => ({
    'chat.shoppingClarify.title': 'One quick check',
    'chat.shoppingClarify.recipient.question': 'For her or a gift?',
    'chat.shoppingClarify.answers.forHer': 'For her',
    'chat.shoppingClarify.answers.gift': 'A gift',
    'chat.shoppingClarify.answers.skip': 'Skip',
  })[key] || key }),
}));

describe('ShoppingClarifyCard', () => {
  afterEach(cleanup);

  it('renders the question, answer chips, and skip chip', () => {
    render(<ShoppingClarifyCard data={{ subject: 'mom', slot: 'recipient', answers: [
      { token: '[symy-clarify:for-her]', key: 'forHer' },
      { token: '[symy-clarify:gift]', key: 'gift' },
    ] }} />);
    expect(screen.getByTestId('shopping-clarify-card')).toBeTruthy();
    expect(screen.getByText('For her or a gift?')).toBeTruthy();
    expect(screen.getByText('For her')).toBeTruthy();
    expect(screen.getByText('A gift')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('submits a stable machine-readable token as a normal turn', () => {
    const onSendMessage = vi.fn();
    render(<ShoppingClarifyCard onSendMessage={onSendMessage} data={{ subject: 'mom', slot: 'recipient', answers: [
      { token: '[symy-clarify:for-her]', key: 'forHer' },
    ] }} />);
    fireEvent.click(screen.getByText('For her'));
    expect(onSendMessage).toHaveBeenCalledWith(expect.stringMatching(/^\[symy-clarify:for-her\] /));
  });
});
