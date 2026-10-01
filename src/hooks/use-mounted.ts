'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

export const useMounted = (): boolean =>
  useSyncExternalStore(subscribe, () => true, () => false);
