import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every app gets a fresh in-memory DB (never data/rfqcrm.sqlite), seeded with admin/admin.
    env: { DB_PATH: ':memory:', ADMIN_PASSWORD: 'admin' },
  },
});
