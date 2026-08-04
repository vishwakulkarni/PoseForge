import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

// eslint-config-next 16 ships native flat configs, so FlatCompat is not needed.
const config = [
  {
    ignores: [
      '.next/**',
      '.source/**',
      'node_modules/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      // Unused args prefixed with _ are intentional (reducer default cases,
      // deliberately ignored callback params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
];

export default config;
