// Every atom is declared inline: `claude plugin validate` refuses a PluginState entry that points at an alias.
declare module 'claude-code' {
  interface PluginState {
    'collapse-tools': {
      // The global default: true draws every tool call as one line.
      collapsed: boolean
      // Calls the person toggled by clicking, by tool_use_id; a present entry beats `collapsed`.
      overrides: Record<string, boolean>
    }
  }
}
