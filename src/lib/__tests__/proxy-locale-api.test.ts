import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔒 09-29 锁: /{locale}/api/* 必须 308 到无前缀 /api/*
 * 背景: /zh/api/health 之前穿透 next-intl 落进 [locale]/[...slug] 兜底页
 * 返回 200 HTML — 监控配带 locale 的 API 路径会假绿。
 *
 * 注: proxy.ts 的完整 import 链 (next-intl middleware ESM) 无法在 vitest
 * 环境加载 (next/server ESM 解析问题), 故按 architecture-guards 同款
 * 源码断言模式锁行为; 行为本身由部署后 curl 验证 (见 commit message)。
 */

const SRC_DIR = join(__dirname, '..', '..');
const proxySource = readFileSync(join(SRC_DIR, 'proxy.ts'), 'utf-8');

describe('proxy: locale-prefixed API redirect (09-29 fix)', () => {
  it('has the locale+API regex redirect rule at the top of proxy()', () => {
    // 规则存在: 匹配 /^\/(en|zh)\/(api\/.*)$/
    expect(proxySource).toContain('/^\\/(en|zh)\\/(api\\/.*)$/');
  });

  it('redirects with 308 preserving the rest of the path', () => {
    expect(proxySource).toContain('NextResponse.redirect(url, 308)');
    expect(proxySource).toMatch(/url\.pathname = `\/\$\{apiWithLocale\[2\]\}`/);
  });

  it('rule runs BEFORE next-intl Step 1 (early return)', () => {
    const ruleIdx = proxySource.indexOf('apiWithLocale');
    const intlIdx = proxySource.indexOf('intlMiddleware(request)');
    expect(ruleIdx).toBeGreaterThan(-1);
    expect(intlIdx).toBeGreaterThan(ruleIdx);
  });

  it('clone preserves query string (url.clone not string concat)', () => {
    expect(proxySource).toContain('request.nextUrl.clone()');
  });
});
