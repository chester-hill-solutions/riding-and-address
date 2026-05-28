import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
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
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
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
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js']
  }
];
