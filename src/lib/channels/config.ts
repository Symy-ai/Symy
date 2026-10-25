import type { PlatformId } from './types';

const DEFAULT_GLOBAL_BUDGET = 2000;

export function channelsEnabled(platform: PlatformId): boolean {
  const enabled = process.env.CHANNELS_ENABLED?.split(',').map((item) => item.trim().toLowerCase()) ?? [];
  return enabled.includes(platform);
}

export function channelGlobalBudget(): number {
  const budget = Number(process.env.CHANNEL_GLOBAL_DAILY_BUDGET);
  if (!Number.isSafeInteger(budget) || budget <= 0) return DEFAULT_GLOBAL_BUDGET;
  return budget;
}
