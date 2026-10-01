import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(process.cwd(), 'src');

function readSource(relativePath: string): string {
  return readFileSync(join(SRC_DIR, relativePath), 'utf8');
}

function executableSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('race guards: DEFENDED protections', () => {
  it('complete_challenge must settle and reward through the atomic RPC', () => {
    const source = executableSource(readSource('lib/mcp-tools/handlers/complete_challenge.ts'));

    // 竞态场景: 两个 MCP 完成请求都读到 active challenge，各自加奖励并写审计，
    // 导致重复结算/重复发币。complete_challenge_atomic 的数据库内 CAS 与
    // p_completed_trigger_id dedup key 必须同路径存在。
    expect(source).toMatch(/\.rpc\(['"]complete_challenge_atomic['"]/);
    expect(source).toMatch(/p_completed_trigger_id:\s*dedupKey/);
  });

  it('deposit must claim unsettled status by CAS before applying rewards', () => {
    const source = executableSource(readSource('app/api/buddy/deposit/route.ts'));

    // 竞态场景: 同一 challenge 的两个存入请求并发通过只读 unsettled 检查，
    // 双方都执行奖励 RPC。UPDATE 必须带 deposit_status=unsettled 前置条件。
    expect(source).toMatch(/\.update\(\{\s*deposit_status:\s*claimStatus/);
    expect(source).toMatch(/\.eq\(['"]deposit_status['"],\s*['"]unsettled['"]\)/);
    expect(source.indexOf(".update({ deposit_status: claimStatus")).toBeLessThan(
      source.indexOf(".rpc('apply_buddy_state_delta'"),
    );
  });

  it('deposit must read RPC fund snapshots and never copy-write dream_funds', () => {
    const source = executableSource(readSource('app/api/buddy/deposit/route.ts'));

    // 竞态场景: RPC 原子更新后，路由若用请求前快照计算 current 并写回
    // dream_funds，会覆盖并发存款结果。必须消费 RPC 返回的 dream_funds 快照，
    // 且禁止直接 UPDATE dream_funds.current。
    expect(source).toMatch(/lastRpcData\?\.dream_funds|Array\.isArray\(lastRpcData\?\.dream_funds\)/);
    expect(source).not.toMatch(/\.from\(['"]dream_funds['"]\)\s*\n\s*\.update\(/);
  });

  it('dream fund progress must gate its non-idempotent RPC with a unique event insert', () => {
    const source = executableSource(readSource('app/api/buddy/dream-fund-progress/route.ts'));

    // 竞态场景: 两个进度请求并发执行 apply_buddy_state_delta，余额被加两次。
    // health_events.trigger_id 的唯一约束先插入，23505 必须转成 409，且只有
    // INSERT 成功后才能调用奖励 RPC。
    expect(source).toMatch(/trigger_id:\s*`deposit:\$\{challengeId\}`/);
    expect(source).toMatch(/insertError\.code\s*===\s*['"]23505['"]/);
    expect(source.indexOf('trigger_id: `deposit:${challengeId}`')).toBeLessThan(
      source.indexOf(".rpc('apply_buddy_state_delta'"),
    );
  });

  it('Letta agent creation must hold a fail-closed per-user lock through creation', () => {
    const source = executableSource(readSource('lib/letta-agent-manager.ts'));

    // 竞态场景: 同用户两个请求同时发现 agent_id 为空，各自创建外部 agent，
    // 产生孤儿资源和互相覆盖的 profile。创建前必须 acquireLock(..., true)，
    // 只有持有锁时才 release，避免 TTL 过期后删除他人锁。
    expect(source).toMatch(/acquireLock\(lockKey,\s*LOCK_TTL_MS,\s*true\)/);
    expect(source).toMatch(/if\s*\(lockToken\)\s*\{\s*await releaseLock\(lockKey\)/);
    expect(source.indexOf('await acquireLock(lockKey, LOCK_TTL_MS, true)')).toBeLessThan(
      source.indexOf('await createAgentForUser(userId, userEmail)'),
    );
  });

  it('Butterfly story generation must hold a per-session lock and reject overlap', () => {
    const source = executableSource(readSource('app/api/butterfly/story/route.ts'));

    // 竞态场景: 同一 session 的两个生成请求并发进入，LLM 成本翻倍且章节
    // 更新互相覆盖。必须先 acquireLock(..., true)，失败返回 409，禁止降级继续。
    expect(source).toMatch(/acquireLock\(storyLockKey,\s*120_000,\s*true\)/);
    expect(source).toMatch(/if\s*\(!lockAcquired\)\s*\{[\s\S]*?status:\s*409/);
  });
});
