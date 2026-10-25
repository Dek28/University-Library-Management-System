const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'src/uploads/**', 'backups/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^(req|res|next)$', ignoreRestSiblings: true, caughtErrors: 'none' }],
      'no-await-in-loop': 'warn',
      'no-console': 'warn',
    },
  },
];
