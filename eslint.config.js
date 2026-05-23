import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'tmp']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/features/**', 'src/pages/**', 'src/store/**', 'src/render/**', 'src/effects/**', 'src/api/**', 'src/components/**'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/mock/*', '@/mock/**'], message: 'Business code must not import from src/mock. Use src/types or src/store/*MetaStore. MockTransport is the only allowed consumer.' },
        ],
      }],
    },
  },
  {
    files: ['src/protocol/adapter.ts', 'src/protocol/dispatcher.ts', 'src/protocol/types.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/mock/*', '@/mock/**'], message: 'Business code must not import from src/mock. Use src/types or src/store/*MetaStore. MockTransport is the only allowed consumer.' },
        ],
      }],
    },
  },
])
