import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tools/**/*.test.ts', 'scripts/**/*.test.ts'],
    env: loadEnv('test', process.cwd(), ''),
  },
});
