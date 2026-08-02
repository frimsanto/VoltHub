/**
 * Global Vitest setup. Runs before every test file.
 * Pins deterministic JWT secrets/env so token tests are reproducible and the
 * app never falls back to the insecure development defaults during tests.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/voltreport_test';
