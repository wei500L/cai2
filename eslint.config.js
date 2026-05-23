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
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/mock/**', 'src/types/**', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['warn', {
        paths: [
          {
            name: '@/mock/types',
            message: "Types moved to '@/types'.",
          },
          {
            name: '@/mock/factions',
            importNames: ['FactionId', 'FactionMeta', 'SpeechStyle', 'SpeechStyleId'],
            message: "Faction types moved to '@/types/faction'. Keep only fixture data imports from '@/mock/factions'.",
          },
        ],
      }],
    },
  },
])
