import { createHmac, timingSafeEqual } from 'node:crypto'

export type ShareTokenPayload = {
  ticket: string
  version?: string
  exp: number
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64')
}

function signPayload(payloadB64: string, secret: string) {
  return createHmac('sha256', secret).update(payloadB64).digest()
}

export function createShareToken(payload: ShareTokenPayload, secret: string) {
  const payloadB64 = toBase64Url(JSON.stringify(payload))
  const signatureB64 = toBase64Url(signPayload(payloadB64, secret))
  return `${payloadB64}.${signatureB64}`
}

export function verifyShareToken(token: string, secret: string, nowMs = Date.now()) {
  const [payloadB64, signatureB64] = token.split('.')
  if (!payloadB64 || !signatureB64) {
    return null
  }

  const expectedSignature = signPayload(payloadB64, secret)
  const providedSignature = fromBase64Url(signatureB64)
  if (expectedSignature.length !== providedSignature.length) {
    return null
  }
  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return null
  }

  let payload: ShareTokenPayload
  try {
    payload = JSON.parse(fromBase64Url(payloadB64).toString('utf8')) as ShareTokenPayload
  } catch {
    return null
  }

  if (!payload || typeof payload.ticket !== 'string' || typeof payload.exp !== 'number') {
    return null
  }
  if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= nowMs) {
    return null
  }

  if (payload.version != null && typeof payload.version !== 'string') {
    return null
  }

  return payload
}
