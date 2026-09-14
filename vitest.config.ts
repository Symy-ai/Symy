import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
    // 🔧 ARCH fix (Round 7 AUDIT-3 P0 #4): 集中 setup file, 全局 mock next/headers, logger
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'src/**/__tests__/**',
        'src/**/*.test.*',
        'src/test/setup.ts',
        'doc/**',
        'scripts/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
