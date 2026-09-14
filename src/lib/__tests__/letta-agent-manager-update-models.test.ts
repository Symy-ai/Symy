/**
 * Regression tests for updateAllUserAgentModels — `this` context loss bug
 *
 * 🔧 BUGFIX (2026-07-21): updateAllUserAgentModels had a bug where
 *   `const updateFn = client.agents.update as ...; await updateFn(...)`
 *   detached the method from its object, losing `this` context.
 *   The SDK's update method uses `this._client.patch(...)`, so `this` being
 *   undefined caused TypeError: Cannot read properties of undefined (reading '_client').
 *   This made ALL batch updates fail silently (0/N updated, N failed).
 *
 * These tests verify:
 * 1. updateAllUserAgentModels actually updates all agents (not 0/N)
 * 2. The SDK's update method is called with correct args
 * 3. The `this` context is preserved (update succeeds, not throws TypeError)
 * 4. Failed updates are counted but don't stop the batch
 * 5. Empty profile list returns 0/0/0
 *
 * 🔑 KEY DESIGN: The mock uses a REAL class with `this._client` dependency
 *   (not vi.fn() wrapper). If someone reintroduces the bug
 *   (`const fn = client.agents.update; fn(...)`), `this` is lost and
 *   `this._client` throws TypeError → all updates fail → test catches it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Real class-based mock that depends on `this` ───────────────────
// This simulates the real Letta SDK structure where `update` uses `this._client`.
// We do NOT wrap `update` in vi.fn() — that would break the `this` dependency.
// Instead, we track calls via the underlying `patch` method.

const patchCalls: Array<{ path: string; body: unknown }> = [];

class FakePatchClient {
  patch(path: string, opts: { body?: unknown }) {
    patchCalls.push({ path, body: opts.body });
    return Promise.resolve({ ok: true, path, body: opts.body });
  }
}

class FakeAgents {
  _client: FakePatchClient;

  constructor() {
    this._client = new FakePatchClient();
  }

  // 🔑 This method uses `this._client` — if detached to variable, throws TypeError
  update(agentId: string, body: { model?: string }) {
    return this._client.patch(`/v1/agents/${agentId}`, { body });
  }

  tools = {
    attach: (toolId: string, params: { agent_id: string }) => {
      return this._client.patch(`/attach/${toolId}`, { body: params });
    },
  };
}

class FakeLettaClient {
  agents: FakeAgents;

  constructor() {
    this.agents = new FakeAgents();
  }
}

const fakeLettaClient = new FakeLettaClient();

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({
    supabase: {
      from: mockFrom,
    },
  })),
}));

vi.mock('@/lib/letta-mcp-manager', () => ({
  getLettaClient: vi.fn(() => fakeLettaClient),
  getOrCreateSharedMCPServer: vi.fn(() => Promise.resolve('mcp-server-id')),
  getMCPTools: vi.fn(() => Promise.resolve([])),
  lettaAPI: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import after mocks ─────────────────────────────────────────────
import { updateAllUserAgentModels } from '@/lib/letta-agent-admin';

// ── Helper ─────────────────────────────────────────────────────────
function setupProfiles(count: number) {
  const profiles = Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    letta_agent_id: `agent-${i}`,
  }));

  mockFrom.mockReturnValue({
    select: vi.fn(() => ({
      not: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({ data: profiles, error: null })),
      })),
    })),
  });

  return profiles;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('updateAllUserAgentModels — this context regression (2026-07-21)', () => {
  beforeEach(() => {
    patchCalls.length = 0;
  });

  it('updates ALL agents (not 0/N) — regression for this-context-loss bug', async () => {
    // 🔧 Old bug: `const updateFn = client.agents.update as ...; await updateFn(...)`
    //   lost `this` context → TypeError → all updates failed → 0/8 updated, 8 failed
    //   Fix: call `client.agents.update(...)` directly
    setupProfiles(8);

    const result = await updateAllUserAgentModels('letta/auto');

    expect(result.total).toBe(8);
    expect(result.updated).toBe(8); // ← KEY: all 8 succeed (old bug: 0/8)
    expect(result.failed).toBe(0);
  });

  it('calls client.agents.update with correct agent_id and model', async () => {
    setupProfiles(3);

    await updateAllUserAgentModels('letta/auto');

    // Verify via patchCalls (the underlying HTTP call)
    expect(patchCalls).toHaveLength(3);
    expect(patchCalls[0]).toEqual({
      path: '/v1/agents/agent-0',
      body: { model: 'letta/auto' },
    });
    expect(patchCalls[1]).toEqual({
      path: '/v1/agents/agent-1',
      body: { model: 'letta/auto' },
    });
    expect(patchCalls[2]).toEqual({
      path: '/v1/agents/agent-2',
      body: { model: 'letta/auto' },
    });
  });

  it('preserves `this` context — update does not throw TypeError', async () => {
    // The FakeAgents.update method uses `this._client.patch(...)`.
    // If `this` is lost (method detached to variable), `this._client` throws.
    // This test verifies the fix preserves `this`.
    setupProfiles(5);

    const result = await updateAllUserAgentModels('letta/auto');

    // If `this` was lost, all 5 would fail with TypeError → result.failed === 5
    expect(result.failed).toBe(0);
    expect(result.updated).toBe(5);
  });

  it('counts failed updates but does not stop the batch', async () => {
    setupProfiles(4);

    // Temporarily make the 2nd agent's update fail by overriding update
    // Save the original prototype method (not a bound copy) so we can restore it
    const agentsInstance = fakeLettaClient.agents;
    const originalUpdate = FakeAgents.prototype.update;
    let callCount = 0;
    // Override on the INSTANCE (not prototype) so other tests aren't affected
    agentsInstance.update = function (agentId: string, body: { model?: string }) {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error('Letta API 500: agent not found'));
      }
      // Call the prototype method with correct `this`
      return originalUpdate.call(this, agentId, body);
    };

    try {
      const result = await updateAllUserAgentModels('letta/auto');

      expect(result.total).toBe(4);
      expect(result.updated).toBe(3);
      expect(result.failed).toBe(1);
    } finally {
      // Restore: delete the instance property so prototype method shows through
      delete (agentsInstance as { update?: unknown }).update;
    }
  });

  it('returns 0/0/0 when no profiles have agents', async () => {
    setupProfiles(0);

    const result = await updateAllUserAgentModels('letta/auto');

    expect(result).toEqual({ updated: 0, failed: 0, total: 0 });
  });

  it('does NOT set truncated flag when under the 500-agent limit', async () => {
    setupProfiles(10);

    const result = await updateAllUserAgentModels('letta/auto');

    expect(result.truncated).toBeUndefined();
    expect(result.total).toBe(10);
  });

  it('sets truncated=true when hitting the 500-agent limit (silent data loss prevention)', async () => {
    // 🔧 TECH DEBT FIX (2026-07-21): Verify the truncated flag is set
    //   when the 500-agent limit is hit. This prevents silent data loss.
    setupProfiles(500);

    const result = await updateAllUserAgentModels('letta/auto');

    expect(result.truncated).toBe(true);
    expect(result.total).toBe(500);
    expect(result.updated).toBe(500);
  });

  it('works with different model handles', async () => {
    setupProfiles(2);

    await updateAllUserAgentModels('openai-proxy/glm-5.2');

    expect(patchCalls[0]).toEqual({
      path: '/v1/agents/agent-0',
      body: { model: 'openai-proxy/glm-5.2' },
    });
    expect(patchCalls[1]).toEqual({
      path: '/v1/agents/agent-1',
      body: { model: 'openai-proxy/glm-5.2' },
    });
  });
});

describe('updateAllUserAgentModels — canary: mock catches this-loss', () => {
  it('CANARY: detached method reference throws TypeError (proves the mock catches the bug)', async () => {
    // This test verifies that our mock correctly simulates the `this`-loss bug.
    // If someone reintroduces `const fn = client.agents.update; fn(...)` in the
    // source code, the "updates ALL agents" test above will fail (0/N updated)
    // because the detached call throws TypeError.

    // Use a FRESH instance to avoid interference from other tests
    const freshAgents = new FakeAgents();

    // Simulate the BUG pattern: assign method to variable, then call
    const buggyFn = freshAgents.update as unknown as (
      agentId: string,
      body: { model?: string },
    ) => Promise<unknown>;

    let threw = false;
    let errorMsg = '';
    try {
      await buggyFn('agent-canary', { model: 'letta/auto' });
    } catch (err) {
      threw = true;
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // The detached call SHOULD throw TypeError about `_client`
    expect(threw).toBe(true);
    expect(errorMsg).toContain('_client');

    // Now verify the CORRECT pattern works (direct method call)
    patchCalls.length = 0;
    await freshAgents.update('agent-canary', { model: 'letta/auto' });
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]).toEqual({
      path: '/v1/agents/agent-canary',
      body: { model: 'letta/auto' },
    });
  });
});
