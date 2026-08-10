#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

interface HookPayload {
  cwd?: unknown
  tool_input?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readPayload = (): HookPayload => {
  const raw = readFileSync(0, 'utf8').trim()

  if (raw === '') {
    return {}
  }

  const parsed: unknown = JSON.parse(raw)

  if (isRecord(parsed)) {
    return parsed
  }

  return {}
}

const getCwd = (payload: HookPayload): string => {
  if (typeof payload.cwd === 'string' && payload.cwd.length > 0) {
    return payload.cwd
  }

  return process.cwd()
}

const addPatchFile = (files: Set<string>, line: string, prefix: string): void => {
  if (!line.startsWith(prefix)) {
    return
  }

  const file = line.slice(prefix.length).trim()

  if (file.length > 0) {
    files.add(file)
  }
}

export const extractPatchFiles = (command: string): string[] => {
  const files = new Set<string>()

  for (const line of command.split(/\r?\n/)) {
    addPatchFile(files, line, '*** Add File: ')
    addPatchFile(files, line, '*** Update File: ')
    addPatchFile(files, line, '*** Move to: ')
  }

  return [...files]
}

export const getFiles = (payload: HookPayload): string[] => {
  if (!isRecord(payload.tool_input)) {
    return []
  }

  if (typeof payload.tool_input.file_path === 'string') {
    return [payload.tool_input.file_path]
  }

  if (typeof payload.tool_input.command === 'string') {
    return extractPatchFiles(payload.tool_input.command)
  }

  return []
}

const emitAdditionalContext = (message: string): void => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        additionalContext: `check-file failed:\n${message}`,
        hookEventName: 'PostToolUse',
      },
    })
  )
}

const runCheck = (cwd: string, file: string): string | null => {
  const script = path.resolve(cwd, '.agents/scripts/check-file.sh')
  const result = spawnSync('bash', [script, file], { cwd, encoding: 'utf8' })

  if (result.status === 0) {
    return null
  }

  if (result.error) {
    return result.error.message
  }

  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

const main = (): void => {
  const payload = readPayload()
  const cwd = getCwd(payload)
  const files = getFiles(payload).filter((file) => existsSync(path.resolve(cwd, file)))
  const failures = files.flatMap((file) => {
    const failure = runCheck(cwd, file)

    if (failure === null) {
      return []
    }

    return [`${file}\n${failure}`]
  })

  if (failures.length > 0) {
    emitAdditionalContext(failures.join('\n\n'))
  }
}

main()
