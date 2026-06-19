import fs from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  onSuccess: async () => {
    // SQL migration files are not TypeScript — copy them alongside the compiled output
    // so the migration runner can find them at dist/platform/migrations/ in production.
    fs.cpSync('src/platform/migrations', 'dist/platform/migrations', { recursive: true });
  },
});
