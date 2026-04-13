import { describe, expect, it } from 'vitest'
import { resolvePublicOrigin } from './public-origin'

function makeHeaders(values: Record<string, string>): Headers {
  return new Headers(values)
}

describe('resolvePublicOrigin', () => {
  it('uses configured server URL when no forwarding headers are present', () => {
    const origin = resolvePublicOrigin({
      requestUrl: 'http://127.0.0.1:3000/api/collection-url?path=a',
      headers: makeHeaders({}),
      configuredServerUrl: 'http://qa-results.example.com',
    })

    expect(origin).toBe('http://qa-results.example.com')
  })

  it('upgrades configured server URL to https when x-forwarded-proto is https', () => {
    const origin = resolvePublicOrigin({
      requestUrl: 'http://127.0.0.1:3000/api/collection-url?path=a',
      headers: makeHeaders({ 'x-forwarded-proto': 'https' }),
      configuredServerUrl: 'http://qa-results.example.com',
    })

    expect(origin).toBe('https://qa-results.example.com')
  })

  it('derives origin from x-forwarded headers when no configured server URL exists', () => {
    const origin = resolvePublicOrigin({
      requestUrl: 'http://127.0.0.1:3000/api/collection-url?path=a',
      headers: makeHeaders({
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'qa-results.example.com',
      }),
    })

    expect(origin).toBe('https://qa-results.example.com')
  })

  it('supports standard forwarded header', () => {
    const origin = resolvePublicOrigin({
      requestUrl: 'http://127.0.0.1:3000/api/collection-url?path=a',
      headers: makeHeaders({
        forwarded: 'for=1.1.1.1;proto=https;host=qa-results.example.com',
      }),
    })

    expect(origin).toBe('https://qa-results.example.com')
  })

  it('falls back to request origin when forwarding headers are missing', () => {
    const origin = resolvePublicOrigin({
      requestUrl: 'http://127.0.0.1:3000/api/collection-url?path=a',
      headers: makeHeaders({}),
    })

    expect(origin).toBe('http://127.0.0.1:3000')
  })
})
