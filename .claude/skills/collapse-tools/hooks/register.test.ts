import type { CommandRunInput } from 'claude-code'
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
  expect(JSON.stringify(await use.drawn())).toContain('"color":"#7d9a83"')
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
  expect(toasts).toEqual([HINT_TEXT])
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
  expect(ok.text).toBe('Done color set to #AABBCC. Saved for future sessions.')
  expect(sets).toEqual([{ key: 'doneColor', value: '#AABBCC' }])
  const reset = await $.command.run({ ...RUN, args: 'color reset' })
  expect(reset.text).toContain('Done color reset')
  expect(deleted).toEqual(['doneColor'])
  expect((await $.command.run({ ...RUN, args: 'bogus' })).text).toContain('Usage: /collapse-tools')
})
