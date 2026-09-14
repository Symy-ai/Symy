/**
 * invitation-reward Tests — Referral reward (方案 D: 阶梯叠加)
 *
 * Covers:
 * - processInvitationReward happy path (both parties get 30 days Premium)
 * - Referrer reward failure → audit record written to health_events
 * - InvitationRewardResult.referrerRewardFailed flag
 * - No pending invitation → noAward
 * - Milestone badge trigger + buddy_state update
 * - Count query error → base 30 days + audit
 * - Profile select errors (referee / referrer) → audit, no silent now() fallback
 * - Badge failure audit
 *
 * Mock call sequence (verified via debug trace):
 *   1: invitations (SELECT pending)
 *   2: invitations (CAS UPDATE → completed)
 *   3: invitations (SELECT daily limit count)
 *   4: profiles   (SELECT referee trial_until)
 *   5: profiles   (UPDATE referee trial_until)
 *   6: invitations (SELECT referrer completed count — milestone calc)
 *   7: profiles   (SELECT referrer trial_until)
 *   8: profiles   (UPDATE referrer trial_until)
 *   9: buddy_state (SELECT badges — only if completedCount >= 10)
 *   10: buddy_state (UPDATE badges — only if badge not already present)
 *
 * Mocks: supabase-admin (profiles select/update, invitations, health_events, buddy_state)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase-admin
const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: mockSupabaseFrom,
    },
    error: null,
  })),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processInvitationReward } from '@/lib/invitation-reward';

describe('processInvitationReward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns noAward when no pending invitation exists', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(false);
    expect(result.refereePremiumDaysAwarded).toBe(0);
  });

  it('returns awarded=true when both referee and referrer rewards succeed', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count (milestone calc)
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 7=referrer select, 8=referrer update
      if (table === 'profiles') {
        if (callCount === 4 || callCount === 7) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        // 5 & 8: update — returns { error: null }
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      // buddy_state: only reached if completedCount >= 10 (not in this test, count=1)
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { badges: [] }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      // health_events insert — success
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.refereePremiumDaysAwarded).toBe(30);
    expect(result.referrerPremiumDaysAwarded).toBe(30);
    expect(result.referrerRewardFailed).toBe(false);
    expect(result.badgeAwarded).toBe(false);
  });

  it('writes health_events audit record when referrer reward fails', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    let healthEventsPayload: any = null;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 7=referrer select, 8=referrer update (FAILS)
      if (table === 'profiles') {
        if (callCount === 4 || callCount === 7) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        if (callCount === 5) {
          // referee update succeeds
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }
        if (callCount === 8) {
          // referrer update FAILS
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: { message: 'RLS policy violation' } }),
            })),
          };
        }
      }
      if (table === 'health_events') {
        return {
          insert: vi.fn((payload: any) => {
            healthEventsPayload = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.referrerRewardFailed).toBe(true);
    expect(result.referrerPremiumDaysAwarded).toBe(0);

    // Verify health_events audit record
    expect(healthEventsPayload).not.toBeNull();
    expect(healthEventsPayload.event_type).toBe('invitation_reward_failed');
    expect(healthEventsPayload.trigger_source).toBe('invitation_reward_retry');
    expect(healthEventsPayload.user_id).toBe('referrer-456');
    expect(healthEventsPayload.token_change).toBe(0);
    expect(healthEventsPayload.metadata.referee_user_id).toBe('referee-123');
    expect(healthEventsPayload.metadata.invitation_id).toBe('inv-123');
    expect(healthEventsPayload.metadata.premium_days_pending).toBe(30);
  });

  // 🔧 ARCH fix: count query error must not overflow delta (N=null → 60 days)
  it.each([
    { count: 1, expectedDays: 30 },
    { count: 4, expectedDays: 30 },
    { count: 5, expectedDays: 60 },
    { count: 9, expectedDays: 30 },
    { count: 10, expectedDays: 60 },
    { count: 11, expectedDays: 30 },
    { count: 15, expectedDays: 60 },
    { count: 20, expectedDays: 60 },
  ])('returns $expectedDays days for referrer completedCount=$count', async ({ count, expectedDays }) => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count (milestone calc)
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count, error: null }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 7=referrer select, 8=referrer update
      if (table === 'profiles') {
        if (callCount === 4 || callCount === 7) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      // buddy_state: only reached if completedCount >= 10
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { badges: [] }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.referrerPremiumDaysAwarded).toBe(expectedDays);
  });

  // 🔧 ARCH fix: count query error must not overflow delta
  it('writes audit and limits delta to 30 days when referrer completed count query fails', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    let healthEventsPayload: any = null;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count — ERROR
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'connection error' } }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 8=referrer select, 9=referrer update
      // (7 is health_events insert from count error audit)
      if (table === 'profiles') {
        if (callCount === 4) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        if (callCount === 5) {
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }
        if (callCount === 8) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        if (callCount === 9) {
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }
      }
      if (table === 'health_events') {
        return {
          insert: vi.fn((payload: any) => {
            healthEventsPayload = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.referrerRewardFailed).toBe(true);
    // When count query fails we fall back to base 30d, but referrerRewardFailed=true
    // means the caller sees the reward as failed; actual days are not granted.
    expect(result.referrerPremiumDaysAwarded).toBe(0);
    expect(result.badgeAwarded).toBe(false);

    // Verify health_events audit record for count failure
    expect(healthEventsPayload).not.toBeNull();
    expect(healthEventsPayload.event_type).toBe('invitation_reward_failed');
    expect(healthEventsPayload.user_id).toBe('referrer-456');
    expect(healthEventsPayload.metadata.failure_reason).toBe('connection error');
    expect(healthEventsPayload.metadata.premium_days_pending).toBe(30);
  });

  // 🔧 ARCH fix: referee profile select error must not silently fall back to now()
  it('writes audit and returns noAward when referee profile select fails', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    let healthEventsPayload: any = null;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 4: profiles SELECT referee — ERROR
      if (table === 'profiles' && callCount === 4) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
            })),
          })),
        };
      }
      if (table === 'health_events') {
        return {
          insert: vi.fn((payload: any) => {
            healthEventsPayload = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(false);

    // Verify health_events audit record for referee profile failure
    expect(healthEventsPayload).not.toBeNull();
    expect(healthEventsPayload.event_type).toBe('invitation_reward_failed');
    expect(healthEventsPayload.user_id).toBe('referee-123');
    expect(healthEventsPayload.metadata.role).toBe('referee');
    expect(healthEventsPayload.metadata.failure_reason).toBe('timeout');
  });

  // 🔧 ARCH fix: referrer profile select error must not silently fall back to now()
  it('writes audit and marks referrer failed when referrer profile select fails', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    let healthEventsPayload: any = null;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            })),
          })),
        };
      }
      // 7: profiles SELECT referrer — ERROR
      if (table === 'profiles' && callCount === 7) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
            })),
          })),
        };
      }
      // 4: referee profile select, 5: referee update
      if (table === 'profiles' && callCount === 4) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
            })),
          })),
        };
      }
      if (table === 'profiles' && callCount === 5) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      if (table === 'health_events') {
        return {
          insert: vi.fn((payload: any) => {
            healthEventsPayload = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.refereePremiumDaysAwarded).toBe(30);
    expect(result.referrerRewardFailed).toBe(true);
    expect(result.referrerPremiumDaysAwarded).toBe(0);

    // Verify health_events audit record for referrer profile failure
    expect(healthEventsPayload).not.toBeNull();
    expect(healthEventsPayload.event_type).toBe('invitation_reward_failed');
    expect(healthEventsPayload.user_id).toBe('referrer-456');
    expect(healthEventsPayload.metadata.role).toBe('referrer');
    expect(healthEventsPayload.metadata.failure_reason).toBe('timeout');
  });

  // 🔧 ARCH fix: badge failure must write audit
  it('writes health_events audit when milestone badge award fails', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    let healthEventsPayload: any = null;
    let buddyStateUpdatePayload: any = null;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count — 10 (triggers badge)
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 10, error: null }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 7=referrer select, 8=referrer update
      if (table === 'profiles') {
        if (callCount === 4 || callCount === 7) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      // 9: buddy_state SELECT badges — throws error
      if (table === 'buddy_state' && callCount === 9) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockRejectedValue(new Error('buddy_state timeout')),
            })),
          })),
          update: vi.fn((payload: any) => {
            buddyStateUpdatePayload = payload;
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        };
      }
      if (table === 'health_events') {
        return {
          insert: vi.fn((payload: any) => {
            healthEventsPayload = payload;
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.badgeAwarded).toBe(false);
    expect(result.referrerPremiumDaysAwarded).toBe(60);

    // Verify health_events audit record for badge failure
    expect(healthEventsPayload).not.toBeNull();
    expect(healthEventsPayload.event_type).toBe('invitation_reward_failed');
    expect(healthEventsPayload.user_id).toBe('referrer-456');
    expect(healthEventsPayload.metadata.badge_pending).toBe('referral_master');
    expect(healthEventsPayload.metadata.failure_reason).toBe('buddy_state timeout');
  });

  // 🔧 ARCH fix: N=9 must NOT trigger badge or buddy_state update
  it('does not award badge when completedCount=9', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count — 9 (no badge)
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 9, error: null }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 7=referrer select, 8=referrer update
      if (table === 'profiles') {
        if (callCount === 4 || callCount === 7) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      // buddy_state should NOT be reached
      if (table === 'buddy_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { badges: [] }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    expect(result.awarded).toBe(true);
    expect(result.badgeAwarded).toBe(false);
    expect(result.referrerPremiumDaysAwarded).toBe(30);
  });

  // 🔧 ARCH fix: N=10 must trigger badge and update buddy_state
  it('awards badge and updates buddy_state when completedCount=10', async () => {
    const mockInvitation = {
      id: 'inv-123',
      referrer_user_id: 'referrer-456',
      referee_user_id: 'referee-123',
      status: 'pending',
    };

    let callCount = 0;
    let buddyStateUpdatePayload: any = null;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      // 1: invitations SELECT pending invitation
      if (table === 'invitations' && callCount === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockInvitation, error: null }),
              })),
            })),
          })),
        };
      }
      // 2: invitations CAS UPDATE status='completed'
      if (table === 'invitations' && callCount === 2) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'inv-123', status: 'completed', referrer_user_id: 'referrer-456' },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      // 3: invitations SELECT count for daily limit
      if (table === 'invitations' && callCount === 3) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          })),
        };
      }
      // 6: invitations SELECT referrer completed count — 10 (triggers badge)
      if (table === 'invitations' && callCount === 6) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ count: 10, error: null }),
            })),
          })),
        };
      }
      // profiles: 4=referee select, 5=referee update, 7=referrer select, 8=referrer update
      if (table === 'profiles') {
        if (callCount === 4 || callCount === 7) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { trial_until: null }, error: null }),
              })),
            })),
          };
        }
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      // 9: buddy_state SELECT badges
      if (table === 'buddy_state' && callCount === 9) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { badges: [] }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn((payload: any) => {
              buddyStateUpdatePayload = payload;
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      // 10: second buddy_state call for UPDATE (after SELECT returned empty badges)
      if (table === 'buddy_state' && callCount === 10) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { badges: [] }, error: null }),
            })),
          })),
          update: vi.fn((payload: any) => {
            buddyStateUpdatePayload = payload;
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const result = await processInvitationReward('referee-123');
    console.log('BUDDY PAYLOAD:', JSON.stringify(buddyStateUpdatePayload));
    expect(result.awarded).toBe(true);
    expect(result.badgeAwarded).toBe(true);
    expect(result.referrerPremiumDaysAwarded).toBe(60);

    // Verify buddy_state was updated with the badge
    expect(buddyStateUpdatePayload).not.toBeNull();
    expect(buddyStateUpdatePayload.badges).toEqual(['referral_master']);
  });
});
