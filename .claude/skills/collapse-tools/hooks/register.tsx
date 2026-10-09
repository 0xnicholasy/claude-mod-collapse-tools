import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { DONE_COLOR_STORE_KEY, resolveDoneColor, validColor } from './accent'
import { HINT_TEXT, collapsedSegments, expandedSegments, isExpanded, keepsEngineRow } from './summary'
import {
  SUMMARIES_STORE_KEY,
  SYSTEM,
  awaitBoth,
  cacheKey,
  cleanSummary,
  compactInput,
  inputOfEvent,
  resolveSummaries,
  summaryPrompt,
} from './summarize'

const collapsed = atom({ plugin: 'collapse-tools', key: 'collapsed' } as const, true as boolean)
const epoch = atom({ plugin: 'collapse-tools', key: 'epoch' } as const, 0)
// True once the startup hint toast was shown, so it appears once per session.
const hinted = atom({ plugin: 'collapse-tools', key: 'hinted' } as const, false as boolean)
// The color set by `/collapse-tools color`, loaded from the plugin store at session start; null
// defers to the plugin option `doneColor`.
const doneColorOverride = atom({ plugin: 'collapse-tools', key: 'doneColorOverride' } as const, null as string | null)
// The setting saved by `/collapse-tools summary on|off`, loaded from the plugin store; null defers to
// the plugin option `summaries`.
const summariesOn = atom({ plugin: 'collapse-tools', key: 'summariesOn' } as const, null as boolean | null)
// The Haiku summary of each call, keyed by tool_use_id. Written by the tool.call hook, read by the render.
const summaryRef = { plugin: 'collapse-tools', key: 'summaries' } as const
// Summaries already made this session, keyed by a hash of the tool and its compact input.
const summaryCacheRef = { plugin: 'collapse-tools', key: 'summaryCache' } as const
// Per-call override family: each member is addressed by tool_use_id, so a click redraws only that call.
const overrideRef = { plugin: 'collapse-tools', key: 'overrides' } as const

type Override = { epoch: number; open: boolean }

// A member written under an older epoch was reset by /collapse-tools and counts as no override.
const openOf = (entry: Override | undefined, current: number): boolean | undefined =>
  entry !== undefined && entry.epoch === current ? entry.open : undefined

const STORE_KEY = 'collapsed'
const USAGE =
  'Usage: /collapse-tools (toggle all) | /collapse-tools color <name|#hex|reset> | /collapse-tools summary on|off'
const SUMMARY_USAGE = 'Usage: /collapse-tools summary on|off'
const unknownColorText = (value: string): string =>
  `Unknown color "${value}". Use a name (red, green, yellow, blue, magenta, cyan, white, gray, claude, or a ...Bright variant) or #rrggbb.`

async function loadSavedColor($: EngineInterface): Promise<void> {
  try {
    const saved = validColor(await $.store.get(DONE_COLOR_STORE_KEY))
    if (saved !== null) await update($, doneColorOverride, () => saved)
  } catch (error) {
    $.ui.log(`collapse-tools: color load failed ${String(error)}`, { to: 'debug' })
  }
}

async function runColorCommand($: EngineInterface, value: string): Promise<{ text: string }> {
  if (value.toLowerCase() === 'reset') {
    await update($, doneColorOverride, () => null)
    try {
      await $.store.delete(DONE_COLOR_STORE_KEY)
    } catch (error) {
      $.ui.log(`collapse-tools: color store delete failed ${String(error)}`, { to: 'debug' })

      return { text: 'Completed-call color reset for this session only; the saved color could not be cleared.' }
    }

    return { text: 'Completed-call color reset. The saved color is cleared for future sessions.' }
  }
  if (value === '') return { text: USAGE }
  const color = validColor(value)
  if (color === null) return { text: unknownColorText(value) }
  await update($, doneColorOverride, () => color)
  try {
    await $.store.set(DONE_COLOR_STORE_KEY, color)
  } catch (error) {
    $.ui.log(`collapse-tools: color store write failed ${String(error)}`, { to: 'debug' })

    return { text: `Completed-call color set to ${color} for this session only; it could not be saved.` }
  }

  return { text: `Completed-call color set to ${color}. Saved for future sessions.` }
}

async function loadSavedSummaries($: EngineInterface): Promise<void> {
  try {
    const saved = await $.store.get(SUMMARIES_STORE_KEY)
    if (typeof saved === 'boolean') await update($, summariesOn, () => saved)
  } catch (error) {
    $.ui.log(`collapse-tools: summaries load failed ${String(error)}`, { to: 'debug' })
  }
}

async function runSummaryCommand($: EngineInterface, value: string): Promise<{ text: string }> {
  const word = value.toLowerCase()
  if (word !== 'on' && word !== 'off') return { text: SUMMARY_USAGE }
  const enabled = word === 'on'
  await update($, summariesOn, () => enabled)
  const label = enabled ? 'on' : 'off'
  try {
    await $.store.set(SUMMARIES_STORE_KEY, enabled)
  } catch (error) {
    $.ui.log(`collapse-tools: summaries store write failed ${String(error)}`, { to: 'debug' })

    return { text: `Haiku summaries ${label} for this session only; the choice could not be saved.` }
  }

  return { text: `Haiku summaries ${label}. Saved for future sessions.` }
}

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

// Asks Haiku for a one-line label of the call and stores it for the render. `option` is the plugin
// option `summaries`. Never rejects: on any failure the row keeps the raw arg and one debug line says why.
async function summarizeCall(
  $: EngineInterface,
  tool: string,
  id: string,
  // unknown: the tool.call event carries the model's arbitrary JSON arguments beside its own keys.
  event: Readonly<Record<string, unknown>>,
  // unknown: the plugin option is untyped; resolveSummaries accepts only a boolean.
  option: unknown,
): Promise<void> {
  try {
    if (!resolveSummaries(await read($, summariesOn), option)) return
    const compact = compactInput(tool, inputOfEvent(event))
    const cacheMember = { ...summaryCacheRef, id: cacheKey(tool, compact) }
    let text = await read($, cacheMember)
    if (text === undefined) {
      const reply = await $.model.complete({
        model: 'haiku',
        system: SYSTEM,
        prompt: summaryPrompt(tool, compact),
        effort: 'low',
        maxTokens: 40,
        timeoutMs: 4000,
      })
      if (!reply.isAnswered) {
        $.ui.log(`collapse-tools: summary skipped for ${tool}: ${reply.reason}`, { to: 'debug' })
        return
      }
      text = cleanSummary(reply.text)
      if (text === '') return
      const fresh = text
      await update($, cacheMember, () => fresh)
    }
    const label = text
    await update($, { ...summaryRef, id }, () => label)
  } catch (error) {
    $.ui.log(`collapse-tools: summary failed for ${tool}: ${String(error)}`, { to: 'debug' })
  }
}

export const register: Register = (on, options) => {
  // Effective color = saved `/collapse-tools color` (doneColorOverride) ?? plugin option ?? default.
  const configColor = resolveDoneColor(null, options.doneColor)

  on('session.start', async ($, e, next) => {
    await loadSaved($)
    await loadSavedColor($)
    await loadSavedSummaries($)
    await $.command.register({
      name: 'collapse-tools',
      description: 'Toggle between one-line and full tool-call rows, or set the done color',
      argumentHint: 'color <name|#hex|reset> | summary on|off',
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
    // Atoms reset on /clear without a session.start, so reload the color when it is unset.
    if ((await read($, doneColorOverride)) === null) await loadSavedColor($)
    if ((await read($, summariesOn)) === null) await loadSavedSummaries($)

    return next(e)
  })

  // The tool runs at once; the summary is made beside it and both are awaited, so the hook resolves
  // with exactly what the tool did.
  on('tool.call', async ($, e, next) => {
    const run = next(e)
    const side = summarizeCall($, e.tool, e.tool_use_id, e, options.summaries)

    return awaitBoth(run, side)
  })

  on('command.run', { command: 'collapse-tools' }, async ($, e) => {
    const raw = e.args.trim()
    const word = raw.toLowerCase()
    if (word === 'color' || word.startsWith('color ')) return runColorCommand($, raw.slice('color'.length).trim())
    if (word === 'summary' || word.startsWith('summary ')) return runSummaryCommand($, raw.slice('summary'.length).trim())
    if (raw !== '') return { text: USAGE }
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
    const [global, current, entry, override, summariesFlag, summary] = await Promise.all([
      read($, collapsed),
      read($, epoch),
      read($, member),
      read($, doneColorOverride),
      read($, summariesOn),
      read($, { ...summaryRef, id }),
    ])
    const doneColor = override ?? configColor
    const open = isExpanded(global, openOf(entry, current))
    const toggle = async () => {
      const [g, ep] = await Promise.all([read($, collapsed), read($, epoch)])
      await update($, member, cur => ({ epoch: ep, open: !isExpanded(g, openOf(cur, ep)) }))
    }
    const call = e.props
    const segments = open
      ? expandedSegments(call, e.viewport?.columns, doneColor)
      : collapsedSegments(
          call,
          e.viewport?.columns,
          doneColor,
          resolveSummaries(summariesFlag, options.summaries) ? summary : undefined,
        )
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
