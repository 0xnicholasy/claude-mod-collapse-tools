export const DEFAULT_COLUMNS = 100
// Columns kept free at the right of a collapsed row (the engine's gutter and a cursor cell).
export const MARGIN = 4
// Two spaces between the parts of a row.
const GAP = 2
// An arg shorter than this is not worth drawing beside the name.
const MIN_ARG = 4
// The expanded header may take about this many terminal lines of text.
export const EXPANDED_LINES = 6
// One extra `key: value` is cut to this many characters before the whole list is capped.
const MAX_EXTRA_VALUE = 80

export const MARKER_CLOSED = '[+]'
export const MARKER_OPEN = '[-]'

// Shown once per session at start, so the clickable rows are discoverable.
export const HINT_TEXT = 'collapse-tools: click a [+] row to expand, /collapse-tools to toggle all'

// Input fields that name what a call works on, most telling first.
const ARG_FIELDS = ['command', 'file_path', 'path', 'pattern', 'description', 'title', 'op'] as const

// Tools whose engine ToolUse row may carry more than `Name(arg)`: the expanded view keeps the
// header and then the engine's own row for them. Edit and Write are not here: their diff
// (structuredPatch) is in the tool's output, which is drawn by the ToolResult.
const KEEP_ENGINE_ROW: ReadonlySet<string> = new Set(['Agent', 'Task', 'AskUserQuestion', 'TodoWrite', 'ExitPlanMode'])

export type CallStatus = 'running' | 'error' | 'interrupted' | 'done'

// Theme keys, so the colors follow the person's theme: success green, error red, warning yellow,
// inactive gray.
export const STATUS_COLOR: Readonly<Record<CallStatus, string>> = {
  done: 'success',
  error: 'error',
  running: 'warning',
  interrupted: 'inactive',
}

export type CallView = {
  tool: string
  // unknown: mirrors RenderPropsOf.ToolUse.input, which the engine types declare as unknown.
  input: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

// One styled run of text in a row; the render hook maps it to a Text.
export type Segment = {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
}

// `mcp__server__tool` reads `server:tool`; any other name is kept.
export function formatToolName(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const rest = tool.slice('mcp__'.length)
  const split = rest.indexOf('__')
  if (split <= 0 || split + 2 >= rest.length) return tool
  return `${rest.slice(0, split)}:${rest.slice(split + 2)}`
}

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim()

const length = (text: string): number => Array.from(text).length

const segmentsLength = (segments: readonly Segment[]): number =>
  segments.reduce((sum, segment) => sum + length(segment.text), 0)

export const segmentsText = (segments: readonly Segment[]): string => segments.map(segment => segment.text).join('')

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

type ArgField = { key: string; value: string }

// The most telling string field of the input, whitespace collapsed, in full; null when none.
function pickArgField(input: unknown): ArgField | null {
  const record = asRecord(input)
  if (record === null) return null
  for (const key of ARG_FIELDS) {
    const value = record[key]
    if (typeof value === 'string' && squash(value) !== '') return { key, value: squash(value) }
  }
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && squash(value) !== '') return { key, value: squash(value) }
  }
  return null
}

// The most telling string field of the input, whitespace collapsed; '' when none.
export function pickArg(input: unknown): string {
  return pickArgField(input)?.value ?? ''
}

// unknown: the values of a tool input are whatever JSON the model sent.
function show(value: unknown): string {
  if (typeof value === 'string') return squash(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return squash(JSON.stringify(value) ?? '')
  } catch {
    return ''
  }
}

// Every field but `skip` as `key: value, key: value`; empty values are left out.
function extraFields(input: unknown, skip: string | undefined): string {
  const record = asRecord(input)
  if (record === null) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(record)) {
    if (key === skip) continue
    const text = show(value)
    if (text !== '') parts.push(`${key}: ${truncate(text, MAX_EXTRA_VALUE)}`)
  }
  return parts.join(', ')
}

// An abort wins over an error, an error over running.
export function statusOf(call: Pick<CallView, 'isRunning' | 'isErrored' | 'isInterrupted'>): CallStatus {
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'error'
  if (call.isRunning) return 'running'
  return 'done'
}

// A finished call says nothing: its green name is the status.
export const statusWord = (status: CallStatus): string => (status === 'done' ? '' : status)

const validColumns = (columns: number | undefined): number =>
  columns !== undefined && columns > 0 ? columns : DEFAULT_COLUMNS

// Cuts the runs to `width` characters in total, ending with `...` where it cut.
function clipSegments(segments: readonly Segment[], width: number): Segment[] {
  if (segmentsLength(segments) <= width) return [...segments]
  const clipped: Segment[] = []
  let left = Math.max(width, 0)
  for (const segment of segments) {
    if (left <= 0) break
    const size = length(segment.text)
    if (size <= left) {
      clipped.push(segment)
      left -= size
      continue
    }
    clipped.push({ ...segment, text: truncate(segment.text, left) })
    break
  }
  return clipped
}

// `[+] Name  arg            status`: the marker dim, the name bold in the status color, the arg dim
// and cut to fit, the status word right-aligned and only when the call is not done.
export function collapsedSegments(call: CallView, columns: number | undefined): Segment[] {
  const width = Math.max(validColumns(columns) - MARGIN, 1)
  const status = statusOf(call)
  const color = STATUS_COLOR[status]
  const word = statusWord(status)
  const segments: Segment[] = [
    { text: `${MARKER_CLOSED} `, dim: true },
    { text: formatToolName(call.tool), color, bold: true },
  ]
  const wordRoom = word === '' ? 0 : GAP + length(word)
  const argRoom = width - segmentsLength(segments) - GAP - wordRoom
  const arg = pickArg(call.input)
  if (arg !== '' && argRoom >= MIN_ARG) segments.push({ text: ' '.repeat(GAP) + truncate(arg, argRoom), dim: true })
  if (word !== '') {
    const pad = Math.max(GAP, width - segmentsLength(segments) - length(word))
    segments.push({ text: ' '.repeat(pad) + word, color })
  }
  return clipSegments(segments, width)
}

// `[-] Name  full input  key: value, ...`: the most telling field in full, then the other fields dim.
// The text after the name is capped at about EXPANDED_LINES lines of the terminal width.
export function expandedSegments(call: CallView, columns: number | undefined): Segment[] {
  const budget = validColumns(columns) * EXPANDED_LINES
  const status = statusOf(call)
  const color = STATUS_COLOR[status]
  const word = statusWord(status)
  const segments: Segment[] = [
    { text: `${MARKER_OPEN} `, dim: true },
    { text: formatToolName(call.tool), color, bold: true },
  ]
  const field = pickArgField(call.input)
  const extras = extraFields(call.input, field?.key)
  // With extras to follow, keep room for a gap and the closing `...` after the main field.
  const mainRoom = budget - segmentsLength(segments) - GAP - (extras === '' ? 0 : GAP + 3)
  if (field !== null && mainRoom > 0) segments.push({ text: ' '.repeat(GAP) + truncate(field.value, mainRoom) })
  if (extras !== '') {
    const room = budget - segmentsLength(segments) - GAP
    segments.push({ text: ' '.repeat(GAP) + (room >= 8 ? truncate(extras, room) : '...'), dim: true })
  }
  if (word !== '') segments.push({ text: ' '.repeat(GAP) + word, color })
  return segments
}

// For these tools the expanded view also draws the engine's own ToolUse row under the header.
export const keepsEngineRow = (tool: string): boolean => KEEP_ENGINE_ROW.has(tool)

// A per-call toggle beats the global default.
export function isExpanded(collapsed: boolean, override: boolean | undefined): boolean {
  return override ?? !collapsed
}
