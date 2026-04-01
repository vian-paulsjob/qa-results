import { describe, expect, it } from 'vitest'
import { createShareToken, verifyShareToken } from './share'

describe('share token helpers', () => {
  it('creates and verifies a valid token', () => {
    const now = Date.now()
    const secret = 'unit-test-share-secret'
    const token = createShareToken(
      {
        ticket: 'MAMAS-7348',
        version: 'v2',
        exp: Math.floor(now / 1000) + 3600,
      },
      secret,
    )

    const payload = verifyShareToken(token, secret, now)
    expect(payload).toEqual({
      ticket: 'MAMAS-7348',
      version: 'v2',
      exp: Math.floor(now / 1000) + 3600,
    })
  })

  it('rejects expired tokens', () => {
    const now = Date.now()
    const secret = 'unit-test-share-secret'
    const token = createShareToken(
      {
        ticket: 'MAMAS-7348',
        exp: Math.floor(now / 1000) - 1,
      },
      secret,
    )

    expect(verifyShareToken(token, secret, now)).toBeNull()
  })

  it('rejects tampered tokens', () => {
    const now = Date.now()
    const secret = 'unit-test-share-secret'
    const token = createShareToken(
      {
        ticket: 'MAMAS-7348',
        exp: Math.floor(now / 1000) + 3600,
      },
      secret,
    )

    const tampered = token.replace('M', 'N')
    expect(verifyShareToken(tampered, secret, now)).toBeNull()
  })
})
