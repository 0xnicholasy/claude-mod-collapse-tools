# claude-mod-collapse-tools

Draws every tool-call row in the Claude Code transcript as one dim line, to save screen rows:

```
> Bash(npm run check) . done
> github - create_issue (MCP) . running
```

## Run it

```
claude --plugin-dir ./.claude/skills/collapse-tools
```

## What it does

- Collapsed by default: `> Tool(arg) . status`, status is `running`, `error`, `interrupted` or `done`, cut to the terminal width.
- Click a line to expand that call. An expanded call keeps a `v Tool(arg) . status` header (click it to collapse again) above the engine's normal row and result.
- `/collapse-tools` flips the default for all calls and clears per-call toggles. The choice is saved in the plugin store and survives sessions.
- Tool groups (`Read 3 files`) are left to the engine.

## Requirements

Claude Code 2.1.295 or later with plugin hooks.

## Develop

`npm run check` runs validate, typecheck and test (validate and test need the local claude CLI).

## Known limits

- Not verified in a live session: how the collapsed result block spacing looks, and whether a click lands on the line on every surface.
- The collapsed result is a Box with display none, so a margin the engine puts around results may still show.
