// @ts-check
// Flat ESLint config for the VoltReport backend (ESLint v9).
//
// Intentionally lenient: it catches real correctness issues (no-undef, etc.)
// without failing the build on pre-existing stylistic debt. Tighten rules
// incrementally over time. Tests, mocks and build output are ignored.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'prisma/**',
      'uploads/**',
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/__tests__/**',
      'src/**/__mocks__/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      // Pragmatic relaxations — the codebase uses `any` at Prisma boundaries and
      // has intentional unused error bindings. Keep these as warnings (or off)
      // so CI stays green while still surfacing genuine bugs.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-namespace': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  }
);
