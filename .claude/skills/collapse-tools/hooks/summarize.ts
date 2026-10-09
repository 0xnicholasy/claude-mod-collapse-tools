export const SUMMARIES_STORE_KEY = 'summaries'

export const MAX_SUMMARY = 60

// Built-in tools whose input `description` field is documented as a short statement of what the call is
// for (Bash: "Clear, concise description of what this command does"; Agent: "A short (3-5 word)
// description of the task"; Monitor: "Short human-readable description of what you are monitoring").
// Tools whose `description` is a task body or means something else (TaskCreate, TaskUpdate, MCP tools)
// are left out.
const DESCRIBED_TOOLS: ReadonlySet<string> = new Set(['Bash', 'Agent', 'Monitor'])

const cut = (text: string, max: number): string => {
  const chars = Array.from(text)
  return chars.length <= max ? text : chars.slice(0, max).join('')
}

export function cleanSummary(text: string): string {
  const flat = text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/["`“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^['‘’]+/, '')
    .replace(/[\s.,;:!?'‘’]+$/, '')
  return cut(flat, MAX_SUMMARY).trimEnd()
}

export const resolveSummaries = (saved: unknown, option: unknown): boolean =>
  typeof saved === 'boolean' ? saved : typeof option === 'boolean' ? option : true

// The purpose line the model wrote for a call, or null when the tool is not on the allowlist or the
// input carries no usable description.
export function describe(tool: string, input: unknown): string | null {
  if (!DESCRIBED_TOOLS.has(tool)) return null
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const description = (input as Record<string, unknown>).description
  if (typeof description !== 'string') return null
  const clean = cleanSummary(description)
  return clean === '' ? null : clean
}
