import type { CommandRunInput, ModelCompleteInput, ModelCompleteResult, On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { HINT_TEXT } from './summary'

const props = {
  tool_use_id: 'toolu_1',
  tool: 'Bash',
  input: { command: 'ls' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
}
const result = { tool_use_id: 'toolu_1', tool: 'Bash', output: { stdout: 'x' }, isErrored: false }
const RUN: CommandRunInput = {
  command: 'collapse-tools',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
}
const viewport = { columns: 80, rows: 24 }

const mountTool = ($: Engine, tool: string, id: string) =>
  Promise.all([
    $.ui.mount({ plugin: 'collapse-tools', surface: 'terminal', component: 'ToolUse', props: { ...props, tool, tool_use_id: id }, requestId: id, viewport }),
    $.ui.mount({ plugin: 'collapse-tools', surface: 'terminal', component: 'ToolResult', props: { ...result, tool, tool_use_id: id }, requestId: id, viewport }),
  ])

test('collapsed draws one Button and a result that draws nothing; press swaps in the header only; /collapse-tools expands all', async ($, on) => {
  // Stand-ins for the engine's own rows and the plugin store, beneath the plugin.
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: e.component === 'ToolResult' ? 'stdout' : 'engine row' }))
  const saved: Array<{ key: string; value: unknown }> = []
  on('store.set', async (_$, e) => {
    saved.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  const [use, res] = await mountTool($, 'Bash', 'toolu_1')
  expect(await use.findAll({ type: 'Button' })).toHaveLength(1)
  expect(await use.find({ text: '[+] Bash  ls' })).toBeDefined()
  expect(JSON.stringify(await use.drawn())).not.toContain('engine row')
  // The result is a Box with display none: no text and no row.
  expect(JSON.stringify(await res.drawn())).toContain('"display":"none"')
  expect(JSON.stringify(await res.drawn())).not.toContain('stdout')

  await use.press({ key: 'collapse-tools:toolu_1' })
  expect(await use.find({ text: '[-] Bash  ls' })).toBeDefined()
  expect(await use.find({ text: '[+] Bash  ls' })).toBeUndefined()
  expect(JSON.stringify(await use.drawn())).not.toContain('engine row')
  expect(JSON.stringify(await res.drawn())).toContain('stdout')

  const out = await $.command.run(RUN)
  expect(out.text).toBe('Tool calls expanded.')
  expect(saved).toContainEqual({ key: 'collapsed', value: false })
  expect(await use.find({ text: '[-] Bash  ls' })).toBeDefined()
  expect(JSON.stringify(await res.drawn())).toContain('stdout')

  await use.press({ key: 'collapse-tools:toolu_1' })
  expect(await use.find({ text: '[+] Bash  ls' })).toBeDefined()
  expect(JSON.stringify(await res.drawn())).not.toContain('stdout')
})

test('an expanded Agent row keeps the engine row under the header; the status word and color are drawn', async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const [use] = await mountTool($, 'Agent', 'toolu_2')
  await use.press({ key: 'collapse-tools:toolu_2' })
  expect(await use.find({ text: '[-] Agent  ls' })).toBeDefined()
  expect(JSON.stringify(await use.drawn())).toContain('engine row')
  expect(JSON.stringify(await use.drawn())).toContain('"color":"white"')
})

test('the startup hint toasts once per session, and only for an interactive session', async ($, on) => {
  const toasts: string[] = []
  // Stand-ins for what the engine answers beneath the plugin at start.
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: { command: 'collapse-tools' } }))
  on('store.get', async () => ({ value: undefined }))
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const start = { cwd: '/tmp', surface: 'terminal' as const, isInteractive: true }
  await $.session.start({ ...start, isInteractive: false })
  expect(toasts).toEqual([])
  await $.session.start(start)
  await $.session.start(start)
  expect(toasts).toEqual(['click a [+] row to expand, /collapse-tools to toggle all'])
  expect(HINT_TEXT.startsWith('collapse-tools')).toBe(false)
})

test('done color: saved beats the option, and the done row renders with it', { options: { doneColor: 'cyan' } }, async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: { command: 'collapse-tools' } }))
  on('store.get', async (_$, e) => ({ value: e.key === 'doneColor' ? 'magenta' : undefined }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: false })
  const [use] = await mountTool($, 'Bash', 'toolu_3')
  expect(JSON.stringify(await use.drawn())).toContain('"color":"magenta"')
})

test('done color: the plugin option applies when nothing is saved', { options: { doneColor: 'cyan' } }, async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const [use] = await mountTool($, 'Bash', 'toolu_4')
  expect(JSON.stringify(await use.drawn())).toContain('"color":"cyan"')
})

test('color subcommand: an invalid color is rejected without saving; a valid one is saved; reset clears the store', async ($, on) => {
  const sets: Array<{ key: string; value: unknown }> = []
  const deleted: string[] = []
  on('store.set', async (_$, e) => {
    sets.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  on('store.delete', async (_$, e) => {
    deleted.push(e.key)
    return { value: undefined }
  })
  const bad = await $.command.run({ ...RUN, args: 'color orange' })
  expect(bad.text).toContain('Unknown color "orange"')
  expect(sets).toEqual([])
  const ok = await $.command.run({ ...RUN, args: 'color #AABBCC' })
  expect(ok.text).toBe('Completed-call color set to #AABBCC. Saved for future sessions.')
  expect(sets).toEqual([{ key: 'doneColor', value: '#AABBCC' }])
  const reset = await $.command.run({ ...RUN, args: 'color reset' })
  expect(reset.text).toContain('Completed-call color reset')
  expect(deleted).toEqual(['doneColor'])
  expect((await $.command.run({ ...RUN, args: 'bogus' })).text).toContain('Usage: /collapse-tools')
})

const USAGE_ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answer = (text: string) => ({ value: { isAnswered: true as const, text, usage: USAGE_ZERO } })
const bashResult = { stdout: 'x', stderr: '', interrupted: false }

// Stubs the tool beneath the plugin (recording each call's id) and the model (recording each request).
function stubCalls(on: On, reply: () => { value: ModelCompleteResult }) {
  const ids: string[] = []
  const requests: ModelCompleteInput[] = []
  on('tool.call', async (_$, e) => {
    ids.push(e.tool_use_id)
    return { result: bashResult }
  })
  on('model.complete', async (_$, e) => {
    requests.push(e)
    return reply()
  })
  return { ids, requests }
}

test('a Bash call is summarized by one Haiku request and the collapsed row shows the summary', async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const { ids, requests } = stubCalls(on, () => answer('"Check repo status and fetch origin."'))
  const out = await $.tool.call({ tool: 'Bash', command: 'git status && git fetch origin' })
  expect(out.result).toEqual(bashResult)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ model: 'haiku', effort: 'low', maxTokens: 40, timeoutMs: 4000 })
  expect(requests[0]?.prompt).toBe('Tool: Bash\nInput: {"command":"git status && git fetch origin"}')
  const [use] = await mountTool($, 'Bash', ids[0] ?? '')
  expect(await use.find({ text: '[+] Bash  Check repo status and fetch origin' })).toBeDefined()
  await use.press({ key: `collapse-tools:${ids[0]}` })
  expect(await use.find({ text: '[-] Bash  ls' })).toBeDefined()
})

test('a repeated identical call reuses the cached summary; a different input asks again', async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const { ids, requests } = stubCalls(on, () => answer('Load the auth middleware'))
  await $.tool.call({ tool: 'Bash', command: 'cat auth.ts' })
  await $.tool.call({ tool: 'Bash', command: 'cat auth.ts' })
  expect(requests).toHaveLength(1)
  const [second] = await mountTool($, 'Bash', ids[1] ?? '')
  expect(await second.find({ text: '[+] Bash  Load the auth middleware' })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'cat other.ts' })
  expect(requests).toHaveLength(2)
})

test('a failed completion keeps the raw arg and the call still returns the tool result', async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const logs: string[] = []
  on('ui.log', async (_$, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  const { ids } = stubCalls(on, () => ({
    value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE_ZERO },
  }))
  const out = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(out.result).toEqual(bashResult)
  const [use] = await mountTool($, 'Bash', ids[0] ?? '')
  expect(await use.find({ text: '[+] Bash  ls' })).toBeDefined()
  expect(logs.filter(text => text.includes('api-error'))).toHaveLength(1)
})

test('summary off is saved and rows show the raw arg again even with a summary stored; on restores it', async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const saved: Array<{ key: string; value: unknown }> = []
  on('store.set', async (_$, e) => {
    saved.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  const { ids } = stubCalls(on, () => answer('Show working tree status'))
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  const [use] = await mountTool($, 'Bash', ids[0] ?? '')
  expect(await use.find({ text: '[+] Bash  Show working tree status' })).toBeDefined()

  const off = await $.command.run({ ...RUN, args: 'summary off' })
  expect(off.text).toBe('Haiku summaries off. Saved for future sessions.')
  expect(saved).toContainEqual({ key: 'summaries', value: false })
  expect(await use.find({ text: '[+] Bash  ls' })).toBeDefined()

  await $.command.run({ ...RUN, args: 'summary on' })
  expect(saved).toContainEqual({ key: 'summaries', value: true })
  expect(await use.find({ text: '[+] Bash  Show working tree status' })).toBeDefined()
  expect((await $.command.run({ ...RUN, args: 'summary maybe' })).text).toBe('Usage: /collapse-tools summary on|off')
})

test('with summaries off nothing is sent to the model', async ($, on) => {
  const { requests } = stubCalls(on, () => answer('unused'))
  await $.command.run({ ...RUN, args: 'summary off' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(requests).toHaveLength(0)
})

test('the summaries option off stops requests until the saved value says on', { options: { summaries: false } }, async ($, on) => {
  on('store.set', async () => ({ value: undefined }))
  const { requests } = stubCalls(on, () => answer('Do something'))
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(requests).toHaveLength(0)
  await $.command.run({ ...RUN, args: 'summary on' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(requests).toHaveLength(1)
})

test('a completion the engine refuses (rejects) leaves the raw arg and never throws out of the hook', async ($, on) => {
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: 'engine row' }))
  const ids: string[] = []
  on('tool.call', async (_$, e) => {
    ids.push(e.tool_use_id)
    return { result: bashResult }
  })
  on('model.complete', async () => {
    throw new Error('model blocked')
  })
  const out = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(out.result).toEqual(bashResult)
  const [use] = await mountTool($, 'Bash', ids[0] ?? '')
  expect(await use.find({ text: '[+] Bash  ls' })).toBeDefined()
})
