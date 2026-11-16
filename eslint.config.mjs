// Lint rules the Obsidian community review applies (eslint-plugin-obsidianmd).
// In the public repository this file is the root eslint.config.mjs.
import { defineConfig } from 'eslint/config'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default defineConfig([
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'main.js',
      'pglite-worker.js',
      '*.mjs',
      '*.js',
      'scripts/**',
      'vendor/**',
      'third_party/**',
      'local-embedding/**',
      'contracts/**',
      'assets/**',
      'drizzle/**',
      '__mocks__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
