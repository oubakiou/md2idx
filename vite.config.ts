import { defineConfig } from 'vite-plus'

export default defineConfig({
  define: {
    'import.meta.vitest': 'undefined',
  },
  fmt: {
    // ビルド成果物はフォーマット対象外。`vp build` で都度上書きされるため。
    ignorePatterns: ['dist/'],
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
  },
  lint: {
    categories: {
      correctness: 'error',
      perf: 'error',
      restriction: 'error',
      style: 'error',
      suspicious: 'error',
    },
    // ビルド成果物はチェック対象外。`vp build` で都度上書きされるため。
    ignorePatterns: ['dist/'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'capitalized-comments': 'off',
      'no-array-reduce': 'off',
      'no-magic-numbers': 'off',
      'number-literal-case': 'off',
      'oxc/no-async-await': 'off',
      'oxc/no-rest-spread-properties': 'off',
      // import の並びは fmt (oxfmt sortImports) が所有する。lint の sort-imports は
      // member 構文順 (none→all→multiple→single) という別アルゴリズムで衝突するため off。
      'sort-imports': 'off',
      'unicorn/no-null': 'off',
    },
  },
  pack: {
    define: { 'import.meta.vitest': 'undefined' },
    entry: ['src/md2idx.ts', 'src/cli.ts'],
  },
  plugins: [],
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', '.temp/**', 'dist/**'],
    includeSource: ['src/**/*.ts'],
    // scripts/ の契約テストは 1 ケースごとに bash / fake CLI の子プロセスを起動する。
    // ホストの負荷次第でこの spawn が数秒遅延するため、vitest 既定の 5s では足りない
    testTimeout: 30_000,
  },
})
