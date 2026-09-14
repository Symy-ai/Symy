import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateAhaChallenge, recordAhaChallenge } from '../aha-challenge-migration';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
class StorageStub {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
Object.defineProperty(globalThis, 'sessionStorage', { value: new StorageStub(), configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: new StorageStub(), configurable: true });
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('aha challenge migration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('records the demo result without inventing savings', () => {
    recordAhaChallenge({ challengeTitle: 'Nike Air Max', passed: false, amount: 159 });

    const raw = sessionStorage.getItem('symy-aha-challenge-migration');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({
      challengeTitle: 'Nike Air Max',
      passed: false,
      amount: 159,
    });
  });

  it('creates an equivalent challenge and records success once', async () => {
    sessionStorage.setItem('symy-aha-challenge-migration', JSON.stringify({
      challengeTitle: 'Nike Air Max',
      passed: true,
      amount: 159,
      savedAt: '2026-09-06T00:00:00.000Z',
    }));
    mockFetch.mockResolvedValue(jsonResponse({ challengeId: 'challenge-1' }));

    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/challenge/create', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ itemName: 'Nike Air Max', amount: 159 }),
    }));
    expect(localStorage.getItem('symy-aha-challenge-recorded:user-1')).toBe('true');

    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('treats 409 as already migrated', async () => {
    sessionStorage.setItem('symy-aha-challenge-migration', JSON.stringify({
      challengeTitle: 'Coffee machine',
      passed: false,
      amount: 89,
      savedAt: '2026-09-06T00:00:00.000Z',
    }));
    mockFetch.mockResolvedValue(jsonResponse({ error: 'already exists' }, 409));

    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(true);
    expect(localStorage.getItem('symy-aha-challenge-recorded:user-1')).toBe('true');
  });

  it('keeps pending data and retries transient failures', async () => {
    sessionStorage.setItem('symy-aha-challenge-migration', JSON.stringify({
      challengeTitle: 'Coffee machine',
      passed: true,
      amount: 89,
      savedAt: '2026-09-06T00:00:00.000Z',
    }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'failed' }, 500));

    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(false);
    expect(sessionStorage.getItem('symy-aha-challenge-migration')).toBeTruthy();

    mockFetch.mockResolvedValueOnce(jsonResponse({ challengeId: 'challenge-2' }));
    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(true);
  });

  it('silently skips no data, invalid data, and legacy-only flags', async () => {
    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();

    sessionStorage.setItem('symy-aha-challenge-completed', 'true');
    sessionStorage.setItem('symy-aha-challenge-amount', '159');
    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('symy-aha-challenge-completed')).toBe('true');

    sessionStorage.setItem('symy-aha-challenge-migration', '{bad json');
    await expect(migrateAhaChallenge({ id: 'user-1' })).resolves.toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
