import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // 🔧 R399: vitest 环境不装 tailwind PostCSS 插件链 — 内联空 postcss 配置替代 postcss.config.mjs (仅测 JS 行为, 样式不测)
  css: { postcss: { plugins: [] } },
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
      // 🔧 R399: vitest 环境无 tailwind PostCSS 插件 — css import 打到空 stub (测 viewport/子树即可, 样式内容不测)
      '\.css$': resolve(__dirname, 'src/test/style-stub.css'),
    },
  },
});
