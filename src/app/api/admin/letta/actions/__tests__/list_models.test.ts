/* eslint-disable require-await -- test mocks use async for API consistency */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_shared', async importOriginal => ({
  ...(await importOriginal<typeof import('../_shared')>()),
  lettaAPI: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleListModels } from '../list_models';
import { lettaAPI, type AdminCtx } from '../_shared';
import { logger } from '@/lib/logger';

const ctx = { body: {}, action: 'list_models' } as unknown as AdminCtx;

function response(ok: boolean, status: number, data?: unknown) {
  return { ok, status, json: async () => data } as never;
}

describe('handleListModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 502 when the base models API fails', async () => {
    vi.mocked(lettaAPI).mockResolvedValueOnce(response(false, 503));

    const result = await handleListModels(ctx);

    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'Letta API error: 503' });
    expect(lettaAPI).toHaveBeenCalledTimes(1);
  });

  it('normalizes a non-array models payload to an empty list', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, { models: [] }))
      .mockResolvedValueOnce(response(true, 200, {}));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.total_models).toBe(0);
    expect(body.model_handles).toEqual([]);
    expect(body.providers).toEqual([]);
  });

  it('exposes model handles and filters custom models case-insensitively', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, [
        { id: 'openai-gpt', name: 'OpenAI' },
        { handle: 'azure-neo', name: 'Azure Neo' },
        { name: 'My_DeepSeek-R1' },
      ]))
      .mockResolvedValueOnce(response(true, 200, []));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(body.total_models).toBe(3);
    expect(body.model_handles).toEqual(['openai-gpt', 'azure-neo', 'My_DeepSeek-R1']);
    expect(body.azure_custom_models).toHaveLength(2);
  });

  it('continues when provider discovery fails', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, []))
      .mockRejectedValueOnce(new Error('provider timeout'));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.providers).toEqual([]);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      '[Admin Letta] Failed to fetch providers:',
      'provider timeout',
    );
  });

  it('records an HTTP error for a failing provider model query', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, []))
      .mockResolvedValueOnce(response(true, 200, [{ id: 'provider-id', name: 'custom' }]))
      .mockResolvedValueOnce(response(false, 404));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(body.provider_models).toEqual({ custom: [{ error: 'HTTP 404' }] });
  });

  it('records a thrown error for a failing provider model query', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, []))
      .mockResolvedValueOnce(response(true, 200, [{ id: 'provider-id', name: 'custom' }]))
      .mockRejectedValueOnce(new Error('model timeout'));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(body.provider_models).toEqual({ custom: [{ error: 'Error: model timeout' }] });
  });

  it('normalizes a single provider model object into an array', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, []))
      .mockResolvedValueOnce(response(true, 200, [{ id: 'provider-id', name: 'custom' }]))
      .mockResolvedValueOnce(response(true, 200, { handle: 'provider-model' }));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(body.provider_models).toEqual({ custom: [{ handle: 'provider-model' }] });
  });

  it('processes multiple providers independently', async () => {
    vi.mocked(lettaAPI)
      .mockResolvedValueOnce(response(true, 200, []))
      .mockResolvedValueOnce(response(true, 200, [
        { id: 'one', name: 'one' },
        { id: 'two', name: 'two' },
      ]))
      .mockResolvedValueOnce(response(true, 200, [{ handle: 'first' }]))
      .mockResolvedValueOnce(response(false, 500));

    const result = await handleListModels(ctx);
    const body = await result.json();

    expect(body.provider_models).toEqual({
      one: [{ handle: 'first' }],
      two: [{ error: 'HTTP 500' }],
    });
    expect(lettaAPI).toHaveBeenNthCalledWith(4, '/providers/two/models');
  });
});
