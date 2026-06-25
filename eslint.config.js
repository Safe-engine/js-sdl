import eslint from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  stylistic.configs.customize({
    // indent: 2,
    // quotes: 'single',
    semi: false,
    // jsx: true,
    braceStyle: '1tbs',
    commaDangle: 'only-multiline',
  }),
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxBOF: 0,
          maxEOF: 1,
        },
      ],
      'prefer-template': 'error',
      '@stylistic/jsx-self-closing-comp': 'error',
    },
  },
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/.github',
      '**/.husky',
      '**/docs',
      '**/public',
      '**/uploads',
      '**/run',
      '**/watch.js',
      '**/frameworks',
    ],
  },
)
