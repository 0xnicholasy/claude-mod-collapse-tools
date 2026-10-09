import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { HINT_TEXT, collapsedSegments, expandedSegments, isExpanded, keepsEngineRow } from './summary'

const collapsed = atom({ plugin: 'collapse-tools', key: 'collapsed' } as const, true as boolean)
const epoch = atom({ plugin: 'collapse-tools', key: 'epoch' } as const, 0)
// True once the startup hint toast was shown, so it appears once per session.
const hinted = atom({ plugin: 'collapse-tools', key: 'hinted' } as const, false as boolean)
// Per-call override family: each member is addressed by tool_use_id, so a click redraws only that call.
const overrideRef = { plugin: 'collapse-tools', key: 'overrides' } as const

type Override = { epoch: number; open: boolean }

// A member written under an older epoch was reset by /collapse-tools and counts as no override.
const openOf = (entry: Override | undefined, current: number): boolean | undefined =>
  entry !== undefined && entry.epoch === current ? entry.open : undefined

const STORE_KEY = 'collapsed'

// Loads the saved global choice; a store error or a non-boolean keeps the default (collapsed).
async function loadSaved($: EngineInterface): Promise<void> {
  try {
    const saved = await $.store.get(STORE_KEY)
    if (typeof saved !== 'boolean') return
    const current = await read($, collapsed)
    if (saved !== current) await update($, collapsed, () => saved)
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
    if (e.isInteractive && !(await read($, hinted))) {
      await update($, hinted, () => true)
      $.ui.toast(HINT_TEXT, { timeoutMs: 8000 })
    }

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
    await update($, epoch, n => n + 1)
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
    const member = { ...overrideRef, id }
    const [global, current, entry] = await Promise.all([read($, collapsed), read($, epoch), read($, member)])
    const open = isExpanded(global, openOf(entry, current))
    const toggle = async () => {
      const [g, ep] = await Promise.all([read($, collapsed), read($, epoch)])
      await update($, member, cur => ({ epoch: ep, open: !isExpanded(g, openOf(cur, ep)) }))
    }
    const call = e.props
    const segments = open ? expandedSegments(call, e.viewport?.columns) : collapsedSegments(call, e.viewport?.columns)
    const row = (
      <Button key={`collapse-tools:${id}`} plain onPress={toggle}>
        {segments.map(segment => (
          <Text color={segment.color} bold={segment.bold} dimColor={segment.dim}>
            {segment.text}
          </Text>
        ))}
      </Button>
    )
    // Expanded: the header replaces the engine's row. Tools whose own row may carry more keep it below.
    if (!open || !keepsEngineRow(call.tool)) return row

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
    const [global, current, entry] = await Promise.all([
      read($, collapsed),
      read($, epoch),
      read($, { ...overrideRef, id }),
    ])
    if (isExpanded(global, openOf(entry, current))) return next(e)

    return <Box display="none" />
  })
}
