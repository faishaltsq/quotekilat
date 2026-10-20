import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import refresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
export default tseslint.config({ ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'vercel-api/**'] }, js.configs.recommended, ...tseslint.configs.recommended, { files: ['**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node } } }, { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks, 'react-refresh': refresh }, rules: { ...hooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] } }, { files: ['**/*.{js,cjs,mjs}'], languageOptions: { globals: { ...globals.node } }, rules: { '@typescript-eslint/no-require-imports': 'off' } })
