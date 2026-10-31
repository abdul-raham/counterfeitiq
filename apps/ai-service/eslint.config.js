import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.wrangler'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', FormData: 'readonly', File: 'readonly', Buffer: 'readonly' } },
  },
);
