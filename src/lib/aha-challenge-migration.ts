'use client';

import { apiFetch, ApiError } from '@/lib/api-client';

export const AHA_CHALLENGE_DATA_KEY = 'symy-aha-challenge-migration';
export const AHA_CHALLENGE_RECORDED_KEY = 'symy-aha-challenge-recorded';

export interface StoredAhaChallenge {
  challengeTitle: string;
  challengeDescription?: string;
  passed: boolean;
  amount: number;
  savedAt: string;
}

export function recordAhaChallenge(challenge: Omit<StoredAhaChallenge, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AHA_CHALLENGE_DATA_KEY, JSON.stringify({
      ...challenge,
      amount: Number(challenge.amount),
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Privacy mode: the demo still completes without persistence.
  }
}

function readStoredChallenge(): StoredAhaChallenge | null {
  try {
    const raw = sessionStorage.getItem(AHA_CHALLENGE_DATA_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Partial<StoredAhaChallenge>;
    const amount = Number(value.amount);
    if (
      typeof value.challengeTitle !== 'string' ||
      value.challengeTitle.trim() === '' ||
      typeof value.passed !== 'boolean' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof value.savedAt !== 'string'
    ) return null;
    return {
      challengeTitle: value.challengeTitle,
      challengeDescription: typeof value.challengeDescription === 'string' ? value.challengeDescription : undefined,
      passed: value.passed,
      amount,
      savedAt: value.savedAt,
    };
  } catch {
    // safe to ignore: malformed demo storage is intentionally skipped as non-migratable.
    return null;
  }
}

function isRecorded(userId: string) {
  try {
    return localStorage.getItem(`${AHA_CHALLENGE_RECORDED_KEY}:${userId}`) === 'true';
  } catch {
    // safe to ignore: storage access failure means no trusted pending migration can be read.
    return true;
  }
}

function markRecorded(userId: string) {
  try {
    localStorage.setItem(`${AHA_CHALLENGE_RECORDED_KEY}:${userId}`, 'true');
    sessionStorage.removeItem(AHA_CHALLENGE_DATA_KEY);
  } catch {
    // The created challenge still wins; duplicate defense continues on next session data.
  }
}

export async function migrateAhaChallenge(user: { id: string } | null | undefined): Promise<boolean> {
  if (!user?.id || typeof window === 'undefined') return false;
  if (isRecorded(user.id)) return false;

  const challenge = readStoredChallenge();
  if (!challenge) return false;

  try {
    await apiFetch('/api/challenge/create', {
      method: 'POST',
      body: {
        itemName: challenge.challengeTitle,
        amount: challenge.amount,
      },
    });
    markRecorded(user.id);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      markRecorded(user.id);
      return true;
    }
    return false;
  }
}
