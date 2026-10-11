# claude-mod-collapse-tools

A Claude Code mod ("Claude Fold"): draws every tool-call row in the transcript as one line; click a line to expand it, or run `/collapse-tools` to toggle all. Written in TypeScript (TSX) as a plugin of function hooks that hot-reloads in a session.

## Stack and commands

- Package manager: npm. Dev dependency: TypeScript 5.x.
- Mod path: `.claude/skills/collapse-tools/` (manifest in `.claude-plugin/plugin.json`, hooks in `hooks/`, state contract in `types/index.d.ts`). Pure logic is in `hooks/summary.ts`; `hooks/register.tsx` wires it to the hooks.
- Claude Code version the API types came from: 2.1.295. The API declarations are vendored at `vendor/claude-code/claude-code.d.ts`; never edit that file, regenerate it by loading the plugin-authoring skill.
- `npm run check` is the gate. It runs `validate` (`claude plugin validate`), `typecheck` (`tsc -p tsconfig.json`) and `test` (`claude plugin test`). Validate and test need the claude CLI and run locally only; CI runs typecheck.

## Rules

- No emoji in code.
- No `any` or `unknown` without a comment that justifies it.
- Never silence a TypeScript error with `// eslint-disable`.
- State lives in `$.state` atoms declared in `types/index.d.ts`, never in module variables.
- Render hooks never write state; writes happen in `onPress` and `command.run`.

## Delivery

- Build with a `sonnet` implementation agent.
- Tests: `npm run check`.
- Docs to update: `README.md`.
