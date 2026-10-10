// push/vapid-public-key route (29行) — VAPID 公钥下发 (公开, 无鉴权)。
// 锁定: 公钥透传 200 / 未配置 → 503。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
  getVapidPublicKey: vi.fn(),
}));

vi.mock('@/lib/push/web-push-config', () => ({ getVapidPublicKey: M.getVapidPublicKey }));

import { GET } from '../route';

describe('GET /api/push/vapid-public-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已配置 → 200 + publicKey 透传', async () => {
    M.getVapidPublicKey.mockReturnValue('BEl62iUYgUivx9uFWNTVpA0zQ6pWc0Y-fkPtbWw8LJVK8fHSMhNsZ-XmLq4pOwLBW0GXvpGZxqN9yRbEXDZwVwk');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publicKey).toBe('BEl62iUYgUivx9uFWNTVpA0zQ6pWc0Y-fkPtbWw8LJVK8fHSMhNsZ-XmLq4pOwLBW0GXvpGZxqN9yRbEXDZwVwk');
  });

  it('未配置 → 503 (Push notifications not configured)', async () => {
    M.getVapidPublicKey.mockReturnValue(undefined);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Push notifications not configured');
  });
});
