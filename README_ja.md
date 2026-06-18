# md2idx

[![MKDN](https://img.shields.io/badge/MKDN-review-red?style=for-the-badge)](https://mkdn.review/?url=https%3A%2F%2Fraw.githubusercontent.com%2Foubakiou%2Fmd2idx%2Frefs%2Fheads%2Fmain%2FREADME_ja.md)
[![npm](https://img.shields.io/npm/v/md2idx.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/md2idx)

[![English](https://img.shields.io/badge/Language-English-lightgrey?style=for-the-badge)](./README.md)
[![日本語](https://img.shields.io/badge/言語-日本語-blue?style=for-the-badge)](./README_ja.md)

**大きな Markdown を見出しレベルで分割し、通し番号付きインデックス（目次）とセクション配列の JSON に変換する。LLM 自身がインデックスを読んで必要なセクションだけを取得する — 最小トークンで最大のコンテキストを。**

## Quick start

```sh
npx md2idx README.md | jq -r '.index'              # まずインデックスを読む
npx md2idx README.md | jq -r '.sections[2]'        # 必要なセクションを取る
npx md2idx README.md | jq -r '.sections[0:3][]'    # ある見出し配下をまとめて取る

npm install -g md2idx                               # グローバルインストール
md2idx README.md | jq -r '.index'                   # md2idx だけで実行可能に
```

## 使い方

```
md2idx [file] [--pretty]
```

| 引数 / フラグ | 説明                                                             |
| ------------- | ---------------------------------------------------------------- |
| `file`        | 入力 Markdown ファイル。省略時は標準入力を読む                   |
| `--pretty`    | JSON を整形して出力する（既定は `jq` へパイプしやすい 1 行出力） |
| `--help`      | usage を表示して終了                                             |

stdin からのパイプ:

```sh
cat spec.md | md2idx | jq -r '.index'
```

## 出力フォーマット

```jsonc
{
  "index": "# 0. プロジェクト README\n## 1. インストール\n## 2. 使い方\n### 3. オプション\n## 4. ライセンス",
  "sections": [
    "# プロジェクト README",
    "## インストール\n\nnpm install -g ...",
    "## 使い方\n\n...",
    "### オプション\n\n...",
    "## ライセンス\n\nMIT",
  ],
}
```

- **`index`** — LLM がどのセクションを取得すべきか判断するための、見出しマーカー付き番号目次の単一文字列。各行は `<#でレベル表現> <連番>. <見出しテキスト>`。連番は `sections` の配列添字に一致する。
- **`sections`** — 見出し行＋本文の生 Markdown 文字列をフラットに並べた配列。文書の出現順。ある見出しの子孫は必ず連続した添字範囲を占めるため、スライスでの範囲取得が成立する。

### プリアンブル

最初の見出しより前のテキストは `sections[0]` に収容され、目次には `0.`（見出しマーカーなし）として記載される。

## 仕組み

md2idx は外部依存ゼロの自前行スキャンパーサを使用する（外部 Markdown パーサは不要）。ATX 見出し（`# `）と setext 見出し（`===` / `---`）を検出し、コードフェンス内をスキップし、目次用に見出しテキストからインライン記法を除去する。

## ライセンス

MIT
