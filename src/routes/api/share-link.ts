import { createFileRoute } from '@tanstack/react-router'
import { assertTicket } from '#/lib/cases'
import { createShareToken } from '#/lib/share'
import { env } from '#/env'

function parseTtlSeconds(raw: string | undefined) {
  const parsed = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60 * 60 * 24 * 7
  }
  return parsed
}

function getBaseUrl(requestUrl: string) {
  if (env.SERVER_URL) {
    return env.SERVER_URL.replace(/\/$/, '')
  }
  const url = new URL(requestUrl)
  return `${url.protocol}//${url.host}`
}

export const Route = createFileRoute('/api/share-link')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const ticketRaw = url.searchParams.get('ticket') ?? ''
        const versionRaw = (url.searchParams.get('version') ?? '').trim()

        if (!ticketRaw.trim()) {
          return Response.json(
            { error: 'ticket query parameter is required' },
            { status: 400 },
          )
        }

        let ticket = ''
        try {
          ticket = assertTicket(ticketRaw)
        } catch (error) {
          return Response.json(
            { error: (error as Error).message || 'Invalid ticket format' },
            { status: 400 },
          )
        }

        const ttlSeconds = parseTtlSeconds(env.SHARE_LINK_TTL_SECONDS)
        const nowSeconds = Math.floor(Date.now() / 1000)
        const expiresAtSeconds = nowSeconds + ttlSeconds
        const token = createShareToken(
          {
            ticket,
            version: versionRaw || undefined,
            exp: expiresAtSeconds,
          },
          env.SHARE_TOKEN_SECRET,
        )

        const baseUrl = getBaseUrl(request.url)
        const shareUrl = `${baseUrl}/share/${encodeURIComponent(token)}`

        return Response.json(
          {
            shareUrl,
            expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
          },
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        )
      },
    },
  },
})
