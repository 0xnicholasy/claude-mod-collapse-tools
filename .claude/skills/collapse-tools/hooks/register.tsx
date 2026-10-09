import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { isExpanded, summaryLine } from './summary'

const collapsed = atom({ plugin: 'collapse-tools', key: 'collapsed' } as const, true as boolean)
const overrides = atom({ plugin: 'collapse-tools', key: 'overrides' } as const, {} as Record<string, boolean>)

const STORE_KEY = 'collapsed'

// Loads the saved global choice; a store error or a non-boolean keeps the default (collapsed).
async function loadSaved($: EngineInterface): Promise<void> {
  try {
    const saved = await $.store.get(STORE_KEY)
    if (typeof saved === 'boolean') await update($, collapsed, () => saved)
  } catch (error) {
    $.ui.log(`collapse-tools: store read failed ${String(error)}`, { to: 'debug' })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadSaved($)
    await $.command.register({
      name: 'collapse-tools',
      description: 'Toggle between one-line and full tool-call rows',
    })

    return next(e)
  })

  // The atoms reset on /clear and no session.start follows, so reload the saved choice on the next turn.
  on('turn.start', async ($, e, next) => {
    await loadSaved($)

    return next(e)
  })

  on('command.run', { command: 'collapse-tools' }, async $ => {
    const next = !(await read($, collapsed))
    await update($, collapsed, () => next)
    await update($, overrides, () => ({}))
    try {
      await $.store.set(STORE_KEY, next)
    } catch (error) {
      $.ui.log(`collapse-tools: store write failed ${String(error)}`, { to: 'debug' })
    }

    return { text: next ? 'Tool calls collapsed to one line.' : 'Tool calls expanded.' }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const id = e.props.tool_use_id
    const [global, map] = await Promise.all([read($, collapsed), read($, overrides)])
    const open = isExpanded(global, map[id])
    const toggle = () => update($, overrides, cur => ({ ...cur, [id]: !open }))
    const line = summaryLine(e.props, e.viewport?.columns, open)
    const row = (
      <Button key={`collapse-tools:${id}`} plain onPress={toggle}>
        <Text dimColor>{line}</Text>
      </Button>
    )
    if (!open) return row

    // Expanded: the header line stays (click to collapse again), the engine's own row follows.
    return (
      <Box flexDirection="column">
        {row}
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { Box } = $.ui.resolve(e)
    const id = e.props.tool_use_id
    const [global, map] = await Promise.all([read($, collapsed), read($, overrides)])
    if (isExpanded(global, map[id])) return next(e)

    return <Box height={0} />
  })
}
