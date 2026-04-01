import { describe, expect, it } from 'vitest'
import {
  extractTicketFromCommandQuery,
  isCommandPaletteShortcut,
  resolveTicketForCommand,
} from './command'

describe('command helpers', () => {
  it('accepts ctrl/cmd + k keyboard shortcut', () => {
    expect(isCommandPaletteShortcut({ key: 'k', ctrlKey: true, metaKey: false })).toBe(
      true,
    )
    expect(isCommandPaletteShortcut({ key: 'K', ctrlKey: false, metaKey: true })).toBe(
      true,
    )
  })

  it('rejects non-k or no modifier shortcuts', () => {
    expect(isCommandPaletteShortcut({ key: 'j', ctrlKey: true, metaKey: false })).toBe(
      false,
    )
    expect(isCommandPaletteShortcut({ key: 'k', ctrlKey: false, metaKey: false })).toBe(
      false,
    )
  })

  it('resolves command ticket using input first and fallback to current ticket', () => {
    expect(resolveTicketForCommand('mamas-7300', 'MAMAS-7200')).toBe('MAMAS-7300')
    expect(resolveTicketForCommand('   ', 'MAMAS-7200')).toBe('MAMAS-7200')
    expect(resolveTicketForCommand('   ', '')).toBe('')
  })

  it('extracts a ticket id from command query text', () => {
    expect(extractTicketFromCommandQuery('load mamas-7348')).toBe('MAMAS-7348')
    expect(extractTicketFromCommandQuery('MAMAS_ABC-12 details')).toBe('MAMAS_ABC-12')
    expect(extractTicketFromCommandQuery('switch to contents')).toBe('')
  })
})
