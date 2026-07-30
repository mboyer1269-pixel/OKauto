import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**'],
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
    server: {
      deps: {
        external: [/@prisma\/client/, '@okauto/database', 'bcryptjs'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
