// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MicroChallengeFollowup } from '../micro-challenge-followup';
import {
  _resetMicroChallengeStoreForTest,
  getDueMicroChallenge,
  savePendingMicroChallenge,
} from '../micro-challenge-store';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'chat.microChallenge.followupQuestion': 'Our tiny challenge from yesterday — how did it go?',
        'chat.microChallenge.followupKept': 'I made it',
        'chat.microChallenge.followupSlipped': "Didn't hold",
      })[key] || key,
  }),
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const record = {
  challengeId: 'ch-micro-1',
  category: 'clothing' as const,
  itemName: '24h micro challenge: no new clothes',
  amount: 5,
  dueAt: Date.now() - 60_000, // 已到期
};

describe('MicroChallengeFollowup (次日一次性回访条)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    _resetMicroChallengeStoreForTest();
  });

  afterEach(() => {
    cleanup();
    _resetMicroChallengeStoreForTest();
  });

  it('渲染回访问题与二选一按钮', () => {
    render(<MicroChallengeFollowup record={record} onResolved={vi.fn()} />);
    expect(screen.getByTestId('micro-challenge-followup')).toBeTruthy();
    expect(screen.getByTestId('micro-challenge-followup-kept').textContent).toBe('I made it');
    expect(screen.getByTestId('micro-challenge-followup-slipped').textContent).toBe("Didn't hold");
  });

  it('回访完成: 调 complete 端点 status=passed + 记录消解', () => {
    savePendingMicroChallenge(record);
    const onResolved = vi.fn();
    render(<MicroChallengeFollowup record={record} onResolved={onResolved} />);

    fireEvent.click(screen.getByTestId('micro-challenge-followup-kept'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe('/api/challenge/complete');
    expect(init.method).toBe('POST');
    expect(init.body).toEqual({
      challengeId: 'ch-micro-1',
      status: 'passed',
      itemName: record.itemName,
      amount: record.amount,
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    // 一次性: 记录消解后不再派发
    expect(getDueMicroChallenge()).toBeNull();
  });

  it('回访未守住: status=failed 只更新挑战状态, 记录同样消解', () => {
    savePendingMicroChallenge(record);
    const onResolved = vi.fn();
    render(<MicroChallengeFollowup record={record} onResolved={onResolved} />);

    fireEvent.click(screen.getByTestId('micro-challenge-followup-slipped'));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][1].body.status).toBe('failed');
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(getDueMicroChallenge()).toBeNull();
  });
});
