declare module 'claude-code' {
  interface PluginState {
    'collapse-tools': {
      collapsed: boolean
      epoch: number
      hinted: boolean
      overrides: StateFamily<{ epoch: number; open: boolean }>
    }
  }
}
