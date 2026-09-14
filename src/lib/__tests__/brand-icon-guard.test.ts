import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const publicDir = path.resolve(import.meta.dirname, '../../../public');

async function getCenterAverages(filePath: string, cropScale = 0.5) {
  const image = sharp(filePath);
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error(`Unable to read dimensions for ${filePath}`);

  const left = Math.round((width * (1 - cropScale)) / 2);
  const top = Math.round((height * (1 - cropScale)) / 2);
  const cropWidth = Math.round(width * cropScale);
  const cropHeight = Math.round(height * cropScale);
  const stats = await image.extract({ left, top, width: cropWidth, height: cropHeight }).stats();
  return stats.channels.map((channel) => channel.mean);
}

describe('brand icon guard', () => {
  it('keeps the primary icon as a valid green-dominant 1024px PNG', async () => {
    const filePath = path.join(publicDir, 'icon-1024.png');
    const magicNumber = readFileSync(filePath).subarray(0, 4);
    expect([...magicNumber]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);

    const [red, green, blue] = await getCenterAverages(filePath);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it('keeps the favicon green-dominant', async () => {
    const filePath = path.join(publicDir, 'favicon-32.png');
    const metadata = await sharp(filePath).metadata();
    expect(metadata.format).toBe('png');

    const [red, green, blue] = await getCenterAverages(filePath, 0.8);
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it('resolves every icon referenced by the manifest', () => {
    const manifest = JSON.parse(readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
    for (const icon of manifest.icons) {
      const iconPath = path.join(publicDir, icon.src.replace(/^\//, ''));
      expect(iconPath.startsWith(publicDir)).toBe(true);
      expect(() => readFileSync(iconPath)).not.toThrow();
    }
  });
});
