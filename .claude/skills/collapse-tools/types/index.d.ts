declare module 'claude-code' {
  interface PluginState {
    'collapse-tools': {
      collapsed: boolean
      epoch: number
      overrides: StateFamily<{ epoch: number; open: boolean }>
    }
  }
}
