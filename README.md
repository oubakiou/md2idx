# md2idx

[![MKDN](https://img.shields.io/badge/MKDN-review-red?style=for-the-badge)](https://mkdn.review/?url=https%3A%2F%2Fraw.githubusercontent.com%2Foubakiou%2Fmd2idx%2Frefs%2Fheads%2Fmain%2FREADME.md)
[![npm](https://img.shields.io/npm/v/md2idx.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/md2idx)

[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)
[![日本語](https://img.shields.io/badge/言語-日本語-lightgrey?style=for-the-badge)](./README_ja.md)

**Split a large Markdown into heading-level JSON sections. Read the table of contents with `jq`, then feed only the sections you need to your LLM — minimal tokens, maximum context.**

## Quick start

```sh
npm install -g md2idx

md2idx large.md | jq -r '.index'              # read the TOC first
md2idx large.md | jq -r '.sections[2]'        # grab one section by index
md2idx large.md | jq -r '.sections[0:3][]'    # grab a contiguous range
```

## Usage

```
md2idx [file] [--pretty]
```

| Argument / flag | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `file`          | Input Markdown file. Reads from stdin when omitted                         |
| `--pretty`      | Pretty-print the JSON output (default is single-line for piping into `jq`) |
| `--help`        | Print usage and exit                                                       |

Pipe from stdin:

```sh
cat spec.md | md2idx | jq -r '.index'
```

## Output format

```jsonc
{
  "index": "# 0. Project README\n## 1. Install\n## 2. Usage\n### 3. Options\n## 4. License",
  "sections": [
    "# Project README",
    "## Install\n\nnpm install -g ...",
    "## Usage\n\n...",
    "### Options\n\n...",
    "## License\n\nMIT",
  ],
}
```

- **`index`** — A single string containing a numbered table of contents. Each line is `<# markers for level> <serial>. <heading text>`. The serial matches the `sections` array index.
- **`sections`** — A flat array of raw Markdown strings (heading line + body), in document order. A child heading always occupies a contiguous index range after its parent, so slice-based retrieval works.

### Preamble

Text before the first heading is stored as `sections[0]` with an index entry of `0.` (no heading marker).

## How it works

md2idx uses a zero-dependency line scanner (no external Markdown parser). It detects ATX headings (`# `) and setext headings (`===` / `---`), skips fenced code blocks, and strips inline markup from heading text for the table of contents.

## License

MIT
