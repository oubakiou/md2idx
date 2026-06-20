---
description: |
  Read a large Markdown file efficiently using md2idx: first fetch the numbered index (table of contents), then retrieve only the sections relevant to the current task — instead of loading the entire file into context. Use this skill whenever asked to read, analyze, summarize, or answer questions about a Markdown file that is likely to be large (more than 200 lines or 10 KB), or when the user explicitly mentions md2idx or asks to "read via index", "read selectively", "check the TOC first". Also consider this skill proactively when you encounter a large .md file and don't need every section — partial retrieval saves tokens and keeps context focused. Do NOT use this skill for small files, files you need to edit in full, or non-Markdown files.
license: MIT
name: md2idx-read
---

# md2idx-read

A skill for reading large Markdown files efficiently using md2idx. Instead of loading an entire file into context, first fetch the index (heading table of contents), then selectively retrieve only the sections needed for the current task.

The bundled `scripts/md2idx-run.sh` wrapper handles file size checking, md2idx command resolution (local build, PATH, npx), and execution. All Bash operations go through this single script, so one `permissions.allow` prefix covers the full workflow.

## When to use

- Reading a large Markdown file (guideline: more than 200 lines or 10 KB)
- Only specific sections are needed, not the entire file
- The user explicitly asks to "read via md2idx", "check the index", or "read selectively"

## When NOT to use

- Small Markdown files (under 200 lines) — reading directly with the Read tool is faster
- The entire file needs to be edited — the Edit tool requires full content
- Non-Markdown files

## Workflow

Call the wrapper via `bash` with a **project-root-relative path** (not absolute) so it matches `permissions.allow` prefix rules. The base directory depends on which agent installed the skill — `.claude/skills/` for Claude Code, `.agents/skills/` for other agents (Codex CLI uses `.codex/skills/` in some configurations):

```bash
# Claude Code:
bash .claude/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --index

# Other agents:
bash .agents/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --index
```

Use the path that matches your agent's install directory throughout all commands below.

The wrapper performs these steps internally:

1. **File size check** — if the file is under 200 lines AND under 10 KB, it exits with code 2 and prints `SMALL: ... — use Read tool directly` to stderr. In that case, use the Read tool to read the file directly and stop.
2. **md2idx command resolution** — tries `node dist/md2idx.mjs` (local build), then `md2idx` (PATH), then `npx -y md2idx` (auto-download). Exits with code 3 if none are available.
3. **Execution** — runs the resolved md2idx with `jq` and outputs the result to stdout.

### Step 1: Fetch the index

```bash
# Claude Code:
bash .claude/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --index

# Other agents:
bash .agents/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --index
```

If exit code is 2 (file too small), use Read tool directly. If exit code is 3 (md2idx unavailable), skip to the fallback procedure.

Example output:

```
# 0. Project README
## 1. Install
## 2. Usage
### 3. Options
## 4. License
```

Each line follows the format `<# markers for level> <serial>. <heading text>`. The serial number corresponds to the `sections` array index. The number of `#` marks indicates the heading depth. If there is text before the first heading (preamble), it appears as `0.` with no heading markers and is stored in `sections[0]`.

### Step 2: Determine which sections are needed

Read the index and identify which sections are relevant to the current task.

**Guidelines:**

- Select headings directly related to the user's question or task
- Child headings appear as consecutive numbers immediately after their parent. A contiguous range of deeper `#` marks after a heading represents that heading's entire subtree
- When in doubt, fetch fewer sections first and add more later — this is more token-efficient

### Step 3: Retrieve sections

**Single section:**

```bash
# Claude Code:
bash .claude/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --sections '.sections[2]'

# Other agents:
bash .agents/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --sections '.sections[2]'
```

**Contiguous range (a heading and all its children):**

Using the index example above, to retrieve "Usage" (2) and its child "Options" (3):

```bash
# Claude Code:
bash .claude/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --sections '.sections[2:4][]'

# Other agents:
bash .agents/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --sections '.sections[2:4][]'
```

The jq slice `[N:M]` returns indices N through M-1.

**Multiple non-contiguous sections:**

```bash
# Claude Code:
bash .claude/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --sections '.sections[0], .sections[3], .sections[7]'

# Other agents:
bash .agents/skills/md2idx-read/scripts/md2idx-run.sh "<file>" --sections '.sections[0], .sections[3], .sections[7]'
```

### Step 4: Repeat if more sections are needed

If the retrieved sections indicate that additional sections are needed, return to Step 3. The index from Step 1 is already available — use it to determine the additional section numbers.

## Fallback when md2idx is unavailable

If the wrapper exits with code 3, or if Bash permissions are denied, notify the user: "md2idx is unavailable — falling back to Read + grep", then use the following alternative procedure.

### Fallback: Get heading list via grep

```bash
grep -nE '^ {0,3}#{1,6}[[:space:]]' "<file>"
```

This returns a line-numbered list of ATX headings. Use this as a substitute for the index.

### Fallback: Retrieve sections via Read tool

From the grep output, determine the range to read based on what you need:

**Single section (one heading only):** read from the heading's line up to (but not including) the next heading at any level.

**A heading and all its children:** read from the heading's line up to (but not including) the next heading at the same or shallower level (same or fewer `#` marks). This includes all deeper child headings in between.

In both cases, let `start_line` be the heading's line number from grep, and `next_line` be the line number of the boundary heading (exclusive). Then use the Read tool:

```
Read(file, offset=<start_line>, limit=<next_line - start_line>)
```

Read's `offset` is the 1-based line number to start from, matching `grep -n` output directly. If the target heading is the last one in the file, omit `limit` to read to the end.

The fallback cannot distinguish setext headings (`===` / `---`) or `#` inside fenced code blocks. For full accuracy, grant Bash permissions and use the wrapper script.

## Permissions setup

One `permissions.allow` rule covers the entire workflow. Use the path matching your agent:

```json
// Claude Code:
{
  "permissions": {
    "allow": ["Bash(bash .claude/skills/md2idx-read/scripts/md2idx-run.sh:*)"]
  }
}
```

```json
// Other agents:
{
  "permissions": {
    "allow": ["Bash(bash .agents/skills/md2idx-read/scripts/md2idx-run.sh:*)"]
  }
}
```

## Notes

- The wrapper uses the same md2idx binary for both index and section retrieval, guaranteeing consistent indices
- md2idx output is deterministic for the same input and the same md2idx version
- Section content is returned as raw Markdown strings, including the heading line itself
- `npx -y md2idx` skips the install confirmation prompt; in network-restricted environments, pre-install md2idx globally instead
