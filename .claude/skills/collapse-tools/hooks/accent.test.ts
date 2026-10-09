import { expect, test } from 'claude-code/testing'
import { resolveDoneColor, validColor } from './accent'
import { DEFAULT_DONE_COLOR } from './summary'

test('saved beats the option, which beats the default', async () => {
  expect(resolveDoneColor('magenta', 'green')).toBe('magenta')
  expect(resolveDoneColor(undefined, 'green')).toBe('green')
  expect(resolveDoneColor(undefined, undefined)).toBe(DEFAULT_DONE_COLOR)
})

test('an invalid saved color is skipped, and an invalid option falls to the default', async () => {
  expect(resolveDoneColor('red;rm', 'green')).toBe('green')
  expect(resolveDoneColor(42, 'red;rm')).toBe(DEFAULT_DONE_COLOR)
})

test('names, Bright variants in any case, claude and hex are accepted; other names are not', async () => {
  expect(validColor('RedBright')).toBe('redBright')
  expect(validColor('claude')).toBe('claude')
  expect(validColor('#7d9a83')).toBe('#7d9a83')
  expect(validColor('orange')).toBeNull()
})
