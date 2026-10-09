import { expect, test } from 'claude-code/testing'
import {
  MAX_SUMMARY,
  SYSTEM,
  awaitBoth,
  cacheKey,
  cleanSummary,
  compactInput,
  inputOfEvent,
  resolveSummaries,
  summaryPrompt,
} from './summarize'

test('compactInput keeps scalars, cuts a string at 400 code points and an object at 400 characters of JSON', () => {
  const small = JSON.parse(compactInput('Bash', { command: 'ls', timeout: 5, background: false, note: null }))
  expect(small).toEqual({ command: 'ls', timeout: 5, background: false, note: null })

  const long = JSON.parse(compactInput('Write', { content: '\u{1F600}'.repeat(500), tiny: [1, 2] }))
  expect(Array.from(long.content as string)).toHaveLength(400)
  expect(long.tiny).toEqual([1, 2])

  const nodes = Array.from({ length: 100 }, (_, i) => ({ title: `step ${i}` }))
  const cutObject = JSON.parse(compactInput('plan', { nodes, meta: { k: 'v'.repeat(600) } }))
  expect(cutObject.nodes).toBe(JSON.stringify(nodes).slice(0, 400))
  expect(typeof cutObject.meta).toBe('string')
  expect((cutObject.meta as string).length).toBe(400)
})

test('inputOfEvent drops the keys the event adds, so they never reach the prompt or the cache key', () => {
  const input = inputOfEvent({ tool: 'Bash', tool_use_id: 'toolu_9', agentId: 'a', requestMeta: {}, command: 'ls' })
  expect(input).toEqual({ command: 'ls' })
})

test('cacheKey is equal for equal tool and input regardless of key order, and differs otherwise', () => {
  const a = compactInput('Bash', { command: 'ls', timeout: 1 })
  const reordered = compactInput('Bash', { timeout: 1, command: 'ls' })
  expect(cacheKey('Bash', a)).toBe(cacheKey('Bash', reordered))
  expect(cacheKey('Bash', a)).not.toBe(cacheKey('Read', a))
  expect(cacheKey('Bash', a)).not.toBe(cacheKey('Bash', compactInput('Bash', { command: 'ls', timeout: 2 })))
})

test('the prompt carries the tool name and the compact input; the system prompt forbids the tool name', () => {
  expect(summaryPrompt('Read', '{"file_path":"/a.ts"}')).toBe('Tool: Read\nInput: {"file_path":"/a.ts"}')
  expect(SYSTEM).toContain('8 words')
  expect(SYSTEM).toContain('never the tool name')
})

test('cleanSummary strips quotes and trailing punctuation, collapses whitespace and caps at 60 code points', () => {
  expect(cleanSummary('  "Check repo\n status and fetch origin."  ')).toBe('Check repo status and fetch origin')
  expect(cleanSummary("'Load the auth middleware'!")).toBe('Load the auth middleware')
  expect(cleanSummary('...')).toBe('')
  const capped = cleanSummary('word '.repeat(40))
  expect(Array.from(capped).length).toBeLessThanOrEqual(MAX_SUMMARY)
  expect(capped.endsWith(' ')).toBe(false)
  expect(Array.from(cleanSummary('\u{1F600}'.repeat(100)))).toHaveLength(MAX_SUMMARY)
})

test('summaries setting: saved beats the option, which beats the default of on', () => {
  expect(resolveSummaries(false, true)).toBe(false)
  expect(resolveSummaries(true, false)).toBe(true)
  expect(resolveSummaries(undefined, false)).toBe(false)
  expect(resolveSummaries(null, undefined)).toBe(true)
  expect(resolveSummaries('off', 'no')).toBe(true)
})

test('awaitBoth resolves with exactly the tool result and rejects with exactly the tool error', async () => {
  const result = { stdout: 'x' }
  expect(await awaitBoth(Promise.resolve(result), Promise.resolve())).toBe(result)

  const failure = new Error('tool failed')
  let caught: unknown
  await awaitBoth(Promise.reject(failure), Promise.resolve()).catch((error: unknown) => {
    caught = error
  })
  expect(caught).toBe(failure)

  // A rejecting side task never changes the tool's outcome.
  expect(await awaitBoth(Promise.resolve(result), Promise.reject(new Error('side')))).toBe(result)
})

test('awaitBoth waits for the summary side before settling', async () => {
  let release: () => void = () => undefined
  const side = new Promise<void>(resolve => {
    release = resolve
  })
  let settled = false
  const both = awaitBoth(Promise.resolve(1), side).then(() => {
    settled = true
  })
  for (let turn = 0; turn < 20; turn++) await Promise.resolve()
  expect(settled).toBe(false)
  release()
  await both
  expect(settled).toBe(true)
})
