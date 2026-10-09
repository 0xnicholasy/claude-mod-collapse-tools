import { expect, test } from 'claude-code/testing'
import { formatToolName, isExpanded, pickArg, statusOf, summaryLine, truncate } from './summary'

const call = { tool: 'Bash', input: { command: 'ls -la' }, isRunning: false, isErrored: false, isInterrupted: false }

test('MCP tool names read server - tool (MCP); others are kept', () => {
  expect(formatToolName('mcp__github__create_issue')).toBe('github - create_issue (MCP)')
  expect(formatToolName('Bash')).toBe('Bash')
})

test('the arg is the most telling field, with whitespace collapsed', () => {
  expect(pickArg({ command: 'ls\n  -la', description: 'list' })).toBe('ls -la')
  expect(pickArg({ file_path: '/a/b.ts', offset: 3 })).toBe('/a/b.ts')
  expect(pickArg({ count: 2, other: 'first string' })).toBe('first string')
  expect(pickArg(null)).toBe('')
})

test('truncation ends with an ellipsis and fits the width', () => {
  expect(truncate('abcdefghij', 6)).toBe('abc...')
  expect(pickArg({ command: 'x'.repeat(200) })).toHaveLength(60)
  expect(summaryLine(call, 10)).toHaveLength(10)
})

test('status precedence is interrupted, error, running, done', () => {
  expect(statusOf({ isRunning: true, isErrored: true, isInterrupted: true })).toBe('interrupted')
  expect(statusOf({ isRunning: true, isErrored: true, isInterrupted: false })).toBe('error')
  expect(statusOf({ isRunning: true, isErrored: false, isInterrupted: false })).toBe('running')
  expect(statusOf(call)).toBe('done')
})

test('the summary line is dim ASCII with a marker and falls back to 100 columns', () => {
  expect(summaryLine(call, undefined)).toBe('> Bash(ls -la) . done')
  expect(summaryLine(call, 100, true)).toBe('v Bash(ls -la) . done')
})

test('a per-call override beats the global default', () => {
  expect(isExpanded(true, undefined)).toBe(false)
  expect(isExpanded(true, true)).toBe(true)
  expect(isExpanded(false, undefined)).toBe(true)
  expect(isExpanded(false, false)).toBe(false)
})
