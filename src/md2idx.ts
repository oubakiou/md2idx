#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Heading {
  depth: number
  text: string
  offset: number
}

interface Md2idxResult {
  index: string
  sections: string[]
}

interface FenceState {
  active: boolean
  char: string
  len: number
}

interface ScanState {
  fence: FenceState
  offset: number
  prevWasFenceBoundary: boolean
  paragraphStartOffset: number
}

interface LineContext {
  fence: FenceState
  headings: Heading[]
  markdown: string
  nextOffset: number
}

const INACTIVE_FENCE: FenceState = { active: false, char: '', len: 0 }

const NO_PARAGRAPH = -1

const stripInlineMarkup = (text: string): string =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/``([^`]*)``/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')

const stripAtxTrailing = (line: string): string => line.replace(/\s+#+\s*$/, '')

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const ATX_RE = /^ {0,3}(#{1,6})\s/

const updateFenceState = (line: string, fence: FenceState): FenceState => {
  const opening = FENCE_RE.exec(line)
  if (!opening) {
    return fence
  }
  if (!fence.active) {
    return { active: true, char: opening[1][0], len: opening[1].length }
  }
  const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)
  if (closing && line.trimStart().startsWith(fence.char) && closing[1].length >= fence.len) {
    return INACTIVE_FENCE
  }
  return fence
}

const tryAtxHeading = (line: string, offset: number): Heading | null => {
  const match = ATX_RE.exec(line)
  if (!match) {
    return null
  }
  const depth = match[1].length
  const rawText = line.slice(match[0].length)
  const text = stripInlineMarkup(stripAtxTrailing(rawText).trim())
  return { depth, offset, text }
}

const isSetextH1 = (line: string): boolean => /^ {0,3}={1,}\s*$/.test(line)
const isSetextH2 = (line: string): boolean => /^ {0,3}-{2,}\s*$/.test(line)

const setextDepth = (line: string): number | null => {
  if (isSetextH1(line)) {
    return 1
  }
  if (isSetextH2(line)) {
    return 2
  }
  return null
}

const trySetextFromState = (state: ScanState, line: string, markdown: string): Heading | null => {
  if (state.paragraphStartOffset === NO_PARAGRAPH || state.prevWasFenceBoundary) {
    return null
  }
  const depth = setextDepth(line)
  if (depth === null) {
    return null
  }
  const rawText = markdown.slice(state.paragraphStartOffset, state.offset).trimEnd()
  const text = stripInlineMarkup(
    rawText
      .split('\n')
      .map((pl) => pl.trim())
      .join(' ')
  )
  return { depth, offset: state.paragraphStartOffset, text }
}

const resetState = (ctx: LineContext, wasFenceBoundary: boolean): ScanState => ({
  fence: ctx.fence,
  offset: ctx.nextOffset,
  paragraphStartOffset: NO_PARAGRAPH,
  prevWasFenceBoundary: wasFenceBoundary,
})

const paragraphStart = (state: ScanState): number => {
  if (state.paragraphStartOffset === NO_PARAGRAPH) {
    return state.offset
  }
  return state.paragraphStartOffset
}

const extendParagraph = (state: ScanState, ctx: LineContext): ScanState => ({
  fence: ctx.fence,
  offset: ctx.nextOffset,
  paragraphStartOffset: paragraphStart(state),
  prevWasFenceBoundary: false,
})

const isIndentedCode = (line: string): boolean => /^ {4,}\S/.test(line)

const isBlockStart = (line: string): boolean =>
  /^ {0,3}(?:[-*+]|\d{1,9}[.)]) /.test(line) || line.trimStart().startsWith('>')

const findHeading = (state: ScanState, line: string, markdown: string): Heading | null =>
  tryAtxHeading(line, state.offset) ?? trySetextFromState(state, line, markdown)

const processLine = (state: ScanState, line: string, ctx: LineContext): ScanState => {
  if (ctx.fence.active || ctx.fence !== state.fence) {
    return resetState(ctx, true)
  }

  if (!line.trim() || isIndentedCode(line) || isBlockStart(line)) {
    return resetState(ctx, false)
  }

  const heading = findHeading(state, line, ctx.markdown)
  if (heading) {
    ctx.headings.push(heading)
    return resetState(ctx, false)
  }

  return extendParagraph(state, ctx)
}

const parseHeadings = (markdown: string): Heading[] => {
  const lines = markdown.split('\n')
  const headings: Heading[] = []
  const initial: ScanState = {
    fence: INACTIVE_FENCE,
    offset: 0,
    paragraphStartOffset: NO_PARAGRAPH,
    prevWasFenceBoundary: false,
  }
  lines.reduce<ScanState>((state, line) => {
    const fence = updateFenceState(line, state.fence)
    const nextOffset = state.offset + line.length + 1
    return processLine(state, line, { fence, headings, markdown, nextOffset })
  }, initial)
  return headings
}

const getFirstOffset = (headings: Heading[], markdownLength: number): number => {
  if (headings.length > 0) {
    return headings[0].offset
  }
  return markdownLength
}

const getSectionEnd = (headings: Heading[], idx: number, markdownLength: number): number => {
  const next = headings[idx + 1] as Heading | null
  if (next) {
    return next.offset
  }
  return markdownLength
}

const buildPreamble = (
  markdown: string,
  firstOffset: number
): { sections: string[]; indexLines: string[] } => {
  if (firstOffset <= 0) {
    return { indexLines: [], sections: [] }
  }
  const preamble = markdown.slice(0, firstOffset).trimEnd()
  if (!preamble) {
    return { indexLines: [], sections: [] }
  }
  return { indexLines: ['0.'], sections: [preamble] }
}

const normalizeCrlf = (text: string): string => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

export const md2idx = (markdown: string): Md2idxResult => {
  const normalized = normalizeCrlf(markdown)
  const headings = parseHeadings(normalized)
  const firstOffset = getFirstOffset(headings, normalized.length)
  const preamble = buildPreamble(normalized, firstOffset)

  const headingSections = headings.map((heading, idx) => {
    const end = getSectionEnd(headings, idx, normalized.length)
    return normalized.slice(heading.offset, end).trimEnd()
  })

  const headingIndex = headings.map((heading, idx) => {
    const marker = '#'.repeat(heading.depth)
    const sectionIdx = idx + preamble.sections.length
    return `${marker} ${sectionIdx}. ${heading.text}`
  })

  return {
    index: [...preamble.indexLines, ...headingIndex].join('\n'),
    sections: [...preamble.sections, ...headingSections],
  }
}

const USAGE = 'Usage: md2idx [file] [--pretty] [--help]\n'

const readInput = (filePath: string | null): string => {
  if (filePath) {
    return readFileSync(filePath, 'utf8')
  }
  return readFileSync(0, 'utf8')
}

const isCli = (): boolean => {
  if (import.meta.vitest) {
    return false
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

interface ParsedCliArgs {
  flags: string[]
  positionals: string[]
}

const parseCliArgs = (args: string[]): ParsedCliArgs => {
  const sepIdx = args.indexOf('--')
  if (sepIdx !== -1) {
    return {
      flags: args.slice(0, sepIdx).filter((arg) => arg.startsWith('-')),
      positionals: [
        ...args.slice(0, sepIdx).filter((arg) => !arg.startsWith('-')),
        ...args.slice(sepIdx + 1),
      ],
    }
  }
  return {
    flags: args.filter((arg) => arg.startsWith('-')),
    positionals: args.filter((arg) => !arg.startsWith('-')),
  }
}

if (isCli()) {
  const KNOWN_FLAGS = new Set(['--pretty', '--help', '-h'])
  const parsed = parseCliArgs(process.argv.slice(2))
  const hasHelp = parsed.flags.includes('--help') || parsed.flags.includes('-h')
  const unknownFlag = parsed.flags.find((flag) => !KNOWN_FLAGS.has(flag))
  const hasError = Boolean(unknownFlag) || parsed.positionals.length > 1

  if (hasHelp || hasError) {
    process.stderr.write(USAGE)
    process.exitCode = Number(hasError)
  } else {
    const pretty = parsed.flags.includes('--pretty')
    const filePath = parsed.positionals[0] ?? null

    const input = readInput(filePath)
    const result = md2idx(input)
    if (pretty) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      process.stdout.write(`${JSON.stringify(result)}\n`)
    }
  }
}

// Tests
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('基本動作', () => {
    it('見出し + 本文', () => {
      const result = md2idx('# Hello\n\nWorld\n\n## Sub\n\nBody')
      expect(result.sections).toEqual(['# Hello\n\nWorld', '## Sub\n\nBody'])
      expect(result.index).toBe('# 0. Hello\n## 1. Sub')
    })

    it('プリアンブル: 最初の見出し前のテキスト', () => {
      const result = md2idx('Preamble text\n\n# Title\n\nBody')
      expect(result.sections[0]).toBe('Preamble text')
      expect(result.sections[1]).toBe('# Title\n\nBody')
      expect(result.index).toBe('0.\n# 1. Title')
    })

    it('setext 見出し (=== と ---)', () => {
      const result = md2idx('Title\n===\n\nBody\n\nSub\n---\n\nMore')
      expect(result.sections).toHaveLength(2)
      expect(result.index).toBe('# 0. Title\n## 1. Sub')
    })

    it('レベルスキップ: # の次が ###', () => {
      const result = md2idx('# Top\n\n### Skipped\n\nBody')
      expect(result.index).toBe('# 0. Top\n### 1. Skipped')
    })

    it('本文ゼロの見出し', () => {
      const result = md2idx('# One\n## Two\n## Three')
      expect(result.sections).toEqual(['# One', '## Two', '## Three'])
    })

    it('見出しのない Markdown', () => {
      const result = md2idx('Just plain text.\n\nNo headings here.')
      expect(result.sections).toEqual(['Just plain text.\n\nNo headings here.'])
      expect(result.index).toBe('0.')
    })

    it('空文字列', () => {
      const result = md2idx('')
      expect(result.sections).toEqual([])
      expect(result.index).toBe('')
    })
  })

  describe('コードフェンス', () => {
    it('バッククォートフェンス内の # を見出しと誤認しない', () => {
      const md = '# Real\n\n```\n# Not a heading\n```\n\n## Also Real'
      const result = md2idx(md)
      expect(result.sections).toHaveLength(2)
      expect(result.sections[0]).toBe('# Real\n\n```\n# Not a heading\n```')
      expect(result.index).toBe('# 0. Real\n## 1. Also Real')
    })

    it('チルダフェンス内の # をスキップ', () => {
      const result = md2idx('# Top\n\n~~~\n# fake\n~~~\n\n## Bottom')
      expect(result.sections).toHaveLength(2)
    })

    it('先頭スペース付きフェンスを認識する', () => {
      const md = '# Before\n\n   ```\n# Not heading\n   ```\n\n## After'
      const result = md2idx(md)
      expect(result.sections).toHaveLength(2)
      expect(result.index).toBe('# 0. Before\n## 1. After')
    })

    it('フェンス閉じ行直後の === を setext 見出しにしない', () => {
      const md = '# Top\n\n```\ncode\n```\n===\n\n## Bottom'
      const result = md2idx(md)
      expect(result.sections).toHaveLength(2)
      expect(result.index).toBe('# 0. Top\n## 1. Bottom')
    })

    it('未閉じフェンス内は全て非見出し', () => {
      const md = '# Before\n\n```\n# fake\n## also fake'
      const result = md2idx(md)
      expect(result.sections).toHaveLength(1)
      expect(result.index).toBe('# 0. Before')
    })
  })

  describe('setext 見出し', () => {
    it('複数行の段落テキストを結合する', () => {
      const md = 'Foo\nbar\n---\n\nBody'
      const result = md2idx(md)
      expect(result.sections).toHaveLength(1)
      expect(result.index).toBe('## 0. Foo bar')
    })

    it('先頭スペース付き setext underline を認識する', () => {
      const result = md2idx('Title\n   ===\n\nBody')
      expect(result.index).toBe('# 0. Title')
    })
  })

  describe('インライン記法の剥がし', () => {
    it('リンク・コード・強調をプレーンテキスト化', () => {
      const result = md2idx('# Hello `world` **bold** [link](url)\n\nBody')
      expect(result.index).toBe('# 0. Hello world bold link')
    })

    it('複数バッククォートのインラインコードを剥がす', () => {
      const result = md2idx('# Use ``code`` here\n\nBody')
      expect(result.index).toBe('# 0. Use code here')
    })

    it('ATX 見出し末尾の # を除去', () => {
      const result = md2idx('# Title ##\n\nBody')
      expect(result.index).toBe('# 0. Title')
    })

    it('スペースなし末尾 # はテキストの一部として残す', () => {
      const result = md2idx('# Title##\n\nBody')
      expect(result.index).toBe('# 0. Title##')
    })
  })

  describe('CommonMark サブセット', () => {
    it('先頭 1-3 スペース付き ATX 見出しを認識する', () => {
      const result = md2idx('   # Indented\n\nBody')
      expect(result.sections).toHaveLength(1)
      expect(result.index).toBe('# 0. Indented')
    })

    it('先頭 4 スペース以上はコードブロックなので見出しにしない', () => {
      const result = md2idx('    # Not a heading')
      expect(result.sections).toEqual(['    # Not a heading'])
      expect(result.index).toBe('0.')
    })

    it('# 単独行（スペースなし）は見出しにしない', () => {
      const result = md2idx('#\n\nBody')
      expect(result.sections).toEqual(['#\n\nBody'])
      expect(result.index).toBe('0.')
    })

    it('CRLF 改行を正しく処理する', () => {
      const result = md2idx('# Title\r\n\r\nBody\r\n\r\n## Sub\r\n\r\nMore')
      expect(result.sections).toEqual(['# Title\n\nBody', '## Sub\n\nMore'])
      expect(result.index).toBe('# 0. Title\n## 1. Sub')
    })

    it('4スペースインデント行の後の --- を setext 見出しにしない', () => {
      const result = md2idx('    code\n---\n\n## Real')
      expect(result.sections).toHaveLength(2)
      expect(result.index).toBe('0.\n## 1. Real')
    })

    it('リスト直後の --- を setext 見出しにしない', () => {
      const result = md2idx('- one\n- two\n---\n\n# Next')
      expect(result.sections).toHaveLength(2)
      expect(result.index).toBe('0.\n# 1. Next')
    })

    it('blockquote 行の後の === を setext 見出しにしない', () => {
      const result = md2idx('> quote\n===\n\n# Next')
      expect(result.sections).toHaveLength(2)
      expect(result.index).toBe('0.\n# 1. Next')
    })
  })
}
