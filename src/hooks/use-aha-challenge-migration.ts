'use client';

import { useEffect } from 'react';
import { migrateAhaChallenge } from '@/lib/aha-challenge-migration';
import { showToast } from '@/lib/toast';

export { recordAhaChallenge } from '@/lib/aha-challenge-migration';

export function useAhaChallengeMigration(user: { id: string } | null | undefined, t: (key: string, options?: { defaultValue?: string }) => string) {
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void migrateAhaChallenge(user).then((migrated) => {
      if (migrated && !cancelled) {
        showToast(
          t('ahaMoment.migratedToast', { defaultValue: 'Your first guard challenge is ready 🛡️' }),
          'success',
          1500,
        );
      }
    });
    return () => { cancelled = true; };
  }, [user, t]);
}
