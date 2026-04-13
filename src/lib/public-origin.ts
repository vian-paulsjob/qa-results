type ResolvePublicOriginOptions = {
  requestUrl: string
  headers: Headers
  configuredServerUrl?: string
}

function firstCsvValue(value: string | null): string | undefined {
  if (!value) return undefined
  const first = value.split(',')[0]?.trim()
  return first || undefined
}

function normalizeProto(value: string | undefined): 'http' | 'https' | undefined {
  if (!value) return undefined
  const normalized = value.trim().replace(/:$/, '').toLowerCase()
  if (normalized === 'http' || normalized === 'https') {
    return normalized
  }
  return undefined
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseForwardedHeader(value: string | null): { proto?: string; host?: string } {
  const firstEntry = firstCsvValue(value)
  if (!firstEntry) return {}

  const parts = firstEntry.split(';')
  let proto: string | undefined
  let host: string | undefined

  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=')
    if (!rawKey || rest.length === 0) continue
    const key = rawKey.trim().toLowerCase()
    const rawValue = rest.join('=')
    const normalizedValue = unquote(rawValue)
    if (!normalizedValue) continue

    if (key === 'proto' && !proto) proto = normalizedValue
    if (key === 'host' && !host) host = normalizedValue
  }

  return { proto, host }
}

export function resolvePublicOrigin(options: ResolvePublicOriginOptions): string {
  const requestUrl = new URL(options.requestUrl)
  const forwarded = parseForwardedHeader(options.headers.get('forwarded'))
  const forwardedProto = normalizeProto(
    forwarded.proto ?? firstCsvValue(options.headers.get('x-forwarded-proto')),
  )
  const forwardedHost =
    firstCsvValue(forwarded.host ?? null)
    ?? firstCsvValue(options.headers.get('x-forwarded-host'))
    ?? firstCsvValue(options.headers.get('host'))
    ?? requestUrl.host

  if (options.configuredServerUrl) {
    const configured = new URL(options.configuredServerUrl)
    if (forwardedProto) {
      configured.protocol = `${forwardedProto}:`
    }
    return configured.origin
  }

  const resolvedProtocol = forwardedProto ?? requestUrl.protocol.replace(/:$/, '')

  return `${resolvedProtocol}://${forwardedHost}`
}
