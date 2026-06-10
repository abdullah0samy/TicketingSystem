import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 50,
        branches: 39,
        functions: 35,
        lines: 50,
      },
      include: [
        'src/core/utils/**/*.ts',
        'src/core/middleware/**/*.ts',
        'src/core/api.ts',
        'src/modules/auth/**/*.ts',
        'src/modules/uploads/**/*.ts',
        'src/modules/tickets/tickets.schema.ts',
        'src/components/**/*.tsx',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/core/db.ts',
        'src/core/paths.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
