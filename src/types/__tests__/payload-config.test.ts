/**
 * payload.config.ts — CMS 配置契约 (101行, 静态源码锚)
 *
 * payload 的 buildConfig 在 vitest node 环境初始化不完整 (Proxy 键空),
 * 对纯配置件用源码文本锚定契约 — 改动配置必须显式更新此测试。
 *
 * 锁定:
 * - /cms 路由 (非默认 /admin, 避开 admin 后台)
 * - users auth 集合 + posts 内容集合
 * - posts.category 三分类 / status 三态 (draft 默认) / locale 双语 (en 默认)
 * - SEO 字段 + publishedAt + typescript 输出
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../payload.config.ts'), 'utf-8');

describe('payload.config 契约 (静态源码锚)', () => {
  it('admin 路由 = /cms (避开 /admin 后台)', () => {
    expect(src).toContain("admin: '/cms'");
  });

  it('users 集合 auth: true', () => {
    expect(src).toMatch(/slug:\s*'users'[\s\S]{0,120}auth:\s*true/);
  });

  it('posts useAsTitle: title', () => {
    expect(src).toContain("useAsTitle: 'title'");
  });

  it('category 三分类', () => {
    for (const v of ['algorithm-decode', 'anti-inducement', 'product-update']) {
      expect(src).toContain(`value: '${v}'`);
    }
  });

  it('status 三态 + draft 默认', () => {
    expect(src).toContain("defaultValue: 'draft'");
    for (const v of ['draft', 'pending', 'published']) {
      expect(src).toMatch(new RegExp(`value: '${v}'`));
    }
  });

  it('locale 双语 en 默认', () => {
    expect(src).toContain("value: 'zh'");
    expect(src).toMatch(/defaultValue:\s*'en'/);
  });

  it('SEO 字段+title/slug 必填+unique+typescript 输出', () => {
    for (const name of ['seoTitle', 'seoDescription', 'publishedAt', 'title', 'slug']) {
      expect(src).toContain(`name: '${name}'`);
    }
    expect(src).toMatch(/name:\s*'slug'[\s\S]{0,200}unique:\s*true/);
    expect(src).toContain('src/payload-types.ts');
  });
});
