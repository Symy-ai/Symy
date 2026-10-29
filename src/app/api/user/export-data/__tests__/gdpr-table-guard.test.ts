import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔧 R1228: GDPR 导出清单自动对账守卫 (#29 收编 R1227 观察)
 *
 * 现有 route.test.ts 锁「已列 15 表必导出」(存量), 但新表上线后漏加导出
 * 清单时测试不红 (增量缺口)。本守卫从 database.types.ts (Supabase 生成物)
 * 解析全部表名, 与 export-data route 的 .from() 消费清单对账:
 *
 *   差集 (数据库有 / 导出没有) - 白名单 = 必须为空
 *
 * 白名单 = 系统表 + 非用户数据表, 每项带论证。新表上线后此测试会红,
 * 逼开发者二选一: 加进导出清单 (用户数据) 或加进白名单 (+ 论证)。
 * 零维护: database.types.ts 由 supabase gen types 生成, 表清单自动更新。
 */

const ROUTE_PATH = join(
  process.cwd(),
  'src/app/api/user/export-data/route.ts'
);
const TYPES_PATH = join(process.cwd(), 'src/lib/database.types.ts');

/** 非用户数据表 — 不参与 GDPR Article 15 导出 (每项带论证) */
const EXPORT_EXEMPT = new Set([
  'admin_audit_logs', // 运营审计 — 无 user_id 维度的个人数据
  'admin_jobs', // 运营任务队列 — 系统内部状态
  'ai_audit_logs', // AI 治理审计 — 按用户协议为匿名聚合 (无个人数据列)
  'app_config', // 全局配置 — 非用户数据
  'distributed_locks', // 分布式锁 — 系统内部状态
  'email_connections', // 凭据级敏感 (IMAP 授权码) — GDPR 导出不含凭据, 仅 email_receipts 消费面
  'daily_stats', // 死功能表 (R1214 定案, 待 owner 清理) — 无人读
  'letta_agent_pool', // 系统池 — 内部状态
  'letta_agent_pool_config', // 系统池配置 — 内部状态
  'landing_waitlist', // 匿名候补名单 — 无账号关联 (仅邮箱, 不属登录用户导出)
  'transparency_subscribers', // 匿名订阅 — 同上
  'transparency_snapshots', // 透明报告快照 — 公共数据非个人数据
  'community_challenges', // 社区挑战定义 — 公共内容 (参与记录在 challenge_participants, 已导出)
  'cart_lines', // 购物车行 — 草稿态, 语义上属 challenge 流 (active_challenges 已导出); 留观 R1228
  'channel_bind_codes', // T11 一次性绑定码 — 5min TTL 活码导出即泄露 (拿到导出文件者可在 TTL 内 /start CODE 抢绑); 消费后即失效, 绑定关系本体在 channel_bindings (已导出); R2631
]);

/** 从 route.ts 提取 .from('xxx') 消费表名 */
function extractExportedTables(): Set<string> {
  const source = readFileSync(ROUTE_PATH, 'utf-8');
  const tables = new Set<string>();
  for (const match of source.matchAll(/\.from\('([a-z_]+)'\)/g)) {
    tables.add(match[1]);
  }
  if (tables.size === 0) throw new Error('export-data route 解析出 0 张表 — 正则或文件路径失效');
  return tables;
}

/** 从 database.types.ts Tables 块提取全部表名 */
function extractDatabaseTables(): Set<string> {
  const source = readFileSync(TYPES_PATH, 'utf-8');
  const start = source.indexOf('Tables: {');
  if (start === -1) throw new Error('database.types.ts 无 Tables 块 — 生成物格式变化');
  const end = source.indexOf('Views: {', start);
  const block = source.slice(start, end === -1 ? undefined : end);
  const tables = new Set<string>();
  for (const match of block.matchAll(/^ {6}([a-z_]+): \{$/gm)) {
    tables.add(match[1]);
  }
  if (tables.size < 10) throw new Error(`database.types.ts 只解析到 ${tables.size} 张表 — 生成物格式变化`);
  return tables;
}

describe('GDPR 导出清单自动对账守卫 (R1228)', () => {
  it('数据库每张用户数据表都在导出清单或带论证白名单中', () => {
    const dbTables = extractDatabaseTables();
    const exported = extractExportedTables();
    const missing: string[] = [];
    for (const table of dbTables) {
      if (!exported.has(table) && !EXPORT_EXEMPT.has(table)) {
        missing.push(table);
      }
    }
    expect(
      missing,
      `新表未入 GDPR 导出清单: ${missing.join(', ')} — 二选一: ①route.ts 加导出段 (用户数据) ②本文件 EXPORT_EXEMPT 加白名单+论证`
    ).toEqual([]);
  });

  it('导出清单里的表都真实存在 (防删表后清单滞留)', () => {
    const dbTables = extractDatabaseTables();
    const exported = extractExportedTables();
    const ghosts = [...exported].filter((t) => !dbTables.has(t));
    expect(ghosts, `导出清单含已不存在的表: ${ghosts.join(', ')} — 从 route.ts 删除`).toEqual([]);
  });

  it('白名单每项都有论证注释 (防裸豁免)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/api/user/export-data/__tests__/gdpr-table-guard.test.ts'),
      'utf-8'
    );
    const exemptBlock = source.slice(source.indexOf('EXPORT_EXEMPT'), source.indexOf('});', source.indexOf('EXPORT_EXEMPT')));
    for (const line of exemptBlock.split('\n')) {
      const m = line.match(/^\s*'([a-z_]+)',\s*\/\/\s*(.+)$/);
      if (m) {
        expect(m[2].length, `白名单 ${m[1]} 论证过短`).toBeGreaterThan(5);
      }
    }
  });
});
