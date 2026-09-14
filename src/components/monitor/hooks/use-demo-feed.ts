'use client';

import { useCallback, useState } from 'react';
import {
  GUARDIAN_STORY_INTERVAL,
  generateGuardianStoryNotification,
  generateRandomNotification,
  type TikTokShopNotification,
} from '@/lib/demo-data';

export function useDemoFeed() {
  const [notifications, setNotifications] = useState<TikTokShopNotification[]>([]);
  const [tick, setTick] = useState(0);

  const addDemoNotification = useCallback(() => {
    const nextIndex = tick + 1;
    const notif = nextIndex % GUARDIAN_STORY_INTERVAL === 0
      ? generateGuardianStoryNotification()
      : generateRandomNotification();
    setTick(nextIndex);
    setNotifications((prev) => [notif, ...prev].slice(0, 50));
    return notif;
  }, [tick]);

  return { notifications, addDemoNotification };
}
