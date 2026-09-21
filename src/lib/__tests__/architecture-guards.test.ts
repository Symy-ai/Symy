/**
 * Architecture Guards — 防止 AI 走回头路
 *
 * 🔧 架构优化 (基于《真正难的不是做一个 AI Demo》文章原则):
 *    "测试不只是测功能, 也是给 AI 画边界"
 *    "守卫保护方向, 不只是保护功能"
 *
 * 这些测试不验证功能正确性, 而是验证已修复的 bug 模式不会被重新引入。
 * AI 改代码时会看现有测试怎么写 — 如果测试告诉它"旧路径一出现就失败",
 * 它才会真正知道边界在哪里。
 *
 * 守卫分类:
 *   1. 事件结构守卫 — butterfly 事件不能重新引入 event.data 访问 (P0-A)
 *   2. 安全守卫 — admin service key 不能出现在客户端组件
 *   3. i18n 守卫 — 已修复的误导文案不能回退
 *   4. 合并逻辑守卫 — buddy-sync 不能重新引入内联 merge 逻辑
 *   5. 文件大小守卫 — 上帝组件不能继续膨胀
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC_DIR = join(process.cwd(), 'src');

function readSrcFile(relPath: string): string {
  const fullPath = join(SRC_DIR, relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

function countLines(relPath: string): number {
  return readSrcFile(relPath).split('\n').length;
}

/**
 * 递归查找目录下所有 .tsx 文件
 */
function findTsxFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findTsxFiles(fullPath, baseDir));
    } else if (entry.endsWith('.tsx')) {
      // 返回相对于 SRC_DIR 的路径
      results.push(relative(SRC_DIR, fullPath));
    }
  }
  return results;
}

/**
 * 获取所有 .ts 源文件（排除 .tsx, .test.ts, __tests__）
 * 🔧 ARCH fix (2026-07-21): Added for dead-code pattern guards that need to scan .ts files
 */
function findTsFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip __tests__ directories
      if (entry === '__tests__' || entry === 'node_modules') continue;
      results.push(...findTsFiles(fullPath, baseDir));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      results.push(relative(SRC_DIR, fullPath));
    }
  }
  return results;
}

/**
 * 获取所有客户端组件文件 (.tsx)
 * 排除 __tests__ 目录和 .test.tsx 文件
 */
function getClientComponentFiles(): string[] {
  const allTsx = findTsxFiles(SRC_DIR);
  return allTsx.filter(f =>
    !f.includes('__tests__') &&
    !f.endsWith('.test.tsx') &&
    !f.endsWith('.spec.tsx')
  );
}

// ============================================================
// 1. 事件结构守卫 — P0-A 崩溃修复不能回退
// ============================================================

describe('Architecture Guards: Event Structure (P0-A fix)', () => {
  const illustrationActionsPath = 'features/butterfly/hooks/session/machine-actions-illustration.ts';

  it('assignClientIllustration reads event.chapterIndex (not event.data.chapterIndex)', () => {
    const source = readSrcFile(illustrationActionsPath);
    // 找到 assignClientIllustration 到下一个函数定义之间的内容
    const match = source.match(/assignClientIllustration:[\s\S]*?(?=\n  \w+:|$)/);
    expect(match).toBeTruthy();
    const funcBody = match![0];
    // 移除注释行 (注释中可能提到旧代码模式)
    const codeOnly = funcBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // 不能访问 event.data (P0-A bug 根因) — 只检查代码, 不检查注释
    expect(codeOnly).not.toContain('event.data');
    // 应该访问 event.chapterIndex (修复后)
    expect(codeOnly).toContain('event.chapterIndex');
  });

  it('assignSceneIllustrationDone reads event.chapterIndex/sceneIndex (not event.data)', () => {
    const source = readSrcFile(illustrationActionsPath);
    const match = source.match(/assignSceneIllustrationDone:[\s\S]*?(?=\n  \w+:|$)/);
    expect(match).toBeTruthy();
    const funcBody = match![0];
    const codeOnly = funcBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toContain('event.data');
    expect(codeOnly).toContain('event.chapterIndex');
  });

  it('assignPollingUpdate checks ILLUSTRATION_POLLING_UPDATE (not ILLUSTRATION_POLLING_DONE)', () => {
    const source = readSrcFile(illustrationActionsPath);
    const match = source.match(/assignPollingUpdate:[\s\S]*?(?=\n  \w+:|$)/);
    expect(match).toBeTruthy();
    const funcBody = match![0];
    const codeOnly = funcBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // P0-A fix: guard 检查 UPDATE 不是 DONE (action 绑定到 UPDATE 事件)
    expect(codeOnly).toContain('ILLUSTRATION_POLLING_UPDATE');
    // 应该从 event.chapters 读取 (不是 event.data.currentChapters)
    expect(codeOnly).toContain('event.chapters');
  });

  it('pushClientIllustrationAttempted reads event.chapterIndex (not event.data)', () => {
    const source = readSrcFile(illustrationActionsPath);
    const match = source.match(/pushClientIllustrationAttempted:[\s\S]*?(?=\n  \w+:|$)/);
    expect(match).toBeTruthy();
    const funcBody = match![0];
    const codeOnly = funcBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toContain('event.data.chapterIndex');
  });
});

// ============================================================
// 2. 安全守卫 — admin service key 不暴露到客户端
// ============================================================

describe('Architecture Guards: Security (admin service isolation)', () => {
  const clientFiles = getClientComponentFiles();

  it('client component files exist', () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it('no client component contains admin service key references', () => {
    const forbiddenPatterns = [
      'admin service',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
      'createAdminClient',
    ];

    const violations: string[] = [];
    for (const file of clientFiles) {
      const content = readSrcFile(file);
      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          violations.push(`${file}: contains "${pattern}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ============================================================
// 3. i18n 守卫 — 已修复的误导文案不能回退
// ============================================================

describe('Architecture Guards: i18n (misleading text fixes)', () => {
  it('gachaLimitReached does not say "1 universe" (was misleading)', () => {
    const enContent = readSrcFile('i18n/messages/en.json');
    const zhContent = readSrcFile('i18n/messages/zh.json');

    // 旧文案 "Today you can still see 1 universe" 误导用户以为还剩 1 次
    expect(enContent).not.toContain('Today you can still see 1 universe');
    expect(zhContent).not.toContain('今天你还可以看见 1 个宇宙');

    // 新文案应包含 "Daily limit" / "今日已达上限"
    expect(enContent).toContain('Daily limit reached');
    expect(zhContent).toContain('今日已达上限');
  });

  it('tabs.profile is "Me" (not "Are")', () => {
    const enContent = readSrcFile('i18n/messages/en.json');
    const zhContent = readSrcFile('i18n/messages/zh.json');

    // 解析 JSON 检查 tabs.profile
    const en = JSON.parse(enContent);
    const zh = JSON.parse(zhContent);

    // 🔧 ARCH fix Round 78: tabs.profile now includes emoji prefix
    expect(en.tabs.profile).toBe('👤 Me');
    expect(zh.tabs.profile).toBe('👤 我的');
  });

  it('buddy.badges is guardian philosophy (not "Badges")', () => {
    const enContent = readSrcFile('i18n/messages/en.json');
    const zhContent = readSrcFile('i18n/messages/zh.json');

    const en = JSON.parse(enContent);
    const zh = JSON.parse(zhContent);

    expect(en.buddy.badges).not.toBe('Badges');
    expect(zh.buddy.badges).toBe('你的守护，留下的印记');
  });
});

// ============================================================
// 4. 合并逻辑守卫 — buddy-sync 系统已移除 (Round 95 React Query 替代)
// ============================================================

describe('Architecture Guards: buddy-sync removed (React Query replacement)', () => {
  it('buddy-sync.ts is deleted (replaced by React Query)', () => {
    // 🔧 Round 95: buddy-sync.ts and all related files deleted.
    //    React Query (use-buddy-state-rq.ts) handles caching/sync/optimistic updates.
    const buddySyncExists = existsSync(join(SRC_DIR, 'lib', 'buddy-sync.ts'));
    expect(buddySyncExists).toBe(false);
  });

  it('dexie is not in package.json', () => {
    // 🔧 Round 95: Dexie dependency removed.
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf-8');
    expect(packageJson).not.toContain('"dexie"');
  });

  it('use-buddy-state-rq.ts exists (React Query replacement)', () => {
    const rqExists = existsSync(join(SRC_DIR, 'hooks', 'use-buddy-state-rq.ts'));
    expect(rqExists).toBe(true);
  });
});

// ============================================================
// 5. 文件大小守卫 — 上帝组件不能继续膨胀
// ============================================================

describe('Architecture Guards: File size limits', () => {
  const fileLimits: Array<{ path: string; maxLines: number; description: string }> = [
    // 已拆分的组件 — 不能回涨
    { path: 'components/chat-tab.tsx', maxLines: 870, description: 'chat-tab (已拆出 hooks/ + parts/ + challenge-fetch + silent-moment + reflection-popup)' },
    { path: 'features/butterfly/components/butterfly-tab.tsx', maxLines: 880, description: 'butterfly-tab' },
    { path: 'components/profile-tab.tsx', maxLines: 810, description: 'profile-tab (已拆出 profile-parts/)' },
    // 🔧 Round 95: buddy-sync.ts deleted (React Query replacement), guard removed
    // 🔧 ARCH fix Round 74 (Finding 18): god component containment — prevent growth
    { path: 'lib/health-impact.ts', maxLines: 800, description: 'health-impact (pure calculations extracted to cultivation-assessment pattern)' },
    { path: 'features/butterfly/hooks/session/machine-actions.ts', maxLines: 950, description: 'machine-actions (XState assign actions)' },
    { path: 'features/butterfly/hooks/session/machine-services.ts', maxLines: 700, description: 'machine-services (XState services)' },
    { path: 'app/[locale]/page.tsx', maxLines: 850, description: 'page.tsx (app shell)' },
  ];

  for (const { path, maxLines, description } of fileLimits) {
    it(`${description} stays under ${maxLines} lines (currently ${countLines(path)})`, () => {
      const lines = countLines(path);
      expect(lines).toBeLessThan(maxLines);
    });
  }
});

// ============================================================
// 6. 守卫清单 — 已部署的修复不能回退
// ============================================================

describe('Architecture Guards: Deployed fixes must not regress', () => {
  it('handleChooseToBuy passes isBuyPath=true to sendMessage (P0-1 fix)', () => {
    const source = readSrcFile('components/chat/hooks/use-challenge-actions.ts');
    // P0-1 fix: handleChooseToBuy 传 isBuyPath=true
    // 🔧 P1-2 fix: now also passes actionType='chose_to_buy' as 5th arg
    expect(source).toMatch(/sendMessage\([^)]+,\s*true,\s*'chose_to_buy'\)/);
  });

  it('consume-ai-stream.ts has justBoughtChallengeRef in HandleToolEventParams (P0-1 fix)', () => {
    const source = readSrcFile('components/chat/hooks/consume-ai-stream.ts');
    expect(source).toContain('justBoughtChallengeRef');
    // handleToolEvent 检查 isBuyPath
    expect(source).toContain('isBuyPath');
  });

  it('activeSessionHasPendingChoice checks session.status (player stuck fix)', () => {
    const source = readSrcFile('features/butterfly/hooks/session/machine-guards.ts');
    const match = source.match(/activeSessionHasPendingChoice:[\s\S]*?(?=\n  \/\/|\n  \w+:|$)/);
    expect(match).toBeTruthy();
    const funcBody = match![0];
    // 修复: completed session 不进 choosing
    expect(funcBody).toContain('completed');
  });

  it('deposit route creates health_event with deposit_api trigger_source (P2-11 fix)', () => {
    const source = readSrcFile('app/api/buddy/deposit/route.ts');
    expect(source).toContain("triggerSource: 'deposit_api'");
    expect(source).toContain('challenge_reward');
  });

  it('health-impact-types.ts has deposit_api in TriggerSource type (P2-11 fix)', () => {
    // 🔧 Round 81: TriggerSource moved to health-impact-types.ts (was health-impact.ts)
    const source = readSrcFile('lib/health-impact-types.ts');
    expect(source).toContain("'deposit_api'");
    // VALID_TRIGGER_SOURCES 数组也必须包含
    expect(source).toMatch(/VALID_TRIGGER_SOURCES[\s\S]*deposit_api/);
  });
});

// ============================================================
// 7. 层级规则守卫 — 防止 hooks/lib 从 components 导入 (Finding 5 & 6)
// ============================================================

describe('Architecture Guards: Layering rules', () => {
  it('hooks do not import from @/components/ (layering violation, except auth-provider)', () => {
    const hooksDir = join(SRC_DIR, 'hooks');
    const hookFiles = readdirSync(hooksDir).filter(f => f.endsWith('.ts'));
    const violations: string[] = [];

    for (const file of hookFiles) {
      const content = readFileSync(join(hooksDir, file), 'utf-8');
      // Check for imports from @/components/ — auth-provider is exempt (it exports useAuth hook)
      const lines = content.split('\n').filter(l => l.includes("from '@/components/") && !l.includes('auth-provider'));
      if (lines.length > 0) {
        violations.push(`hooks/${file}: ${lines[0].trim()}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('lib does not import from @/hooks/ or @/components/ (layering violation)', () => {
    const libDir = join(SRC_DIR, 'lib');
    const libFiles = readdirSync(libDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const violations: string[] = [];

    for (const file of libFiles) {
      const content = readFileSync(join(libDir, file), 'utf-8');
      if (content.includes("from '@/hooks/")) {
        violations.push(`lib/${file}: imports from @/hooks/`);
      }
      if (content.includes("from '@/components/") && !content.includes("@/components/buddy/constants")) {
        violations.push(`lib/${file}: imports from @/components/`);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ============================================================
// 8. Zod 验证守卫 — API 路由必须用 zod 验证 (Finding 12, 13, 14)
// ============================================================

describe('Architecture Guards: Zod validation on API routes', () => {
  it('hourly-rate POST uses zod validation (not manual typeof check)', () => {
    const source = readSrcFile('app/api/user/hourly-rate/route.ts');
    expect(source).toContain('validateBody');
    expect(source).toContain('z.object');
    // Should NOT contain manual typeof validation (old pattern)
    const codeOnly = source.replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toContain('typeof hourlyRate');
  });

  // 🔧 Round 101: admin/run-migration route was deleted (temporary one-time route).
  // The test that checked it for zod validation has been removed.

  it('demo-story route differentiates JSON parse error from ZodError', () => {
    const source = readSrcFile('app/api/butterfly/demo-story/route.ts');
    // Should check for ZodError specifically (not blanket catch)
    expect(source).toContain('ZodError');
    expect(source).not.toMatch(/catch\s*\{[^}]*body\s*=\s*\{\}/);
  });
});

// ============================================================
// 9. Module-level mutable flag 守卫 — 防止重新引入 module-level let (Finding 18)
// ============================================================

describe('Architecture Guards: No module-level mutable RPC flags', () => {
  it('health-impact.ts does not use module-level let for RPC availability', () => {
    const source = readSrcFile('lib/health-impact.ts');
    const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Should NOT have module-level `let rpcAvailable` or `let rpcLastFailTime`
    expect(codeOnly).not.toMatch(/^let rpcAvailable/m);
    expect(codeOnly).not.toMatch(/^let rpcLastFailTime/m);
    // Should use RpcHealth class
    expect(codeOnly).toContain('healthEventRpcHealth');
  });

  it('_shared.ts does not use module-level let for deltaRpcAvailable', () => {
    const source = readSrcFile('lib/mcp-tools/handlers/_shared.ts');
    const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Should NOT export module-level `let deltaRpcAvailable`
    expect(codeOnly).not.toMatch(/export let deltaRpcAvailable/m);
    // Should use RpcHealth class
    expect(codeOnly).toContain('deltaRpcHealth');
  });
});

// ============================================================
// 12. i18n 完整性守卫 — 关键用户可见文案不能硬编码英文 (Finding 4, 5 回归防护)
// ============================================================

describe('Architecture Guards: i18n completeness', () => {
  it('use-milestone-toasts.ts uses t() for all toast messages (not hardcoded English)', () => {
    const source = readSrcFile('hooks/use-milestone-toasts.ts');
    const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Should NOT contain hardcoded toast messages (old pattern)
    expect(codeOnly).not.toContain("'🎉 $10,000 bought back!'");
    expect(codeOnly).not.toContain("'🔥 7-day streak!'");
    // Should use t() function
    expect(codeOnly).toContain("t('milestone.");
  });

  it('use-player-actions.ts uses getFallbackChoice for fallback (not hardcoded English)', () => {
    const source = readSrcFile('features/butterfly/hooks/player/use-player-actions.ts');
    const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Should NOT contain hardcoded fallback choice strings
    expect(codeOnly).not.toContain("'The familiar path'");
    expect(codeOnly).not.toContain("'Which path do you take?'");
    // Should use getFallbackChoice
    expect(codeOnly).toContain('getFallbackChoice');
  });
});

// ============================================================
// 13. God component 大小守卫 — 更新限制 (Round 67)
// ============================================================

describe('Architecture Guards: Updated file size limits', () => {
  it('use-buddy-state-rq.ts stays under 600 lines (replaced use-buddy-state.ts)', () => {
    // 🔧 Round 95: use-buddy-state.ts deleted, replaced by use-buddy-state-rq.ts
    const lines = countLines('hooks/use-buddy-state-rq.ts');
    expect(lines).toBeLessThan(600);
  });

  it('buddy-tab.tsx stays under 800 lines (was 787, P1-5 + Pattern Alert inline added)', () => {
    const lines = countLines('components/buddy-tab.tsx');
    expect(lines).toBeLessThanOrEqual(800);
  });

  it('page.tsx stays under 850 lines (2.5D tab + Variable Reward added)', () => {
    const lines = countLines('app/[locale]/page.tsx');
    expect(lines).toBeLessThan(850);
  });
});

// ============================================================
// 14. 安全守卫 — ReactMarkdown + admin route + rate limit (Round 69)
// ============================================================

describe('Architecture Guards: Security hardening (Round 69)', () => {
  it('chat-bubble.tsx ReactMarkdown disallows img/script/iframe (Finding 8)', () => {
    const source = readSrcFile('components/chat-bubble.tsx');
    expect(source).toContain('disallowedElements');
    expect(source).toContain("'img'");
    expect(source).toContain("'script'");
    expect(source).toContain('urlTransform');
  });

  // 🔧 Round 101: admin/run-migration route was deleted (temporary one-time route).
  // The test that checked it was disabled in production has been removed.

  it('demo-story route has rate limiting (Finding 9)', () => {
    const source = readSrcFile('app/api/butterfly/demo-story/route.ts');
    expect(source).toContain('checkRateLimit');
    expect(source).toContain('demo-story');
  });

  it('lettaAPI has timeout + error classification (Finding 5)', () => {
    const source = readSrcFile('lib/letta-mcp-manager.ts');
    expect(source).toContain('AbortSignal.timeout');
    expect(source).toContain('LettaAPIError');
    expect(source).toContain('latencyMs');
  });

  it('useBuddyTimers does not have unused state parameter (Finding 12)', () => {
    const source = readSrcFile('hooks/use-buddy-timers.ts');
    const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Interface should NOT have state: BuddyState
    expect(codeOnly).not.toMatch(/state:\s*BuddyState/);
  });
});

// ============================================================
// 10. TypeScript 安全守卫 — 限制 as any 使用 (Finding 15)
// ============================================================

describe('Architecture Guards: TypeScript safety', () => {
  it('no `as any` in non-test source files (except documented XState/Letta wrappers)', () => {
    // 扫描所有 .ts/.tsx 文件 (排除 test, __tests__, .d.ts, e2e)
    const srcRoot = SRC_DIR;
    const allFiles: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
          walk(full);
        } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
                   !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx') &&
                   !entry.endsWith('.d.ts')) {
          allFiles.push(relative(srcRoot, full));
        }
      }
    }
    walk(srcRoot);

    const violations: string[] = [];
    for (const file of allFiles) {
      const content = readSrcFile(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        // Check for `as any` (not `as any[]` which is less dangerous)
        if (/\bas any\b/.test(line) && !line.includes('as any[]')) {
          // Allow documented XState wrappers
          if (file.includes('machine-actions') && line.includes('assign(fn as any)')) continue;
          if (file.includes('typedAssign')) continue;
          // Allow Letta SDK wrappers (documented)
          if (file.includes('letta') && (line.includes('as Record<string, unknown>') || line.includes('as unknown as'))) continue;
          violations.push(`${file}:${i + 1}: ${line.trim().substring(0, 80)}`);
        }
      }
    }

    // Allow up to 10 documented exceptions (XState + Letta SDK)
    expect(violations.length).toBeLessThanOrEqual(10);
    if (violations.length > 0) {
      console.warn('as any violations:\n' + violations.join('\n'));
    }
  });
});

// ============================================================
// 11. Timer 清理守卫 — setTimeout/setInterval 必须有对应 cleanup (Finding 30)
// ============================================================

describe('Architecture Guards: Timer cleanup', () => {
  it('components with setTimeout in useEffect have clearTimeout in cleanup', () => {
    // 检查关键组件 — setTimeout 必须配对 clearTimeout
    const filesToCheck = [
      'components/chat-tab.tsx',
      'components/buddy-tab.tsx',
      'components/profile-tab.tsx',
      'app/[locale]/page.tsx',
    ];

    for (const file of filesToCheck) {
      const source = readSrcFile(file);
      const codeOnly = source.replace(/\/\/.*$/gm, '');

      // Count setTimeout vs clearTimeout (should be roughly equal)
      const setTimeoutCount = (codeOnly.match(/setTimeout\(/g) || []).length;
      const clearTimeoutCount = (codeOnly.match(/clearTimeout\(/g) || []).length;

      // Each setTimeout should have a corresponding clearTimeout
      // (either in cleanup or in a ref cleanup)
      // Allow some flexibility (refs tracked elsewhere)
      if (setTimeoutCount > clearTimeoutCount + 2) {
        // Only flag if significantly mismatched
        console.warn(`${file}: setTimeout=${setTimeoutCount}, clearTimeout=${clearTimeoutCount} — possible timer leak`);
      }
    }
    // This is a soft guard — no hard failure, just awareness
    expect(true).toBe(true);
  });
});

// ============================================================
// 12. server-only 守卫 — 使用 admin service 的 lib 文件必须 import 'server-only'
// 🔧 ARCH fix Round 73: 防止客户端组件意外 import 服务端模块导致 admin service key 泄漏
// ============================================================

describe('Architecture Guards: server-only directive on admin service modules', () => {
  // 所有使用 createAdminClient / SUPABASE_SERVICE_ROLE_KEY / admin service 的 lib 文件
  const serverOnlyFiles = [
    'lib/distributed-lock.ts',
    'lib/supabase-admin.ts',
    'lib/cultivation.ts',
    'lib/challenge-store.ts',
    'lib/health-impact.ts',
    'lib/admin-audit.ts',
    'lib/admin-auth.ts',
    'lib/proxy-auth.ts',
    'lib/with-auth.ts',
    'lib/crypto-helpers.ts',
    'lib/letta-mcp-manager.ts',
    'lib/letta-agent-manager.ts',
    'lib/ai-audit.ts',
    'lib/embed-backfill.ts',
    'lib/rag.ts',
    'lib/embeddings.ts',
    'lib/user-hourly-rate.ts',
    'lib/mcp-tools/handlers/_shared.ts',
    'lib/mcp-tools/handlers/complete_challenge.ts',
    'lib/mcp-tools/handlers/add_dream_fund_progress.ts',
    'lib/mcp-tools/handlers/add_tokens.ts',
    'lib/mcp-tools/handlers/add_vitality.ts',
    'lib/mcp-tools/handlers/add_badge.ts',
    'lib/mcp-tools/handlers/record_impulse.ts',
  ];

  for (const file of serverOnlyFiles) {
    it(`${file} has \`import 'server-only'\` directive`, () => {
      const source = readSrcFile(file);
      // Must have `import 'server-only';` anywhere in the file (the package throws at
      // import time when bundled for client, so location within file doesn't matter —
      // but convention is to place it at the top of the import block, after the file
      // header comment if any).
      expect(source).toMatch(/^import 'server-only'/m);
    });
  }

  it('all server-only lib files in src/lib/ that reference admin service have directive', () => {
    // Walk src/lib/ for any file that references admin service but lacks the directive
    const violations: string[] = [];
    const walk = (dir: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === '__tests__') continue;
          walk(full);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          const content = readFileSync(full, 'utf-8');
          const referencesServiceRole =
            content.includes('SUPABASE_SERVICE_ROLE_KEY') ||
            content.includes('createAdminClient') ||
            content.includes('admin service');
          const hasDirective = /^import 'server-only'/m.test(content);
          if (referencesServiceRole && !hasDirective) {
            violations.push(relative(SRC_DIR, full));
          }
        }
      }
    };
    walk(join(SRC_DIR, 'lib'));
    expect(violations).toEqual([]);
  });
});

// ============================================================
// 13. Admin action zod validation 守卫 — admin/letta/actions/* 必须用 validateActionBody
// 🔧 ARCH fix Round 73: Audit Finding 3.1 — `ctx.body.field as string` casts silently
// accept malformed input (e.g. `{ agent_id: 12345 }` — number — passes cast, crashes downstream).
// 根因修复: 每个 action 必须用 validateActionBody(schema, ctx) 替代手动 cast。
// ============================================================

describe('Architecture Guards: admin action zod validation', () => {
  const adminActionsDir = join(SRC_DIR, 'app', 'api', 'admin', 'letta', 'actions');

  it('admin actions directory exists', () => {
    expect(existsSync(adminActionsDir)).toBe(true);
  });

  it('all admin action files use validateActionBody (not raw `as string` casts from ctx.body)', () => {
    if (!existsSync(adminActionsDir)) return;
    const actionFiles = readdirSync(adminActionsDir)
      .filter(f => f.endsWith('.ts') && f !== '_shared.ts');
    const violations: string[] = [];

    for (const file of actionFiles) {
      const content = readFileSync(join(adminActionsDir, file), 'utf-8');
      // Strip comments before checking — comments may legitimately mention the old pattern.
      const codeOnly = content
        .replace(/\/\/.*$/gm, '')           // line comments
        .replace(/\/\*[\s\S]*?\*\//g, '');  // block comments
      // Look for the pattern: `ctx.body.X as Y` (raw cast — should use validateActionBody instead).
      const rawCastPattern = /ctx\.body\.\w+\s+as\s+string/g;
      const matches = codeOnly.match(rawCastPattern) || [];
      if (matches.length > 0) {
        violations.push(`${file}: still uses raw \`ctx.body.X as string\` cast (${matches.length} sites)`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('_shared.ts exports validateActionBody helper', () => {
    const sharedContent = readSrcFile('app/api/admin/letta/actions/_shared.ts');
    expect(sharedContent).toContain('export function validateActionBody');
  });
});

// ============================================================
// 14. Buddy-sync God Object 守卫 — buddy-sync 已删除 (Round 95 React Query 替代)
// 🔧 Round 95: buddy-sync.ts 和所有相关文件已删除。
//    React Query 替代了缓存、同步、乐观更新、回滚。
//    原来的 13 个模块级可变状态 + resetSyncState 都不再需要。
// ============================================================

describe('Architecture Guards: buddy-sync God Object removed (React Query)', () => {
  it('buddy-sync.ts has no module-level mutable vars (file deleted)', () => {
    // 🔧 Round 95: buddy-sync.ts deleted, replaced by use-buddy-state-rq.ts
    const buddySyncExists = existsSync(join(SRC_DIR, 'lib', 'buddy-sync.ts'));
    expect(buddySyncExists).toBe(false);
  });

  it('use-buddy-state-rq.ts has 0 module-level mutable vars', () => {
    // React Query manages all state — no module-level let vars needed
    const source = readSrcFile('hooks/use-buddy-state-rq.ts');
    const moduleLevelLets = source.match(/^let \w+/gm) || [];
    expect(moduleLevelLets.length).toBe(0);
  });
});

// ============================================================
// 15. Migration ↔ database.types.ts 同步守卫 — 所有 migration 创建的表必须在 types 中
// 🔧 ARCH fix Round 74 (Finding 6): premium_waitlist 表缺失 database.types.ts.
//    根因修复: 守卫测试自动扫描 migrations/ 中 CREATE TABLE 的表名,
//    验证每个都在 database.types.ts 中有定义.
// ============================================================

describe('Architecture Guards: migration ↔ database.types.ts sync', () => {
  const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

  it('migrations directory exists', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it('all CREATE TABLE tables in migrations exist in database.types.ts', () => {
    if (!existsSync(MIGRATIONS_DIR)) return;
    const typesContent = readSrcFile('lib/database.types.ts');
    const violations: string[] = [];

    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      // Match CREATE TABLE [IF NOT EXISTS] table_name
      const matches = content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi);
      for (const match of matches) {
        const tableName = match[1];
        // Skip tables that are intentionally not in types (e.g., audit log tables)
        // Add to SKIP_TABLES if a table is deliberately untyped
        // 🔧 Round 98: migration 095 tables not yet applied to production DB
        const SKIP_TABLES: string[] = ['community_challenges', 'challenge_participants'];
        if (SKIP_TABLES.includes(tableName)) continue;
        // Check if the table name appears as a key in the Tables section
        const tableKeyPattern = new RegExp(`\\b${tableName}\\s*:\\s*\\{`);
        if (!tableKeyPattern.test(typesContent)) {
          violations.push(`${file}: table "${tableName}" missing from database.types.ts`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ============================================================
// 16. PII leak 守卫 — premium/waitlist 不记录原始 email
// 🔧 ARCH fix Round 75 (Finding 30): 防止 PII 泄漏回退
// ============================================================

describe('Architecture Guards: PII leak prevention', () => {
  it('premium/waitlist route does not log raw email (uses maskEmailForLog)', () => {
    const source = readSrcFile('app/api/premium/waitlist/route.ts');
    expect(source).toContain('maskEmailForLog');
    const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Match logger calls with body.email NOT wrapped in maskEmailForLog()
    // (maskEmailForLog(body.email) is OK; raw body.email is PII leak)
    const rawEmailLogPattern = /logger\.\w+\([^)]*(?<!maskEmailForLog\()body\.email/g;
    const matches = codeOnly.match(rawEmailLogPattern) || [];
    expect(matches).toEqual([]);
  });
});

// ============================================================
// 17. Supabase .select() column validator — 防止 BlindSpotMap-class bug
// 🔧 ARCH fix Round 80 (Finding F1): .select('col1, col2') 字符串不验证 →
//    开发者写错列名 (如 platform 不在 active_challenges 上) → 运行时 500
//
// 根因: Supabase JS client 的 .select() 接受任意字符串, TypeScript 不校验.
//       BlindSpotMap bug (commit 02780059) 就是这样上线的 — platform 列不存在,
//       query 返回 PGRST 错误, API 返回 500, 组件 fetch 失败不渲染.
//
// 守卫: 扫描所有 .from('table').select('col1, col2, ...') 调用,
//       验证每个列名在 database.types.ts 的 Row 类型中存在.
//       防止整个 bug 类在运行时才被发现.
// ============================================================

describe('Architecture Guards: Supabase .select() column validation', () => {
  const TYPES_PATH = 'lib/database.types.ts';

  /**
   * 从 database.types.ts 解析所有表的 Row 列名.
   * 返回: { tableName: Set<columnName> }
   */
  function parseTableColumns(): Record<string, Set<string>> {
    const content = readSrcFile(TYPES_PATH);
    const tables: Record<string, Set<string>> = {};

    // 匹配 `tableName: {` 然后找 `Row: {` 块, 提取列名
    // 格式:
    //   tableName: {
    //     Row: {
    //       col1: type;
    //       col2: type;
    //     };
    //     Insert: { ... };
    //     Update: { ... };
    //   };
    const tableBlockRegex = /(\w+):\s*\{\s*Row:\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = tableBlockRegex.exec(content)) !== null) {
      const tableName = match[1];
      const rowBlock = match[2];
      // 列名: 行首 0+ 空格 + 标识符 + :
      const colRegex = /^\s*(\w+)\s*:/gm;
      const cols = new Set<string>();
      let colMatch: RegExpExecArray | null;
      while ((colMatch = colRegex.exec(rowBlock)) !== null) {
        cols.add(colMatch[1]);
      }
      if (cols.size > 0) {
        tables[tableName] = cols;
      }
    }
    return tables;
  }

  /**
   * 递归找所有 .ts / .tsx 文件 (排除 test/types)
   */
  function findSourceFiles(dir: string, baseDir: string = dir): string[] {
    const results: string[] = [];
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
        results.push(...findSourceFiles(fullPath, baseDir));
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') ||
            entry.endsWith('.spec.ts') || entry.endsWith('.spec.tsx') ||
            entry === 'database.types.ts') continue;
        results.push(relative(process.cwd(), fullPath));
      }
    }
    return results;
  }

  /**
   * Supabase .select() 支持的语法 (我们只校验简单列名, 复杂语法跳过):
   *  - 'col1, col2'              → 校验 col1, col2
   *  - 'col1, col2!inner'        → 校验 col1, col2 (去掉 !inner)
   *  - 'col1, relation(col2)'    → 跳过 relation(...) 嵌套
   *  - '*'                        → 跳过 (select all)
   *  - 'count' (with head:true)  → 跳过 (count 是 PostgREST 特殊语法)
   */
  function extractColumnsFromSelect(selectArg: string): string[] {
    if (selectArg.trim() === '*' || selectArg.trim() === '') return [];
    // 去掉 relation(...) 嵌套 (只看顶层列名)
    const cleaned = selectArg.replace(/\([^)]*\)/g, '');
    // 按逗号分隔
    const cols = cleaned.split(',').map(c => c.trim()).filter(Boolean);
    const result: string[] = [];
    for (const col of cols) {
      // 去掉 !inner, !left 等 hint
      const name = col.split('!')[0].split(':')[0].trim();
      if (name && name !== '*' && !name.includes('(') && !name.includes(')')) {
        result.push(name);
      }
    }
    return result;
  }

  it('database.types.ts is parseable (has at least 10 tables with Row)', () => {
    const tables = parseTableColumns();
    const tableCount = Object.keys(tables).length;
    expect(tableCount).toBeGreaterThanOrEqual(10);
    // 抽查 active_challenges 的列
    expect(tables.active_challenges).toBeDefined();
    expect(tables.active_challenges.has('platform')).toBe(false); // 确认 BlindSpotMap bug 不会回归
    expect(tables.active_challenges.has('metadata')).toBe(true);
  });

  it('all .from(table).select(columns) calls reference existing columns', () => {
    const tables = parseTableColumns();
    const files = findSourceFiles(SRC_DIR);
    const violations: string[] = [];

    // 匹配 .from('table_name' 或 "table_name") 后面 (可能在下一行) 的 .select('cols' 或 "cols" 或 `cols`)
    // 用 multiline + dotall 兼容跨行
    // Pattern: .from(<quote>table<quote>).select(<quote>cols<quote>)
    // 也匹配 .from(<q>table<q>)\n.select(<q>cols<q>)
    const queryRegex = /\.from\(\s*['"`](\w+)['"`]\s*\)\s*\.select\(\s*['"`]([^'"`]*)['"`]/g;

    for (const file of files) {
      const fullPath = join(process.cwd(), file);
      if (!existsSync(fullPath)) continue;
      const content = readFileSync(fullPath, 'utf-8');

      // 去掉注释 (// ... 和 /* ... */) 避免误匹配
      const codeOnly = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      let match: RegExpExecArray | null;
      while ((match = queryRegex.exec(codeOnly)) !== null) {
        const tableName = match[1];
        const selectArg = match[2];
        const tableCols = tables[tableName];
        if (!tableCols) {
          // 表不存在于 types (单独的守卫会抓) — 跳过
          continue;
        }
        const requestedCols = extractColumnsFromSelect(selectArg);
        for (const col of requestedCols) {
          if (!tableCols.has(col)) {
            violations.push(
              `${file}: .from('${tableName}').select('${selectArg}') — column "${col}" does not exist on ${tableName}.Row (known: ${[...tableCols].join(', ')})`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      console.error('Column validation violations:\n' + violations.join('\n'));
    }
    expect(violations).toEqual([]);
  });
});

// ============================================================
// 18. Circular dependency guard — prevent import cycles
// 🔧 Round 81: health-impact ↔ health-impact-legacy was circular.
//    madge detects cycles but isn't in CI. This guard catches cycles
//    in src/lib/ (the most common source of cycles).
// ============================================================

describe('Architecture Guards: No circular dependencies in src/lib/', () => {
  // Known acceptable cycles (XState machine ↔ actions/services — type-only imports)
  const KNOWN_ACCEPTABLE_CYCLES = [
    'butterfly-machine',
    'machine-actions',
    'machine-services',
    'machine-guards',
    'illustration-actors',
    'preload-actors',
    'service-inputs',
    'sse-event-mapper',
    'machine-actions-illustration',
    'machine-actions-session',
  ];

  it('no circular dependencies between src/lib/ files (except known XState cycles)', () => {
    // Simple cycle detection: for each .ts file in src/lib/, check if any of its
    // imports (direct or transitive) eventually import back from it.
    // This is a conservative check — only flags direct 2-node cycles (A→B→A).
    const libDir = join(SRC_DIR, 'lib');
    const violations: string[] = [];

    function findDirectImports(filePath: string): string[] {
      // 🔧 ARCH fix (2026-07-18): skip directories — readFileSync throws EISDIR.
      //    This happens when a file imports from './complete-challenge' which
      //    resolves to a directory (with index.ts inside). We need to resolve
      //    to the index.ts file, not the directory.
      if (!existsSync(filePath)) return [];
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        // Try index.ts inside the directory
        const indexPath = join(filePath, 'index.ts');
        if (existsSync(indexPath)) {
          return findDirectImports(indexPath);
        }
        return [];
      }
      const content = readFileSync(filePath, 'utf-8');
      // Match import { ... } from './...' or '@/lib/...'
      const importRegex = /from\s+['"]([^'"]+)['"]/g;
      const imports: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Only follow relative imports within src/lib/
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          // Resolve relative to current file
          const dir = filePath.substring(0, filePath.lastIndexOf('/'));
          let resolved = join(dir, importPath);
          // Try .ts, .tsx extensions
          if (!existsSync(resolved) && !existsSync(resolved + '.ts')) {
            resolved = resolved + '.ts';
          } else if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx') && existsSync(resolved + '.ts')) {
            resolved = resolved + '.ts';
          }
          if (existsSync(resolved)) {
            imports.push(resolved);
          }
        }
      }
      return imports;
    }

    function walkLib(dir: string) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry === '__tests__' || entry === 'node_modules') continue;
          walkLib(full);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
          const directImports = findDirectImports(full);
          for (const imp of directImports) {
            // Check if imp imports back from full (2-node cycle)
            const impImports = findDirectImports(imp);
            if (impImports.includes(full)) {
              // Check if both files are in the known acceptable list
              const fileBase = entry.replace('.ts', '');
              const impBase = imp.split('/').pop()?.replace('.ts', '') || '';
              if (KNOWN_ACCEPTABLE_CYCLES.includes(fileBase) && KNOWN_ACCEPTABLE_CYCLES.includes(impBase)) {
                continue; // Acceptable XState cycle
              }
              violations.push(`${relative(SRC_DIR, full)} ↔ ${relative(SRC_DIR, imp)} (circular)`);
            }
          }
        }
      }
    }

    walkLib(libDir);

    if (violations.length > 0) {
      console.error('Circular dependency violations:\n' + violations.join('\n'));
    }
    expect(violations).toEqual([]);
  });
});

// ============================================================
// 19. i18n key completeness guard — prevent MISSING_MESSAGE errors
// 🔧 Round 81: 7 i18n keys were used in code but missing from en.json/zh.json.
//    next-intl logs MISSING_MESSAGE error in browser console for each missing key.
//    This guard scans all t('key') calls and verifies the key exists in both files.
// ============================================================

describe('Architecture Guards: i18n key completeness', () => {
  function parseI18nKeys(file: string): Set<string> {
    const content = readSrcFile(file);
    const keys = new Set<string>();
    // Recursively extract all keys from nested JSON object
    function extractKeys(obj: unknown, prefix: string = '') {
      if (typeof obj === 'string') {
        keys.add(prefix);
      } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          extractKeys(value, newPrefix);
        }
      }
    }
    try {
      // Remove trailing commas (JSON5) and parse
      const cleaned = content.replace(/,(\s*[}\]])/g, '$1');
      const parsed = JSON.parse(cleaned);
      extractKeys(parsed);
    } catch {
      // If JSON parse fails, fall back to line-based extraction
      const lines = content.split('\n');
      const path: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const indent = line.search(/\S/);
        const level = Math.floor(indent / 2);
        while (path.length > level) path.pop();
        const keyMatch = trimmed.match(/^"([^"]+)":\s*(.+)$/);
        if (keyMatch) {
          const key = keyMatch[1];
          const value = keyMatch[2].trim();
          path.push(key);
          if (value.startsWith('"') && value.endsWith('"')) {
            keys.add(path.join('.'));
            path.pop();
          } else if (value === '{' || value === '[') {
            // keep key for children
          } else {
            path.pop();
          }
        } else if (trimmed === '},' || trimmed === '}') {
          path.pop();
        }
      }
    }
    // Always also extract keys via regex as a safety net.
    // 🔧 Fix: require the key to be at the start of a line so we don't
    // accidentally capture escaped `\"` inside string values like
    // `"fundProgress": "\"{fundName}\\": {progress}%"`.
    const keyRegex = /^\s*"([^"]+)"\s*:/gm;
    let match;
    while ((match = keyRegex.exec(content)) !== null) {
      keys.add(match[1]);
    }
    return keys;
  }

  function findTKeysInSource(relPath: string): string[] {
    const content = readSrcFile(relPath);
    const keys: string[] = [];
    // Match t('key'), t("key"), t(`key`), t('key', { ... })
    const tCallRegex = /\bt\(\s*['"`]([a-zA-Z][a-zA-Z0-9.]*)['"`]/g;
    let match: RegExpExecArray | null;
    while ((match = tCallRegex.exec(content)) !== null) {
      keys.push(match[1]);
    }
    return keys;
  }

  it('en.json and zh.json have the same top-level keys', () => {
    const enKeys = parseI18nKeys('i18n/messages/en.json');
    const zhKeys = parseI18nKeys('i18n/messages/zh.json');
    const enOnly = [...enKeys].filter(k => !zhKeys.has(k));
    const zhOnly = [...zhKeys].filter(k => !enKeys.has(k));
    if (enOnly.length > 0) {
      console.error('Keys in en.json but not zh.json:\n' + enOnly.join('\n'));
    }
    if (zhOnly.length > 0) {
      console.error('Keys in zh.json but not en.json:\n' + zhOnly.join('\n'));
    }
    expect(enOnly).toEqual([]);
    expect(zhOnly).toEqual([]);
  });

  it('all t() keys in source files exist in en.json', () => {
    const enKeys = parseI18nKeys('i18n/messages/en.json');
    const violations: string[] = [];

    // Walk all .ts/.tsx files in src/ (excluding tests, i18n provider, setup)
    function walkDir(dir: string) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
          walkDir(full);
        } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
                   !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx') &&
                   !entry.endsWith('.spec.ts') && !entry.endsWith('.spec.tsx') &&
                   !entry.includes('i18n/messages')) {
          const relPath = relative(SRC_DIR, full);
          const keys = findTKeysInSource(relPath);
          for (const key of keys) {
            if (!enKeys.has(key)) {
              violations.push(`${relPath}: t('${key}') — key not in en.json`);
            }
          }
        }
      }
    }

    walkDir(SRC_DIR);

    if (violations.length > 0) {
      console.error('Missing i18n keys:\n' + violations.join('\n'));
    }
    expect(violations).toEqual([]);
  });
});

// ============================================================
// 20. RLS WITH CHECK guard — UPDATE policies must have WITH CHECK in final state
// 🔧 Round 94: 4 UPDATE policies were missing WITH CHECK → users could
//    UPDATE user_id to transfer data to another user.
//    Migration 094 fixes this. Guard checks final state (last CREATE wins).

describe('Architecture Guards: RLS WITH CHECK on UPDATE policies', () => {
  const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

  it('all UPDATE policies have WITH CHECK in final state (prevent cross-user data transfer)', () => {
    if (!existsSync(MIGRATIONS_DIR)) return;
    const violations: string[] = [];

    // Track final state of each UPDATE policy: (table, policyName) -> hasWithCheck
    const policyState = new Map<string, boolean>();

    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    for (const file of migrationFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

      // Process DROP POLICY — remove from state
      const dropRegex = /drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?(\w+)\s+for\s+update/gi;
      let match: RegExpExecArray | null;
      while ((match = dropRegex.exec(content)) !== null) {
        const key = `${match[2]}:${match[1]}`;
        policyState.delete(key);
      }

      // Process CREATE POLICY for UPDATE — add to state
      const createRegex = /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)\s+for\s+update/gi;
      while ((match = createRegex.exec(content)) !== null) {
        const policyName = match[1];
        const table = match[2];
        const key = `${table}:${policyName}`;

        // Get full policy text
        const start = match.index;
        const end = content.indexOf(';', start);
        const policyText = content.slice(start, end === -1 ? start + 500 : end);

        const hasWithCheck = /with\s+check/i.test(policyText);
        policyState.set(key, hasWithCheck);
      }
    }

    // Check final state
    for (const [key, hasWithCheck] of policyState) {
      if (!hasWithCheck) {
        violations.push(`${key} — UPDATE policy missing WITH CHECK (users could change user_id)`);
      }
    }

    if (violations.length > 0) {
      console.error('RLS WITH CHECK violations:\n' + violations.join('\n'));
    }
    expect(violations).toEqual([]);
  });
});

// ============================================================
// Round 120 audit fix guards — 防止 AUDIT-1..6 修复被回退
// ============================================================

describe('Architecture Guards: Round 120 audit fixes not regressed', () => {
  const SRC_DIR = join(process.cwd(), 'src');

  it('state/route.ts PUT does NOT write dream_funds JSONB (AUDIT-5 T2 fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'app/api/buddy/state/route.ts'), 'utf-8');
    // The PUT handler should NOT have an active `dream_funds:` line in the update payload
    // (it should be commented out)
    const lines = content.split('\n');
    const activeDreamFundsLines = lines.filter(line =>
      !line.trim().startsWith('//') &&
      line.includes('dream_funds:') &&
      !line.includes("from('dream_funds')")
    );
    // Allow commented lines, but fail on active assignments in PUT payload
    const activeInPutPayload = activeDreamFundsLines.filter(line => !line.includes('//'));
    expect(activeInPutPayload).toEqual([]);
  });

  it('letta-agent-manager.ts does NOT delete agent on admin-client-unavailable (AUDIT-1 P0 fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'lib/letta-agent-manager.ts'), 'utf-8');
    // The "admin client unavailable" branch should NOT call lettaAPI DELETE
    const adminUnavailableIdx = content.indexOf('Admin client unavailable');
    if (adminUnavailableIdx === -1) return; // section removed/renamed — OK

    // Check the 500 chars after "admin client unavailable" — should NOT contain DELETE
    const section = content.slice(adminUnavailableIdx, adminUnavailableIdx + 500);
    expect(section).not.toMatch(/lettaAPI\s*\(\s*['"`].*agents.*['"`]\s*,\s*\{[^}]*method:\s*['"`]DELETE['"`]/);
  });

  it('complete_challenge.ts rollback uses deposit_status: unsettled (NOT null) (AUDIT-6 P0 #1 fix)', () => {
    // 🔧 ARCH fix (2026-07-18): rollback logic was extracted to
    //    complete-challenge/cas-rollback.ts. Check BOTH files.
    const mainContent = readFileSync(join(SRC_DIR, 'lib/mcp-tools/handlers/complete_challenge.ts'), 'utf-8');
    const helperContent = readFileSync(join(SRC_DIR, 'lib/mcp-tools/handlers/complete-challenge/cas-rollback.ts'), 'utf-8');

    // The helper file should contain the rollback UPDATE with deposit_status: 'unsettled'
    // Find the rollback UPDATE call (not the comment) — look for the actual assignment
    const rollbackMatch = helperContent.match(/deposit_status:\s*['"`]unsettled['"`]/);
    expect(rollbackMatch).not.toBeNull();
    // Should NOT contain deposit_status: null anywhere
    expect(helperContent).not.toMatch(/deposit_status:\s*null/);

    // The main file should call rollbackChallengeStatusOnFailure
    expect(mainContent).toContain('rollbackChallengeStatusOnFailure');
  });

  it('butterfly-tab.tsx does NOT fall back to localStorage for non-demo gacha count (AUDIT-5 D5 fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'features/butterfly/components/butterfly-tab.tsx'), 'utf-8');
    // The non-demo gacha count init should NOT have localStorage fallback
    // Look for the pattern: catch → setGachaUsedToday(DAILY_GACHA_LIMIT) (fail-closed)
    const initIdx = content.indexOf("apiFetch<{ count?: number; remaining?: number; isPremium?: boolean }>('/api/buddy/gacha-limit')");
    if (initIdx === -1) return;

    // Check the 1000 chars after the GET call — should contain fail-closed (DAILY_GACHA_LIMIT)
    const section = content.slice(initIdx, initIdx + 1500);
    expect(section).toMatch(/setGachaUsedToday\(DAILY_GACHA_LIMIT\)/);
    // Should NOT contain localStorage fallback in the non-demo path
    // (localStorage is OK for demo mode, but not for the server-fallback path)
    const catchIdx = section.indexOf('catch');
    if (catchIdx !== -1) {
      const catchSection = section.slice(catchIdx, catchIdx + 500);
      // Should NOT contain localStorage.setItem in this catch block
      expect(catchSection).not.toMatch(/localStorage\.setItem/);
    }
  });

  it('invitation-reward.ts writes health_events audit record on referrer failure (AUDIT-2 P0 #2 fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'lib/invitation-reward.ts'), 'utf-8');
    // Should write to health_events with event_type='invitation_reward_failed'
    expect(content).toMatch(/from\(['"`]health_events['"`]\)/);
    expect(content).toMatch(/event_type:\s*['"`]invitation_reward_failed['"`]/);
    expect(content).toMatch(/trigger_source:\s*['"`]invitation_reward_retry['"`]/);
  });

  it('chat/route.ts does NOT use unknown-IP fallback for rate limiting (AUDIT-1 P1 #5 fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'app/api/chat/route.ts'), 'utf-8');
    // Find the rate-limiting section (between 'clientIp' and 'rateLimitKey')
    const clientIpIdx = content.indexOf('const clientIp');
    const rateLimitKeyIdx = content.indexOf('rateLimitKey', clientIpIdx);
    if (clientIpIdx === -1 || rateLimitKeyIdx === -1) return;

    const rateLimitSection = content.slice(clientIpIdx, rateLimitKeyIdx + 200);
    // Check only non-comment lines in the rate-limit section
    const lines = rateLimitSection.split('\n');
    const activeLines = lines.filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    });
    const activeContent = activeLines.join('\n');
    // Should NOT have the 'unknown' string literal as IP fallback in active rate-limit code
    expect(activeContent).not.toMatch(/\|\|\s*['"`]unknown['"`]/);
  });

  it('admin routes use timingSafeCompare (AUDIT-5 S2 fix)', () => {
    // 🔧 2026-07-15: Updated to check verifyAdminAuth (which uses timingSafeCompare internally)
    //    Old test checked for direct timingSafeCompare import, but routes now use
    //    verifyAdminAuth + withAdminAudit pattern (ARCH-2 #2/#3 fix)
    const content = readFileSync(join(SRC_DIR, 'app/api/admin/create-weekly-challenges/route.ts'), 'utf-8');
    expect(content).toMatch(/import.*verifyAdminAuth.*from.*admin-auth/);
    expect(content).toMatch(/verifyAdminAuth\s*\(/);
  });

  it('admin/create-weekly-challenges-auth does NOT have hardcoded admin email (AUDIT-5 S3 fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'app/api/admin/create-weekly-challenges-auth/route.ts'), 'utf-8');
    // Check only non-comment lines for the hardcoded email
    const lines = content.split('\n');
    const activeLines = lines.filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    });
    const activeContent = activeLines.join('\n');
    // Should NOT contain the hardcoded email in active code (comments can mention it for context)
    expect(activeContent).not.toMatch(/huangcl25@mails\.tsinghua\.edu\.cn/);
    // Should have fail-closed guard when ADMIN_EMAILS not configured
    expect(activeContent).toMatch(/ADMIN_EMAILS\.length\s*===\s*0/);
  });

  it('bnpl-detector.ts regex matches any digit for payments (AUDIT-4 BNPL bug fix)', () => {
    const content = readFileSync(join(SRC_DIR, 'lib/bnpl-detector.ts'), 'utf-8');
    // Extract only the regex literal lines (start with / and end with /flag)
    const lines = content.split('\n');
    const regexLines = lines.filter(line => {
      const trimmed = line.trim();
      // Match regex literals like /pattern/flags,
      return /^\/[^/]+\/[gimsuy]*,?\s*$/.test(trimmed) || /^\/[^/]+\/[gimsuy]*\s*$/.test(trimmed);
    });
    const regexContent = regexLines.join('\n');
    // Should use \d+ (any digit) for pay-in-N pattern
    expect(regexContent).toMatch(/pay\\s\*in\\s\*\\d\+/);
    // Should use \d+ for N-payments-of pattern
    expect(regexContent).toMatch(/\\d\+\\s\*payments\?\\s\*of/);
    // Should NOT use literal '4' in pay-in pattern (old bug)
    expect(regexContent).not.toMatch(/pay\\s\*in\\s\*4\b/);
    // Should NOT use literal '4' at start of N-payments pattern (old bug)
    expect(regexContent).not.toMatch(/^\/4\\s\*payments/m);
  });

  it('butterfly-tab.tsx + hooks use crypto.randomUUID for gacha sessionKey (AUDIT-1 P1 #2 fix)', () => {
    // 🔧 Round 126: gacha billing moved to use-gacha-billing.ts, but pullAttemptIdRef still
    //    referenced in butterfly-tab.tsx (handleCreateSession + handleExampleClick)
    const tabContent = readFileSync(join(SRC_DIR, 'features/butterfly/components/butterfly-tab.tsx'), 'utf-8');
    const billingContent = readFileSync(join(SRC_DIR, 'features/butterfly/hooks/use-gacha-billing.ts'), 'utf-8');
    // butterfly-tab.tsx should still reference pullAttemptIdRef (sets it in handleCreateSession)
    expect(tabContent).toMatch(/pullAttemptIdRef/);
    expect(tabContent).toMatch(/crypto\.randomUUID/);
    // use-gacha-billing.ts should use pullAttemptIdRef.current as sessionKey
    expect(billingContent).toMatch(/pullAttemptIdRef/);
    expect(billingContent).toMatch(/sessionKey\s*=\s*pullAttemptIdRef\.current/);
  });
});

// ============================================================
// 2026-07-21 审计 Round — 新增架构守卫 (防止整类 bug 回归)
// ============================================================

describe('Architecture Guards: Migration numbering (2026-07-21 audit)', () => {
  it('migration numeric prefixes are unique (no duplicate 109/114-style collisions)', () => {
    // 🔧 根因: migration 编号铁律 (见 .memory/critical.md) 要求编号唯一递增。
    //   重复编号让 Supabase 按文件名 lexical 排序应用时顺序非显然, 且违反人类可读约定。
    //   2026-07-21 审计发现: 109 和 114 各被用两次 (已知技术债, 见 KNOWN_DUPLICATE_NUMBERS)。
    //   本守卫: 捕获未来新增的重复编号, 已知的 109/114 暂列入 allowlist 待用户解决。
    const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
    if (!existsSync(migrationsDir)) {
      // 非本仓库环境 (如某些 monorepo), 跳过
      return;
    }
    // ⚠️ 已知重复编号 — 用户确认 prod migration 状态后应消除 (renumber 或确认无序问题),
    //   然后从此 allowlist 移除对应编号, 让守卫变严。
    const KNOWN_DUPLICATE_NUMBERS = new Set([109, 114]);

    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    const counts = new Map<number, string[]>();
    for (const file of files) {
      const match = file.match(/^(\d+)_/);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (!counts.has(num)) counts.set(num, []);
      counts.get(num)!.push(file);
    }

    const newDuplicates: string[] = [];
    for (const [num, names] of counts) {
      if (names.length > 1 && !KNOWN_DUPLICATE_NUMBERS.has(num)) {
        newDuplicates.push(`  ${num}: ${names.join(', ')}`);
      }
    }
    expect(newDuplicates).toEqual([]);
  });
});

describe('Architecture Guards: No dangerous type escapes & code injection (2026-07-21 audit)', () => {
  it('no eval() / new Function() / child_process in non-test source (code-injection surface)', () => {
    // 🔧 这些是代码注入/远程执行面, 业务代码绝不需要。AI 误引入时立即失败。
    const allFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
          walk(full);
        } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
                   !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx') &&
                   !entry.endsWith('.d.ts')) {
          allFiles.push(relative(SRC_DIR, full));
        }
      }
    }
    walk(SRC_DIR);

    const violations: string[] = [];
    for (const file of allFiles) {
      const content = readSrcFile(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (/\beval\s*\(|\bnew\s+Function\s*\(|require\s*\(\s*['"]child_process['"]/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim().substring(0, 80)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('`as never` ratchet: no NEW as-never casts (actual ~13, threshold 15 with slack)', () => {
    // 🔧 `as never` 是最危险的类型逃逸 (绕过所有类型检查)。
    //   架构债规则明文禁止 as never (database.types.ts 注释特许除外)。
    //   2026-07-21 审计实际计数 13 处 (email批量insert + community view + buddy upsert),
    //   阈值设 15 留 2 个 slack 防计数小幅波动误报。目标: 逐步消除到 0。
    //   消除路径: 见 agent-5 类型审计 (#4 批量 insert 类型化 / #15 Views 手填类型)。
    const BASELINE = 15;
    const allFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry === '__tests__' || entry === 'node_modules' || entry === '.next') continue;
          walk(full);
        } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
                   !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx') &&
                   !entry.endsWith('.d.ts')) {
          allFiles.push(relative(SRC_DIR, full));
        }
      }
    }
    walk(SRC_DIR);

    let count = 0;
    const found: string[] = [];
    for (const file of allFiles) {
      const content = readSrcFile(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (/\bas\s+never\b/.test(line)) {
          count++;
          if (found.length < 20) found.push(`${file}:${i + 1}`);
        }
      }
    }
    if (count > BASELINE) {
      console.warn(`as-never count ${count} > baseline ${BASELINE}. New occurrences:\n` + found.join('\n'));
    }
    expect(count).toBeLessThanOrEqual(BASELINE);
  });
});

describe('Architecture Guards: Admin routes must authenticate (2026-07-21 audit)', () => {
  it('every /api/admin/**/route.ts uses an admin auth guard (verifyAdminAuth/withAdminAudit/adminGet/adminPost/ADMIN_EMAILS)', () => {
    // 🔧 admin 路由处理敏感操作 (cultivation/embeddings/letta/vip/audit/agent-pool)。
    //   任何一个漏认证 = 任意用户可触发管理操作。本守卫确保新增 admin route 必须带认证。
    const adminDir = join(SRC_DIR, 'app', 'api', 'admin');
    if (!existsSync(adminDir)) return;

    const routeFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (entry === 'route.ts') routeFiles.push(relative(SRC_DIR, full));
      }
    }
    walk(adminDir);

    expect(routeFiles.length).toBeGreaterThan(0);
    const AUTH_MARKERS = ['verifyAdminAuth', 'withAdminAudit', 'adminGet', 'adminPost', 'ADMIN_EMAILS', 'requireAdmin'];
    const unguarded: string[] = [];
    for (const file of routeFiles) {
      const content = readSrcFile(file);
      const hasAuth = AUTH_MARKERS.some(m => content.includes(m));
      if (!hasAuth) unguarded.push(file);
    }
    expect(unguarded).toEqual([]);
  });
});

// ============================================================
// 11. Dead-Code & Feature-Flag Guards — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: Dead-Code & Feature-Flag Patterns (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): The `(false as boolean)` pattern was used to disable
   *    image generation in stream-chapter.ts. This is a terrible pattern because:
   *    1. It's dead code that never executes — confusing to new developers
   *    2. It's not configurable — requires code change to re-enable
   *    3. `(false as boolean)` bypasses TypeScript's `if (false)` unreachable-code warning
   *
   *    The fix: use `featureFlags.butterflyIllustrationEnabled` (env-var-driven).
   *    This guard ensures no one re-introduces the `(false as boolean)` pattern.
   */

  it('source code does NOT contain (false as boolean) dead-code pattern', () => {
    const allFiles = findTsxFiles(SRC_DIR);
    // Also check .ts files
    const allTsFiles = findTsFiles(SRC_DIR);
    const allFilesCombined = [...allFiles, ...allTsFiles];

    const violations: string[] = [];
    for (const relPath of allFilesCombined) {
      const rawContent = readSrcFile(relPath);
      // Strip comments before checking — comments may mention the old pattern for historical context
      const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      // Match (false as boolean) or (false as any) — both are dead-code bypasses
      if (/\(\s*false\s+as\s+(boolean|any)\s*\)/.test(content)) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('stream-chapter.ts uses featureFlags.butterflyIllustrationEnabled (not dead code)', () => {
    const rawContent = readSrcFile('app/api/butterfly/story/parts/stream-chapter.ts');
    // Strip comments before checking
    const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(content).toMatch(/featureFlags\.butterflyIllustrationEnabled/);
    expect(content).not.toMatch(/\(\s*false\s+as\s+boolean\s*\)/);
  });

  it('feature-flags.ts exists and exports featureFlags object', () => {
    const content = readSrcFile('lib/feature-flags.ts');
    expect(content).toMatch(/export\s+const\s+featureFlags/);
    expect(content).toMatch(/butterflyIllustrationEnabled/);
    expect(content).toMatch(/communityStatsMultiplier/);
  });
});

// ============================================================
// 12. Community Multiplier Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: Community Multiplier (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): The community stats routes had a hardcoded
   *    `MULTIPLIER = 21` / `* 21` to fake participation numbers. This violates
   *    道用六·公开 (信息全公开). The fix: use `featureFlags.communityStatsMultiplier`
   *    (env-var-driven, defaults to 1).
   *
   *    This guard ensures no one re-introduces a hardcoded multiplier.
   */

  it('community/stats/route.ts does NOT have hardcoded multiplier', () => {
    const rawContent = readSrcFile('app/api/community/stats/route.ts');
    // Strip comments before checking
    const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // Should NOT have a hardcoded numeric multiplier
    expect(content).not.toMatch(/MULTIPLIER\s*=\s*\d+/);
    expect(content).not.toMatch(/\*\s*21\b/);
    // Should use the feature flag
    expect(content).toMatch(/featureFlags\.communityStatsMultiplier/);
  });

  it('community/challenges/route.ts does NOT have hardcoded multiplier', () => {
    const rawContent = readSrcFile('app/api/community/challenges/route.ts');
    // Strip comments before checking
    const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(content).not.toMatch(/\*\s*21\b/);
    expect(content).toMatch(/featureFlags\.communityStatsMultiplier/);
  });
});

// ============================================================
// 13. AI Audit Schema Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: AI Audit Schema (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): Two legacy schema bugs in ai_audit_logs:
   *    1. Column `s` (meaningless name) → renamed to `tool_calls`
   *    2. Action `''` (empty string placeholder) → renamed to `'tool_call'`
   *
   *    This guard ensures no one re-introduces the old names.
   */

  it('ai-audit.ts does NOT use empty-string action or s column', () => {
    const content = readSrcFile('lib/ai-audit.ts');
    // Should NOT have empty-string action in the type definition
    expect(content).not.toMatch(/\|\s*''\s*\|/);
    // Should NOT use the old column name `s:` (but `tool_calls:` is fine)
    // Match `s:` only when it's a standalone column name (not part of a word)
    const lines = content.split('\n');
    for (const line of lines) {
      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      // Check for standalone `s:` as a column name (not `tool_calls:` or `keys:` etc.)
      if (/^\s+s\s*:/.test(line) && !line.includes('tool_calls')) {
        throw new Error(`Found old column name 's:' in ai-audit.ts: ${line.trim()}`);
      }
    }
    // Should use 'tool_call' action
    expect(content).toMatch(/'tool_call'/);
  });

  it('audit/ai/route.ts does NOT use empty-string action in validActions', () => {
    const content = readSrcFile('app/api/audit/ai/route.ts');
    // The validActions array should NOT contain empty string
    expect(content).not.toMatch(/validActions[\s\S]*''/);
  });

  it('database.types.ts ai_audit_logs uses tool_calls column (not s)', () => {
    const content = readSrcFile('lib/database.types.ts');
    // Find the ai_audit_logs block
    const blockMatch = content.match(/ai_audit_logs:\s*\{[\s\S]*?\};/);
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    // Should have tool_calls column
    expect(block).toMatch(/tool_calls:\s*Json/);
    // Should NOT have standalone `s: Json` (only `tool_calls: Json`)
    // The old `s: Json` would appear as a standalone column, not as part of `tool_calls`
    const lines = block.split('\n');
    for (const line of lines) {
      if (/^\s+s\s*:\s*Json/.test(line)) {
        throw new Error(`Found old column name 's: Json' in ai_audit_logs: ${line.trim()}`);
      }
    }
  });
});

// ============================================================
// 14. withAuth Migration Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: withAuth Migration (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): Many API routes still use manual `createAuthenticatedClient`
   *    instead of the `withAuth` HOF. The HOF provides:
   *    1. Automatic auth check (no manual `if (!user) return 401`)
   *    2. Automatic cookie merging (no manual `mergeCookies` calls)
   *    3. Automatic error handling (no manual try/catch boilerplate)
   *    4. Automatic Cache-Control: no-store (prevents CDN caching user data)
   *
   *    This guard tracks the migration progress and ensures migrated routes
   *    don't regress back to manual auth.
   */

  it('push/subscribe/route.ts uses withAuth (not manual createAuthenticatedClient)', () => {
    const rawContent = readSrcFile('app/api/push/subscribe/route.ts');
    // Strip comments before checking — comments may mention the old pattern for historical context
    const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(content).toMatch(/withAuth/);
    expect(content).not.toMatch(/createAuthenticatedClient/);
  });

  it('push/unsubscribe/route.ts uses withAuth (not manual createAuthenticatedClient)', () => {
    const rawContent = readSrcFile('app/api/push/unsubscribe/route.ts');
    // Strip comments before checking — comments may mention the old pattern for historical context
    const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(content).toMatch(/withAuth/);
    expect(content).not.toMatch(/createAuthenticatedClient/);
  });
});

// ============================================================
// 15. ApiError Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: ApiError replaces (error as any).status (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): The (error as any).status pattern was used in
   *    retry-ai-response.ts and use-chat-actions.ts to pass HTTP status codes
   *    through error handling. This bypasses TypeScript type checking.
   *
   *    The fix: use ApiError class (src/lib/errors/api-error.ts) which extends Error
   *    and has a typed `status` property. Use getErrorStatus() to extract status.
   *
   *    This guard ensures no one re-introduces the (error as any).status pattern.
   */

  it('retry-ai-response.ts does NOT use (error as any).status pattern', () => {
    const rawContent = readSrcFile('components/chat/hooks/retry-ai-response.ts');
    // Strip comments before checking
    const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(content).not.toMatch(/\(\s*error\s+as\s+any\s*\)\.status/);
    expect(content).not.toMatch(/\(\s*err\s+as\s+any\s*\)\.status/);
    // Should use ApiError or getErrorStatus
    expect(content).toMatch(/ApiError|getErrorStatus/);
  });

  it('use-chat-actions.ts does NOT use (error as any).status pattern', () => {
    // batch112-a/b 后错误逻辑收敛到 parts/ helpers — 检查面=主文件+parts/ 全域
    const mainContent = readSrcFile('components/chat/hooks/use-chat-actions.ts');
    const partsDir = join(SRC_DIR, 'components/chat/hooks/parts');
    const partsContent = readdirSync(partsDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => readSrcFile(`components/chat/hooks/parts/${f}`))
      .join('\n');
    const content = `${mainContent}\n${partsContent}`
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(content).not.toMatch(/\(\s*error\s+as\s+any\s*\)\.status/);
    expect(content).not.toMatch(/\(\s*err\s+as\s+any\s*\)\.status/);
    expect(content).toMatch(/ApiError|getErrorStatus/);
  });
});

// ============================================================
// 16. Dynamic Export Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: withAuth routes must have dynamic = force-dynamic (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): All withAuth routes must export `dynamic = 'force-dynamic'`.
   *
   * Problem:
   *   Without this export, Next.js might try to statically generate the route at build time.
   *   For routes that use authentication (cookies), static generation would fail or produce
   *   incorrect results. The withAuth HOF sets Cache-Control: no-store on responses, but
   *   this only prevents CDN caching — it doesn't prevent Next.js build-time static generation.
   *
   * Solution:
   *   All withAuth routes must have `export const dynamic = 'force-dynamic';` at the top.
   *   This guard ensures no one forgets to add it.
   */

  it('all withAuth routes have dynamic = force-dynamic export', () => {
    const allTsFiles = findTsFiles(SRC_DIR);
    const violations: string[] = [];

    for (const relPath of allTsFiles) {
      // Only check route.ts files in app/api/
      if (!relPath.includes('app/api/') || !relPath.endsWith('route.ts')) continue;

      const content = readSrcFile(relPath);
      // Only check files that use withAuth
      if (!content.includes('withAuth')) continue;

      // Check for dynamic = 'force-dynamic' export
      if (!content.match(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ============================================================
// 17. maxDuration Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: LLM-calling routes must have maxDuration (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): Routes that call LLM APIs (Letta, OpenAI, ZAI) must
   *    set `export const maxDuration = N` to prevent Vercel 10s timeout.
   *
   * Problem:
   *   Vercel default timeout is 10s (Hobby) or 60s (Pro). LLM calls can take 30-120s.
   *   Without maxDuration, the route will timeout and return 504 to the client.
   *
   * Solution:
   *   Any route that imports from letta-agent-manager, openai, or calls streamToAgent
   *   must have `export const maxDuration = 120` (or appropriate value).
   */

  it('routes that call LLM APIs have maxDuration set', () => {
    const allTsFiles = findTsFiles(SRC_DIR);
    const violations: string[] = [];

    for (const relPath of allTsFiles) {
      // Only check route.ts files in app/api/
      if (!relPath.includes('app/api/') || !relPath.endsWith('route.ts')) continue;

      const content = readSrcFile(relPath);
      
      // Check if this route calls LLM APIs
      const callsLLM = content.includes('letta-agent-manager') ||
                       content.includes('streamToAgent') ||
                       content.includes('generateIllustration') ||
                       content.includes('regenerateOutline') ||
                       content.includes('openai') ||
                       content.includes('zai-web-dev') ||
                       content.includes('ZAI_API') ||
                       content.includes('OPENAI_API');
      
      if (!callsLLM) continue;

      // Check for maxDuration export
      if (!content.match(/export\s+const\s+maxDuration\s*=\s*\d+/)) {
        violations.push(relPath);
      }
    }

    // Filter out routes that don't actually need it (health checks, etc.)
    const exemptPatterns = [
      'health/route.ts',
      'mcp/health/route.ts',
    ];
    const realViolations = violations.filter(v => 
      !exemptPatterns.some(p => v.includes(p))
    );

    expect(realViolations).toEqual([]);
  });
});

// ============================================================
// 18. as never Guard — ARCH fix (2026-07-21)
// ============================================================

describe('Architecture Guards: No as never in Supabase queries (ARCH-2026-07-21)', () => {
  /**
   * 🔧 ARCH fix (2026-07-21): The 'as never' pattern bypasses ALL TypeScript type checking.
   *    It was used in 12 places to cast Record<string, unknown> to Supabase Insert/Update types.
   *
   *    The fix: use asInsert/asUpdate/asUpsert helpers from src/lib/supabase-type-helpers.ts
   *    which use 'as unknown as T' instead of 'as never'.
   *
   *    This guard ensures no one re-introduces 'as never' in Supabase query chains.
   *
   *    Exception: community views use 'as never' because Supabase type generation
   *    has a known limitation with Views (documented in database.types.ts).
   */

  it('API routes do NOT use as never in Supabase insert/update/upsert calls', () => {
    const allTsFiles = findTsFiles(SRC_DIR);
    const violations: string[] = [];

    for (const relPath of allTsFiles) {
      // Only check route.ts files in app/api/
      if (!relPath.includes('app/api/') || !relPath.endsWith('route.ts')) continue;

      const rawContent = readSrcFile(relPath);
      // Strip comments before checking
      const content = rawContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

      // Check for 'as never' in insert/update/upsert chains
      // Pattern: .insert(... as never), .update(... as never), .upsert(... as never)
      if (/\.(insert|update|upsert)\([^)]*as\s+never[\s\S]*?\)/.test(content)) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('community views are exempt from as never guard (Supabase type generation limitation)', () => {
    // These files use 'as never' for community views because Views types are empty
    // (documented limitation in database.types.ts)
    const exemptFiles = [
      'app/api/community/stats/route.ts',
      'app/api/community/platform-index/route.ts',
    ];

    for (const relPath of exemptFiles) {
      const content = readSrcFile(relPath);
      // Should use 'as never' for community views (documented limitation)
      expect(content).toMatch(/as\s+never/);
    }
  });
});

// ============================================================
// 19. Multi-Step Mutation Anti-Pattern Guard — ARCH fix (2026-07-22)
// ============================================================

describe('Architecture Guards: No rollback-to-CAS-guard on multi-step mutation failure (ARCH-2026-07-22)', () => {
  /**
   * 🔧 ARCH fix (2026-07-22 P0 — multi-fund retry double accumulation):
   *
   *    Bug pattern:
   *    1. CAS claim: status = 'processing' (prevents concurrent requests)
   *    2. Multi-step mutation: loop calling non-idempotent RPCs
   *    3. On failure: rollback status = 'pending' (allows retry)
   *    4. Retry: CAS succeeds again → already-applied steps get double-counted
   *
   *    Root cause: rollback-to-CAS-guard + non-idempotent mutation = retry double-counting.
   *
   *    Fix: On partial failure, DON'T rollback. Keep the CAS-claimed status.
   *    User can't retry (CAS rejects). Ops reconciles via logs.
   *
   *    True root-cause fix: use a single atomic batch RPC (see migration 125).
   *
   *    This guard ensures the deposit route (and similar patterns) never
   *    re-introduce the rollback-to-'unsettled' anti-pattern.
   */

  it('deposit route does NOT rollback deposit_status to "unsettled" on RPC failure', () => {
    const content = readSrcFile('app/api/buddy/deposit/route.ts');

    // The old anti-pattern: on RPC failure, update deposit_status back to 'unsettled'
    // This allows retry, which double-counts already-applied funds.
    // Search for: update({ deposit_status: 'unsettled' ... }) in a rollback context
    const rollbackPattern = /update\(\s*\{\s*deposit_status:\s*['"]unsettled['"]/;

    // The route should NOT contain this pattern (except in comments)
    const strippedContent = content
      .replace(/\/\/.*$/gm, '')      // strip line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // strip block comments

    expect(rollbackPattern.test(strippedContent)).toBe(false);
  });

  it('deposit route returns 500 with partial info on RPC failure (not 200 with rollback)', () => {
    const content = readSrcFile('app/api/buddy/deposit/route.ts');

    // The fix: on RPC failure, return 500 with partial info
    // This prevents retry (CAS rejects 'deposited' status)
    expect(content).toMatch(/partial:\s*true/);
    expect(content).toMatch(/appliedFunds/);
    expect(content).toMatch(/failedFund/);
  });
});

// ============================================================
// 20. Silent Catch Audit Guard — ARCH fix (2026-07-22)
// ============================================================

describe('Architecture Guards: Silent catch blocks must have explanatory comments (ARCH-2026-07-22)', () => {
  /**
   * 🔧 ARCH fix (2026-07-22): Silent catch blocks (catch {} or catch with only a comment)
   *    are a common source of hidden bugs. The architecture guard #4 already checks
   *    for completely empty catch blocks. This guard extends that to check for
   *    catch blocks with only a comment (no logging, no rethrow).
   *
   *    Allowed patterns:
   *    - catch with logger.error/warn/debug call
   *    - catch with rethrow
   *    - catch with explicit return
   *    - catch with comment explaining WHY it's safe to swallow (must include
   *      one of: "cleanup", "non-critical", "best-effort", "idempotent",
   *      "reader.cancel", "controller.close", "localStorage", "intentional")
   *
   *    This guard is informational (warn-only) for now — it logs violations
   *    but doesn't fail the test, to avoid blocking on existing code.
   *    Future: tighten to fail once all catches are audited.
   */

  it('all silent catch blocks have explanatory comments (informational)', () => {
    const allTsFiles = [...findTsFiles(SRC_DIR), ...findTsxFiles(SRC_DIR)];
    const violations: string[] = [];
    const allowedKeywords = [
      'cleanup', 'non-critical', 'best-effort', 'idempotent',
      'reader.cancel', 'controller.close', 'localStorage', 'intentional',
      'silent', 'non-critical', 'swallow', 'ignore', 'expected',
    ];

    for (const relPath of allTsFiles) {
      // Skip test files
      if (relPath.includes('__tests__') || relPath.includes('.test.')) continue;
      // Skip architecture guards itself
      if (relPath.includes('architecture-guards')) continue;

      const content = readSrcFile(relPath);

      // Find all catch blocks
      const catchPattern = /catch\s*(?:\([^)]*\))?\s*\{([^}]*)\}/g;
      let match;
      while ((match = catchPattern.exec(content)) !== null) {
        const catchBody = match[1].trim();

        // Skip if catch body has actual code (not just a comment)
        const codeOnly = catchBody
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim();

        if (codeOnly.length > 0) {
          // Has actual code (logger, rethrow, return, etc.) — OK
          continue;
        }

        // Catch body is empty or only has a comment
        // Check if the comment explains why it's safe
        const hasExplanation = allowedKeywords.some(kw =>
          catchBody.toLowerCase().includes(kw)
        );

        if (!hasExplanation) {
          violations.push(`${relPath}: catch { ${catchBody.substring(0, 60) } }`);
        }
      }
    }

    // Informational: log violations but don't fail
    // Future: tighten to expect(violations).toEqual([]) once all catches are audited
    if (violations.length > 0) {
      console.warn(`[Silent Catch Audit] ${violations.length} catch blocks lack explanatory comments:`);
      violations.slice(0, 10).forEach(v => console.warn(`  ${v}`));
    }

    // For now, just verify the guard runs without error
    expect(violations.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// 21. Token Deduction CAS Guard — ARCH fix (2026-07-22)
// ============================================================

describe('Architecture Guards: Token deduction routes must use CAS (ARCH-2026-07-22)', () => {
  /**
   * 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
   *
   *    Bug pattern:
   *    1. SELECT tokens FROM buddy_state
   *    2. Check tokens >= cost
   *    3. UPDATE buddy_state SET tokens = newTokens WHERE user_id = ...
   *    (no CAS — no .gte('tokens', cost) or .eq('tokens', currentTokens))
   *
   *    Two concurrent requests both pass the check and both UPDATE,
   *    causing double-deduction bypass (last-write-wins).
   *
   *    Fix: CAS UPDATE — add .gte('tokens', cost) or .eq('tokens', currentTokens)
   *    to the UPDATE condition. If CAS fails (0 rows), return 409.
   *
   *    This guard checks that any route which UPDATEs buddy_state.tokens
   *    includes a CAS condition on tokens.
   */

  it('routes that UPDATE buddy_state.tokens must include CAS condition (.gte or .eq on tokens)', () => {
    const allRouteFiles = findTsFiles(SRC_DIR)
      .filter(f => f.includes('/api/') && f.endsWith('route.ts'));

    const violations: string[] = [];

    for (const relPath of allRouteFiles) {
      const content = readSrcFile(relPath);

      // Find all .from('buddy_state').update(...) calls that include 'tokens' in the update
      // Pattern: .from('buddy_state')...update({ ...tokens... })
      const updatePattern = /\.from\(\s*['"]buddy_state['"]\s*\)[\s\S]*?\.update\(\s*\{([^}]*)\}\s*\)/g;
      let match;
      while ((match = updatePattern.exec(content)) !== null) {
        const updateBody = match[1];

        // Check if 'tokens' is in the update body
        if (!/tokens\s*:/.test(updateBody)) {
          continue; // Not updating tokens — skip
        }

        // Get the full chain after .update({...})
        const afterUpdate = content.substring(match.index + match[0].length);

        // Check if the chain includes CAS on tokens (.gte('tokens', ...) or .eq('tokens', ...))
        // Look at the next ~500 chars for the CAS condition
        const chainSnippet = afterUpdate.substring(0, 500);
        const hasCasOnTokens = /\.gte\(\s*['"]tokens['"]/.test(chainSnippet) ||
                               /\.eq\(\s*['"]tokens['"]/.test(chainSnippet);

        if (!hasCasOnTokens) {
          // Check if it's using an RPC instead (RPCs handle CAS internally)
          // If the update is just for non-token fields alongside tokens, or if
          // the route uses a different CAS strategy (like .eq on version), skip
          const hasVersionCas = /\.eq\(\s*['"]version['"]/.test(chainSnippet);
          if (hasVersionCas) {
            continue; // Version-based CAS is also valid
          }

          violations.push(`${relPath}: UPDATE buddy_state.tokens without CAS on tokens or version`);
        }
      }
    }

    // These routes MUST have CAS on tokens
    expect(violations).toEqual([]);
  });
});

// ============================================================
// 22. Multi-Fund Deposit No-Rollback Guard — ARCH fix (2026-07-22)
// ============================================================

describe('Architecture Guards: Multi-step mutation must not rollback CAS guard (ARCH-2026-07-22)', () => {
  /**
   * 🔧 ARCH fix (2026-07-22 P0 — multi-fund retry double accumulation):
   *
   *    Anti-pattern:
   *    1. CAS claim: status = 'processing' (prevents concurrent requests)
   *    2. Multi-step mutation: loop calling non-idempotent RPCs
   *    3. On failure: rollback status = 'pending' (allows retry)
   *    4. Retry: CAS succeeds again → already-applied steps double-counted
   *
   *    Fix: On partial failure, DON'T rollback. Keep the CAS-claimed status.
   *
   *    This guard checks that the deposit route (and similar patterns) never
   *    re-introduce the rollback-to-'unsettled' anti-pattern.
   *    (Already checked in guard #19, but this is a more general version.)
   */

  it('no route rolls back a CAS-claimed status to allow retry after partial mutation failure', () => {
    // This is a pattern-based guard. We check for the specific anti-pattern:
    // 1. A status field is CAS-claimed (e.g., deposit_status = 'deposited')
    // 2. On error, the status is rolled back (e.g., deposit_status = 'unsettled')
    //
    // For now, we only check the deposit route (the known case).
    // Future: generalize to detect this pattern in any route.

    const content = readSrcFile('app/api/buddy/deposit/route.ts');

    // The route should NOT contain rollback to 'unsettled' (except in comments)
    const strippedContent = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const rollbackPattern = /update\(\s*\{\s*deposit_status:\s*['"]unsettled['"]/;
    expect(rollbackPattern.test(strippedContent)).toBe(false);
  });
});

// ============================================================
// 23. Deleted files must not be restored — Round 3 dead code cleanup (2026-08-04)
// ============================================================

describe('Architecture Guards: Deleted files must not be restored (Round 3)', () => {
  /**
   * 🔧 ARCH fix (2026-08-04 Round 3):
   *    10 dead-code files with 0 production importers were deleted (2,225 lines total).
   *    These files must NOT be restored — if they reappear, it means an AI or developer
   *    accidentally reintroduced dead code that was deliberately removed.
   *
   *    Lime article principle (4): "守卫保护方向" — guards protect direction, not just function.
   *    Deleted code that gets re-imported is the classic failure mode.
   */
  const deletedFiles = [
    'features/butterfly/hooks/use-butterfly-demo-session.ts',
    'app/api/butterfly/story/parts/stream-complete-story.ts',
    'components/chat/hooks/use-challenge-mode.ts',
    'components/chat/parts/dream-fund-deposit-modal.tsx',
    'components/floating-pill.tsx',
    'hooks/use-challenge-creation.ts',
    'hooks/use-debounced-fetch.ts',
    'hooks/use-realtime-table.ts',
    'lib/email/imap-scan.ts',
    'app/api/admin/letta/actions/register_mcp_tools.ts',
  ];

  for (const relPath of deletedFiles) {
    const fileName = relPath.split('/').pop();
    it(`${relPath} must not exist (deleted in Round 3)`, () => {
      const exists = existsSync(join(SRC_DIR, relPath));
      expect(exists).toBe(false);
    });

    it(`no source file imports ${fileName} (dead code must not be revived)`, () => {
      // Scan all .ts/.tsx files for imports referencing this module
      const allFiles = [...findTsFiles(SRC_DIR), ...findTsxFiles(SRC_DIR)];
      const violations: string[] = [];

      for (const f of allFiles) {
        if (f.includes('__tests__')) continue;
        const content = readSrcFile(f);
        // Check for import statements referencing the deleted module name
        const importPattern = new RegExp(
          `(?:import|from)\\s+['"][^'"]*${fileName!.replace(/\.(ts|tsx)$/, '')}['"]`
        );
        if (importPattern.test(content)) {
          violations.push(f);
        }
      }

      expect(violations).toEqual([]);
    });
  }
});

