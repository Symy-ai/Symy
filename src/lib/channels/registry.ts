import type { ChannelAdapter, PlatformId } from './types';

const adapters = new Map<PlatformId, ChannelAdapter>();

export function registerAdapter(adapter: ChannelAdapter): void {
  if (adapter.capabilities.asyncPush === false) {
    throw new Error(`Channel adapter ${adapter.platform} cannot register: asyncPush must be true`);
  }
  if (adapters.has(adapter.platform)) {
    throw new Error(`Channel adapter already registered for platform: ${adapter.platform}`);
  }
  adapters.set(adapter.platform, adapter);
}

export function getAdapter(platform: string): ChannelAdapter | null {
  return adapters.get(platform as PlatformId) ?? null;
}
