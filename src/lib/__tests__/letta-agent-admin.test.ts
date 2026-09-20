import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncHourlyRateToAgent } from '../letta-agent-admin';
import {
  getLettaClient,
  getUserAgentId,
  LETTA_API_KEY,
} from '@/lib/letta-agent-manager';

vi.mock('@/lib/letta-agent-manager', () => ({
  getLettaClient: vi.fn(),
  getUserAgentId: vi.fn(() => Promise.resolve('agent-1')),
  readSystemPrompt: vi.fn(() => ''),
  LETTA_API_KEY: 'test-key',
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const updateMock = vi.fn(() => Promise.resolve({}));

function mockHumanBlock(value: string) {
  vi.mocked(getLettaClient).mockReturnValue({
    agents: {
      blocks: {
        retrieve: vi.fn(() => Promise.resolve({ value })),
        update: updateMock,
      },
    },
  } as never);
}

describe('syncHourlyRateToAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expect(LETTA_API_KEY).toBe('test-key');
  });

  it('rejects non-finite and negative rates before Letta calls', async () => {
    mockHumanBlock('');

    await expect(syncHourlyRateToAgent('user-1', Number.NaN)).resolves.toBe(false);
    await expect(syncHourlyRateToAgent('user-1', -1)).resolves.toBe(false);

    expect(getLettaClient).not.toHaveBeenCalled();
    expect(getUserAgentId).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('replaces a rate whose value contains a slash and stays idempotent', async () => {
    mockHumanBlock('Profile\nHourly rate: $25/35 split/hr\nNotes');

    await expect(syncHourlyRateToAgent('user-1', 35)).resolves.toBe(true);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('human', {
      agent_id: 'agent-1',
      value: 'Profile\nHourly rate: $35/hr\nNotes',
    });
  });
});
