# md2idx

[![MKDN](https://img.shields.io/badge/MKDN-review-red?style=for-the-badge)](https://mkdn.review/?url=https%3A%2F%2Fraw.githubusercontent.com%2Foubakiou%2Fmd2idx%2Frefs%2Fheads%2Fmain%2FREADME.md)
[![npm](https://img.shields.io/npm/v/md2idx.svg?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/md2idx)

[![English](https://img.shields.io/badge/Language-English-blue?style=for-the-badge)](./README.md)
[![日本語](https://img.shields.io/badge/言語-日本語-lightgrey?style=for-the-badge)](./README_ja.md)

**Split a large Markdown into heading-level JSON with a numbered index (table of contents) and a sections array. The LLM reads the index and retrieves only the sections it needs — saving tokens while keeping the context you need.**

## Quick start

```sh
npx md2idx README.md | jq -r '.index'              # read the index first
npx md2idx README.md | jq -r '.sections[2]'        # grab one section by number
npx md2idx README.md | jq -r '.sections[0:3][]'    # grab a contiguous range
npx md2idx data.md | jq -r '.sections[4]' | grep Tokyo  # extract lines containing "Tokyo" from a section

npm install -g md2idx                               # global install
md2idx README.md | jq -r '.index'                   # now available as md2idx
```

## Usage

### When a human invokes the CLI directly

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

### When an LLM invokes the CLI via a skill

[Skill details (SKILL.md)](https://mkdn.review/?url=https%3A%2F%2Fgithub.com%2Foubakiou%2Fmd2idx%2Fblob%2Fmain%2Fskills%2Fmd2idx-read%2FSKILL.md#p:introduction)

```bash
# Skill installation example with gh skill install
gh skill install oubakiou/md2idx md2idx-read --agent claude-code --scope project

# Skill installation example with npx skills add
npx skills add oubakiou/md2idx --skill md2idx-read --agent claude-code --yes
```

An LLM agent (e.g. Claude Code) uses the `md2idx-read` skill to read large Markdown files efficiently. Instead of loading an entire document into context, the agent fetches the index first, then retrieves only the sections it needs — saving tokens and keeping context focused.

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

- **`index`** — A single string containing a numbered table of contents for the LLM to decide which sections to retrieve. Each line is `<# markers for level> <serial>. <heading text>`. The serial matches the `sections` array index.
- **`sections`** — A flat array of raw Markdown strings (heading line + body), in document order. A child heading always occupies a contiguous index range after its parent, so slice-based retrieval works.

### Preamble

Text before the first heading is stored as `sections[0]` with an index entry of `0.` (no heading marker).

## How it works

md2idx uses a zero-dependency line scanner (no external Markdown parser). It detects ATX headings (`# `) and setext headings (`===` / `---`), skips fenced code blocks, and strips inline markup from heading text for the table of contents.

## License

MIT
