import { describe, expect, it } from 'vitest'
import { buildOgMetadata } from './seo'

describe('buildOgMetadata', () => {
  it('returns ticket-specific metadata when ticket is provided', () => {
    const result = buildOgMetadata({
      siteUrl: 'https://qa-results.example.com',
      ticketRaw: 'mamas-7318',
      versionRaw: 'v2',
    })

    expect(result.title).toBe('QA Test Result - MAMAS-7318')
    expect(result.description).toBe('View QA report for ticket MAMAS-7318 (version v2).')
    expect(result.url).toBe('https://qa-results.example.com/?ticket=MAMAS-7318&version=v2')
    expect(result.image).toBe('https://qa-results.example.com/favicon.ico')
  })

  it('falls back to base metadata when ticket is missing or invalid', () => {
    const result = buildOgMetadata({
      siteUrl: 'https://qa-results.example.com',
      ticketRaw: '../invalid',
      versionRaw: '',
    })

    expect(result.title).toBe('QA Test Result')
    expect(result.description).toBe(
      'QA Results Viewer runs on TanStack Start and reads case artifacts from the configured CASES_DIR.',
    )
    expect(result.url).toBe('https://qa-results.example.com/')
    expect(result.image).toBe('https://qa-results.example.com/favicon.ico')
  })
})
