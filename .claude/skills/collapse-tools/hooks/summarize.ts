// Pure logic for the Haiku summaries: what is sent, how a reply is cleaned, which setting wins.
// Nothing here touches `$`; register.tsx wires it to the tool.call hook.

export const SUMMARIES_STORE_KEY = 'summaries'

// A string is cut to this many code points; an array or object to this many characters of its JSON.
export const MAX_FIELD = 400
// A cleaned summary is cut to this many code points.
export const MAX_SUMMARY = 60

// Keys the tool.call event carries beside the tool's own arguments; none is part of the input.
const RESERVED_KEYS: ReadonlySet<string> = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta'])

export const SYSTEM =
  'You label one tool call for a one-line transcript row. Reply with the label only: at most 8 words, ' +
  'imperative mood, plain ASCII, no quotes, no trailing period, and never the tool name. ' +
  'Say what the call is for in the task, not its syntax. For a Read or Grep say what is being looked for; ' +
  'for an Edit or Write say what changes; for an Agent or MCP call say what it is asked to do.'

const cut = (text: string, max: number): string => {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

// The arguments of a tool.call event: everything but the keys the event adds itself.
// unknown: the values are whatever JSON the model sent.
export function inputOfEvent(event: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if (!RESERVED_KEYS.has(key)) input[key] = value
  }
  return input
}

// unknown: a tool input is whatever JSON the model sent.
function compactValue(value: unknown): unknown {
  if (typeof value === 'string') return cut(value, MAX_FIELD)
  if (typeof value !== 'object' || value === null) return value
  let json: string | undefined
  try {
    json = JSON.stringify(value)
  } catch {
    json = undefined
  }
  if (json === undefined) return '[unserializable]'
  return Array.from(json).length <= MAX_FIELD ? value : cut(json, MAX_FIELD)
}

// A compact JSON of the input for the prompt: scalars in full, strings cut at 400 code points, arrays
// and objects cut at 400 characters of their JSON. Keys are sorted so equal inputs give equal text.
// unknown: mirrors the tool input, which the engine types declare as unknown.
export function compactInput(_tool: string, input: unknown): string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return JSON.stringify(compactValue(input)) ?? 'null'
  const record: Record<string, unknown> = {}
  for (const key of Object.keys(input).sort()) {
    const value = compactValue((input as Record<string, unknown>)[key])
    if (value !== undefined && typeof value !== 'function') record[key] = value
  }
  return JSON.stringify(record)
}

// FNV-1a over the tool and its compact input: the key of the per-session summary cache.
export function cacheKey(tool: string, compact: string): string {
  let hash = 0x811c9dc5
  for (const char of `${tool}\n${compact}`) {
    const point = char.codePointAt(0) ?? 0
    hash = Math.imul(hash ^ (point & 0xffff), 0x01000193) >>> 0
    if (point > 0xffff) hash = Math.imul(hash ^ (point >>> 16), 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export const summaryPrompt = (tool: string, compact: string): string => `Tool: ${tool}\nInput: ${compact}`

// Whitespace collapsed, quotes and trailing punctuation stripped, cut to 60 code points; '' when
// nothing is left (the caller keeps the raw arg then).
export function cleanSummary(text: string): string {
  const flat = text
    .replace(/["`“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^['‘’]+/, '')
    .replace(/[\s.,;:!?'‘’]+$/, '')
  return cut(flat, MAX_SUMMARY).trimEnd()
}

// The setting in effect: the value saved by `/collapse-tools summary`, else the plugin option, else on.
// unknown: both come from the plugin store and options, which are untyped.
export const resolveSummaries = (saved: unknown, option: unknown): boolean =>
  typeof saved === 'boolean' ? saved : typeof option === 'boolean' ? option : true

// Runs the tool and the summary side by side and settles when both are done. Resolves with exactly what
// the tool resolved, or rejects with exactly what it rejected with. `side` must not reject; a rejection
// is dropped so it can never change the tool's outcome.
export async function awaitBoth<T>(run: Promise<T>, side: Promise<void>): Promise<T> {
  const [outcome] = await Promise.all([
    run.then(
      (value): { ok: true; value: T } => ({ ok: true, value }),
      // unknown: a rejection can be any value; it is rethrown below without change.
      (error: unknown): { ok: false; error: unknown } => ({ ok: false, error }),
    ),
    side.catch(() => undefined),
  ])
  if (!outcome.ok) throw outcome.error
  return outcome.value
}
