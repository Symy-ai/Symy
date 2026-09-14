import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MCP_SERVER_INSTRUCTIONS } from '../mcp-auth';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sourcePaths = [
  'src/lib/mcp-tools.ts',
  'src/lib/mcp-tools/mcp-auth.ts',
  'src/lib/mcp-tools/handlers/descriptions.ts',
  'src/lib/mcp-tools/handlers/complete-challenge/reward-calc.ts',
  'src/app/api/mcp/server/route.ts',
];

describe('MCP guardian voice guard', () => {
  it('removes legacy mirror-phrasing from MCP tool sources', () => {
    const legacyVoice = /magic mirror|do NOT celebrate|GOLDEN SEEING|mirror shimmered|without seeing|没经过看见/i;

    for (const relativePath of sourcePaths) {
      const source = readFileSync(join(repoRoot, relativePath), 'utf8');
      expect(source.match(legacyVoice), relativePath).toBeNull();
    }
  });

  it('keeps v1 initialize instructions identical to the exported v2 source', () => {
    const v1Source = readFileSync(join(repoRoot, 'src/app/api/mcp/server/route.ts'), 'utf8');

    expect(v1Source).toContain('instructions: MCP_SERVER_INSTRUCTIONS');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('A brief celebration is welcome');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('No shaming. No lecturing.');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('greener alternative');
    expect(MCP_SERVER_INSTRUCTIONS).toContain('hours of life');
  });
});
