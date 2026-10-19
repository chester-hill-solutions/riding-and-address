import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

/**
 * The globals the Workers runtime and the browser give us.
 *
 * Shared by both TypeScript blocks so the root and the portal are linted under the same
 * rules: a rule that fires in one and not the other is a rule that reports a difference
 * that is not there.
 */
const workerGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.worker,
  KVNamespace: 'readonly',
  R2Bucket: 'readonly',
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  AbortSignal: 'readonly',
  crypto: 'readonly',
  CompressionStream: 'readonly',
  DecompressionStream: 'readonly',
  URLSearchParams: 'readonly',
  DOMParser: 'readonly'
};

const tsRules = {
  'no-unused-vars': 'off',
  'no-useless-assignment': 'off',
  'no-undef': 'off',
  'no-empty': 'off',
  'no-control-regex': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'warn',
  'prefer-const': 'error',
  'no-var': 'error',
  '@typescript-eslint/no-unsafe-function-type': 'warn'
};

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: workerGlobals
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: tsRules
  },
  {
    /**
     * The portal: a React Router app on Workers.
     *
     * It was never linted. The portal holds the signup flow, the session handling, the
     * Stripe checkout and the API ownership checks — the paid path — and none of it was
     * under a rule, while the lint reported success. The JSX is why this is its own block
     * rather than an extra entry in the one above.
     */
    files: ['portal/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: workerGlobals
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: tsRules
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.js',
      // Generated and vendored, not ours to lint: the build output, the React Router
      // typegen, and the CHS packages the portal vendors.
      'portal/build/',
      'portal/.react-router/',
      'portal/vendor/'
    ]
  }
];
