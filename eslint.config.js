import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['artifacts/**', 'node_modules/**', 'third_party/**', '_site/**'] },
    js.configs.recommended,
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], eqeqeq: ['error', 'always'] },
    },
    { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
    { files: ['*.js', '*.mjs', 'tests/**/*.mjs', 'script/**/*.mjs'], languageOptions: { globals: globals.node } },
    { files: ['tests/browser.mjs'], languageOptions: { globals: globals.browser } },
];
