import love from 'eslint-config-love'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      '**/build/',
      '**/dist/',
      'node_modules/',
      'eslint.config.mjs',
      'tailwind.config.cjs',
      'packages/klinklang-client/src/components/ui/**'
    ],
  },
  {
    ...love,
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    plugins: {
      ...love.plugins,
      'react-hooks': reactHooks
    },
    languageOptions: {
      ...love.languageOptions,
      parserOptions: {
        project: ['./packages/*/tsconfig.json']
      }
    },
    rules: {
      ...love.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            properties: false
          }
        }
      ],
      '@typescript-eslint/prefer-destructuring': 'off',
      'complexity': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      'no-await-in-loop': 'off'
    }
  }
]
