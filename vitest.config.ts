import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Component tests render real React trees, so the React plugin is needed for
  // the JSX transform and the automatic runtime. `environment: 'node'` remains
  // the default; a component test opts into jsdom with a
  // `// @vitest-environment jsdom` docblock, so pure logic tests stay fast.
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/database.types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
