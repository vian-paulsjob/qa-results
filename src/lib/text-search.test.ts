import { describe, expect, it } from 'vitest'
import { countTextMatches, normalizeSearchQuery, splitTextMatches } from './text-search'

describe('text search helpers', () => {
  it('trims search input before matching', () => {
    expect(normalizeSearchQuery('  token  ')).toBe('token')
  })

  it('finds matches without caring about case', () => {
    expect(countTextMatches('Email email EMAIL', 'email')).toBe(3)
  })

  it('returns plain text when the query is empty', () => {
    expect(splitTextMatches('hello world', '   ')).toEqual([
      { text: 'hello world', match: false },
    ])
  })

  it('splits matching and non-matching segments in order', () => {
    expect(splitTextMatches('statusCode status', 'status')).toEqual([
      { text: 'status', match: true },
      { text: 'Code ', match: false },
      { text: 'status', match: true },
    ])
  })
})
