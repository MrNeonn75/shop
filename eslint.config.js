import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'playwright-report',
      '*.config.js',
      '*.config.d.ts',
      '**/*.js',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}', '*.config.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style'] Literal[value=/#([0-9a-fA-F]{3,8})\\b/]",
          message:
            'Do not use hardcoded hex colors in inline style props. Use Tailwind design tokens or theme variables.',
        },
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/bg-\\[#|text-\\[#|border-\\[#|fill-\\[#|stroke-\\[#/]",
          message:
            'Arbitrary hex colors in Tailwind className are forbidden. Use design tokens.',
        },
      ],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
