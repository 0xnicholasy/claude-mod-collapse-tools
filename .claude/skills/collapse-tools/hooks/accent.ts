import { DEFAULT_DONE_COLOR } from './summary'

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/
const BASE_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey']
const NAMED: Record<string, string> = Object.fromEntries([
  ...BASE_NAMES.map(name => [name, name]),
  ...BASE_NAMES.map(name => [`${name}bright`, `${name}Bright`]),
  ['claude', 'claude'],
])
export const DONE_COLOR_STORE_KEY = 'doneColor'

// `value` is unknown because it comes from the plugin option or the store, which are untyped.
export const validColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  if (HEX_PATTERN.test(value)) return value

  return Object.hasOwn(NAMED, value.toLowerCase()) ? (NAMED[value.toLowerCase()] ?? null) : null
}

export const resolveDoneColor = (saved: unknown, option: unknown): string =>
  validColor(saved) ?? validColor(option) ?? DEFAULT_DONE_COLOR
