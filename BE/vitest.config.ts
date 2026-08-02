import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Focus coverage on the units under test (pure logic + request handlers).
      // Bootstrap, generated, and config glue are excluded so the percentage
      // reflects business-logic coverage rather than framework wiring.
      include: [
        'src/utils/generateId.ts',
        'src/utils/jwt.ts',
        'src/utils/reportStatus.ts',
        'src/utils/response.ts',
        'src/middlewares/auth.ts',
        'src/middlewares/rbac.ts',
        'src/middlewares/errorHandler.ts',
        'src/controllers/authController.ts',
        'src/controllers/rekapController.ts',
        'src/services/laporanAwalService.ts',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__mocks__/**',
        'src/__tests__/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
