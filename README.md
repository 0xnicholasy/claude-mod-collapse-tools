<div align="center">
  <img src=".claude/skills/collapse-tools/.claude-plugin/icon.png" alt="Collapse Tools icon" width="120" height="120">
  <h1>Collapse Tools for Claude Code</h1>
  <p>Every tool-call row in the transcript as one dim line.</p>

  [![CI](https://github.com/0xnicholasy/claude-mod-collapse-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/0xnicholasy/claude-mod-collapse-tools/actions/workflows/ci.yml) ![Version](https://img.shields.io/github/package-json/v/0xnicholasy/claude-mod-collapse-tools?filename=.claude%2Fskills%2Fcollapse-tools%2F.claude-plugin%2Fplugin.json&label=version) [![License](https://img.shields.io/github/license/0xnicholasy/claude-mod-collapse-tools)](LICENSE) [![Stars](https://img.shields.io/github/stars/0xnicholasy/claude-mod-collapse-tools?style=flat)](https://github.com/0xnicholasy/claude-mod-collapse-tools/stargazers)

  <a href="#installation">Install</a> · <a href="#usage">Usage</a> · <a href="#how-it-works">How it works</a>
</div>

Collapse Tools is a Claude Code plugin that draws each tool-call row in the transcript as one dim line, to save screen rows. Click a line to expand that call, or run `/collapse-tools` to switch every call between one-line and full rows.

Collapsed rows:

```
> Bash(npm run check) . done
> github - create_issue (MCP) . running
```

An expanded call keeps a `v` header above the engine's normal row and result:

```
v Bash(npm run check) . done
```

## Features

- One-line rows. Each call reads `> Tool(arg) . status`, cut to the terminal width. Status is `running`, `error`, `interrupted` or `done`.
- Readable names. An MCP tool `mcp__server__tool` shows as `server - tool (MCP)`.
- Click to expand. Clicking a line expands that call. The `v Tool(arg) . status` header stays, and clicking it collapses the call again.
- `/collapse-tools` command. Switches the default for all calls and clears per-call toggles. The choice is saved across sessions.
- Collapsed results. The result block of a collapsed call is not drawn.
- Tool groups such as `Read 3 files` are left to the engine.

## Installation

Install from the parent marketplace:

```
/plugin marketplace add 0xnicholasy/claude-mods
/plugin install collapse-tools@claude-mods
```

The same works from the shell as `claude plugin marketplace add 0xnicholasy/claude-mods` and `claude plugin install collapse-tools@claude-mods`. Add `-s project` to install for one project only (scopes: `user`, `project`, `local`; default `user`).

To run from a checkout instead:

```
git clone https://github.com/0xnicholasy/claude-mod-collapse-tools.git
cd claude-mod-collapse-tools
claude --plugin-dir .claude/skills/collapse-tools
```

Run it from the repo root, or pass the absolute path to `.claude/skills/collapse-tools`. An installed plugin takes precedence over a local copy with the same name, so uninstall it while developing. If `/collapse-tools` is not offered, run `claude plugin list` to check that the plugin is loaded and enabled.

Update (restart required):

```
claude plugin marketplace update claude-mods
claude plugin update collapse-tools@claude-mods
```

Uninstall with `claude plugin uninstall collapse-tools@claude-mods`.

## Usage

Tool calls are collapsed by default. Two controls change that:

| Control | Effect |
|---|---|
| `/collapse-tools` | Flips the default for all calls (collapsed to expanded, or back) and clears every per-call toggle. Replies "Tool calls collapsed to one line." or "Tool calls expanded." The new default is saved. |
| Click a line | Toggles that one call against the current default. Not saved across sessions. |

A per-call toggle beats the default until the next `/collapse-tools`. The status shown is `interrupted` if the call was aborted, otherwise `error` if it failed, otherwise `running` while it runs, otherwise `done`.

The argument shown is the first non-empty string among the call's `command`, `file_path`, `path`, `pattern`, `description`, `title` and `op` fields. If none is present, the first string field of the input is used. Whitespace is collapsed and the argument is cut to 60 characters with `...`. A line is cut to the terminal width, or to 100 characters when the width is unknown.

## How it works

The plugin registers five hooks in `.claude/skills/collapse-tools/hooks/register.tsx`. The pure logic (argument picking, status, line building, expand rule) is in `hooks/summary.ts`.

| Hook | What it does |
|---|---|
| `session.start` | Loads the saved default from the plugin store and registers the `/collapse-tools` command. |
| `turn.start` | Reloads the saved default. `/clear` resets the atoms and no `session.start` follows, so this restores the choice on the next turn. |
| `command.run` (`collapse-tools`) | Flips the default, increments the epoch (which invalidates per-call toggles), saves the default to the store and returns the reply text. |
| `ui.render` (`ToolUse`) | Replaces the call row with a dim button line. When the call is expanded, draws the `v` header and then the engine's own row. |
| `ui.render` (`ToolResult`) | Draws the engine's result when the call is expanded. Otherwise returns a `Box` with `display="none"`. |

State atoms (declared in `types/index.d.ts` under `collapse-tools`):

| Atom | Type | Purpose |
|---|---|---|
| `collapsed` | boolean | The default for all calls. Starts `true`. |
| `epoch` | number | Counter bumped by `/collapse-tools`. A toggle written under an older epoch counts as no toggle. |
| `overrides` | family of `{ epoch, open }` | Per-call toggle, keyed by `tool_use_id`. A click redraws only that call. |

Only `collapsed` is persisted, under the plugin store key `collapsed`. If a store read or write fails, the error goes to the debug log and the in-session value is kept. Render hooks never write state; writes happen in the click handler and in `command.run`.

## Data and privacy

- The plugin makes no network calls.
- The only persisted data is the default choice, stored under one plugin store key (`collapsed`) when you run `/collapse-tools`.
- Per-call toggles and the epoch live in session state and are not written to disk by the plugin.
- The plugin reads tool-call inputs only to build the one-line summary on screen. It does not store them, log them or send them anywhere.
- It reads no credentials or environment variables, and does not read or write files or run processes.

## Requirements

- Claude Code 2.1.295 or later, the version the API types were taken from, with plugin hooks.
- A surface that draws the transcript with the engine's `ToolUse` and `ToolResult` components and delivers clicks. Only the terminal surface is assumed; other surfaces are untested.

## Development

```
npm install
npm run check
```

`npm run check` runs `validate` (`claude plugin validate`), `typecheck` (`tsc -p tsconfig.json`) and `test` (`claude plugin test`). Validate and test need the `claude` CLI and run locally only; CI runs typecheck.

- Mod path: `.claude/skills/collapse-tools/` (manifest `.claude-plugin/plugin.json`, hooks in `hooks/`, state contract in `types/index.d.ts`). Bump the version in `plugin.json` for releases.
- Hot reload: saving a file in the mod reloads the module in a running session. The default and per-call toggles survive because state lives in `$.state` atoms and not in module variables.
- Under the RTK shell hook, run the check as `rtk proxy npm run check`.

## Known limitations

- Not verified in a live session: how the collapsed result block spacing looks, and whether a click lands on the line on every surface.
- The collapsed result is a Box with display none, so a margin the engine puts around results may still show.

## License

MIT. See [LICENSE](LICENSE).
