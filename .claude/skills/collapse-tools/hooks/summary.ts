export const DEFAULT_COLUMNS = 100
export const MAX_ARG = 60

// Input fields that name what a call works on, most telling first.
const ARG_FIELDS = ['command', 'file_path', 'path', 'pattern', 'description', 'title', 'op'] as const

export type CallStatus = 'running' | 'error' | 'interrupted' | 'done'

export type CallView = {
  tool: string
  // unknown: mirrors RenderPropsOf.ToolUse.input, which the engine types declare as unknown.
  input: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

// `mcp__server__tool` reads `server - tool (MCP)`; any other name is kept.
export function formatToolName(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const rest = tool.slice('mcp__'.length)
  const split = rest.indexOf('__')
  if (split <= 0 || split + 2 >= rest.length) return tool
  return `${rest.slice(0, split)} - ${rest.slice(split + 2)} (MCP)`
}

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

export function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  const chars = Array.from(text)
  if (chars.length <= max) return text
  if (max <= 3) return chars.slice(0, max).join('')
  return `${chars.slice(0, max - 3).join('')}...`
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

// The most telling string field of the input, whitespace collapsed and capped; '' when none.
export function pickArg(input: unknown): string {
  const record = asRecord(input)
  if (record === null) return ''
  for (const field of ARG_FIELDS) {
    const value = record[field]
    if (typeof value === 'string' && squash(value) !== '') return truncate(squash(value), MAX_ARG)
  }
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && squash(value) !== '') return truncate(squash(value), MAX_ARG)
  }
  return ''
}

// An abort wins over an error, an error over running.
export function statusOf(call: Pick<CallView, 'isRunning' | 'isErrored' | 'isInterrupted'>): CallStatus {
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'error'
  if (call.isRunning) return 'running'
  return 'done'
}

// `> Name(arg) . status`, or `v ` in place of `> ` for an expanded call, cut to the width.
export function summaryLine(call: CallView, columns: number | undefined, isOpen = false): string {
  const arg = pickArg(call.input)
  const head = `${isOpen ? 'v' : '>'} ${formatToolName(call.tool)}(${arg}) . ${statusOf(call)}`
  return truncate(head, columns !== undefined && columns > 0 ? columns : DEFAULT_COLUMNS)
}

// A per-call toggle beats the global default.
export function isExpanded(collapsed: boolean, override: boolean | undefined): boolean {
  return override ?? !collapsed
}
