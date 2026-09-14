import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const blogDirectory = path.join(process.cwd(), 'src/app/[locale]/blog');
const readBlogSource = (page: string) => readFileSync(path.join(blogDirectory, page), 'utf8');

describe('blog guardian exit', () => {
  it('adds a locale-aware Symy exit to the prison essay', () => {
    const source = readBlogSource('the-prison-of-attachment/page.tsx');

    expect(source).toContain('松开这只手，可以有人陪你');
    expect(source).toContain("You don't have to loosen the grip alone");
    expect(source).toContain('认识小象 Symy 🐘');
    expect(source).toContain('Meet Symy 🐘');
    expect(source).toContain('href={`/${locale}`}');
  });

  it.each(['page.tsx', 'algorithm-decode-001/page.tsx', 'the-prison-of-attachment/page.tsx'])(
    'uses the brand green palette in %s',
    (page: string) => {
      const source = readBlogSource(page);

      expect(source).not.toContain(['text-cyan', '-400'].join(''));
      expect(source).not.toContain(['from', 'cyan'].join('-'));
      expect(source).not.toContain(['to', 'purple'].join('-'));
    },
  );

  it('keeps the dream-fund promise in both decode languages', () => {
    const source = readBlogSource('algorithm-decode-001/page.tsx');

    expect(source).toContain('守住的钱真实流进你的梦想基金');
    expect(source).toContain('flows into your real dream fund');
  });
});
