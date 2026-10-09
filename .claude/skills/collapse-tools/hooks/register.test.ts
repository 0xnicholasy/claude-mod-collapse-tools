import type { CommandRunInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

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

test('collapsed draws one Button and no result; press expands; /collapse-tools resets to expanded; press collapses again', async ($, on) => {
  // Stand-ins for the engine's own rows and the plugin store, beneath the plugin.
  on('ui.render', async ($, e) => $.ui.resolve(e).Text({ children: e.component === 'ToolResult' ? 'stdout' : 'engine row' }))
  const saved: Array<{ key: string; value: unknown }> = []
  on('store.set', async (_$, e) => {
    saved.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  const use = await $.ui.mount({ plugin: 'collapse-tools', surface: 'terminal', component: 'ToolUse', props, requestId: 'toolu_1', viewport })
  const res = await $.ui.mount({ plugin: 'collapse-tools', surface: 'terminal', component: 'ToolResult', props: result, requestId: 'toolu_1', viewport })
  expect(await use.findAll({ type: 'Button' })).toHaveLength(1)
  expect(await use.find({ text: '> Bash(ls) . done' })).toBeDefined()
  expect(JSON.stringify(await use.drawn())).not.toContain('engine row')
  expect(JSON.stringify(await res.drawn())).not.toContain('stdout')

  await use.press({ key: 'collapse-tools:toolu_1' })
  expect(await use.find({ text: 'v Bash(ls) . done' })).toBeDefined()
  expect(JSON.stringify(await use.drawn())).toContain('engine row')
  expect(JSON.stringify(await res.drawn())).toContain('stdout')

  const out = await $.command.run(RUN)
  expect(out.text).toBe('Tool calls expanded.')
  expect(saved).toContainEqual({ key: 'collapsed', value: false })
  expect(await use.find({ text: 'v Bash(ls) . done' })).toBeDefined()
  expect(JSON.stringify(await res.drawn())).toContain('stdout')

  await use.press({ key: 'collapse-tools:toolu_1' })
  expect(await use.find({ text: '> Bash(ls) . done' })).toBeDefined()
  expect(JSON.stringify(await res.drawn())).not.toContain('stdout')
})
