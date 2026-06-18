# 開発ガイド

[![MKDN](https://img.shields.io/badge/MKDN-review-red?style=for-the-badge)](https://mkdn.review/?url=https%3A%2F%2Fraw.githubusercontent.com%2Foubakiou%2Fmd2idx%2Frefs%2Fheads%2Fmain%2Fdocs%2Fdesign%2Fdevelopment.md)

## 前提条件

- Node.js >= 24.0.0
- npm

## セットアップ

```sh
npm install
```

## コマンド

| コマンド              | 説明                               |
| --------------------- | ---------------------------------- |
| `npm test`            | テスト実行（vitest）               |
| `npm run build`       | ビルド（`dist/md2idx.mjs` 生成）   |
| `npx vp check`        | lint / fmt / type チェック一括実行 |
| `npx vp check --fix`  | 自動修正付きチェック               |
| `npx vp test --watch` | テストのウォッチモード             |

## プロジェクト構成

```
src/md2idx.ts    ソースコード（パーサ + コアロジック + CLI + インラインテスト）
dist/md2idx.mjs  ビルド成果物（CLI バイナリ）
docs/design/     設計ドキュメント
```

## テスト

vitest の in-source testing を採用している。テストは `src/md2idx.ts` 末尾の `if (import.meta.vitest)` ブロックに記述する。ビルド時には `import.meta.vitest` が `undefined` に置換され、テストコードは除去される。

## ビルド

`vp pack` で `src/md2idx.ts` を単一ファイル `dist/md2idx.mjs` にバンドルする。外部ランタイム依存はない。
