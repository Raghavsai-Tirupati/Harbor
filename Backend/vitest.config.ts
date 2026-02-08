import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'shared/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@subsystemA': path.resolve(__dirname, 'src/subsystemA'),
      '@subsystemB': path.resolve(__dirname, 'src/subsystemB'),
      '@subsystemC': path.resolve(__dirname, 'src/subsystemC'),
    },
  },
});
