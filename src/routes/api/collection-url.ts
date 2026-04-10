import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/env'

export const Route = createFileRoute('/api/collection-url')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const filePath = url.searchParams.get('path') ?? ''

        if (!filePath.trim()) {
          return Response.json({ error: 'path query parameter is required' }, { status: 400 })
        }

        const user = encodeURIComponent(env.BASIC_AUTH_USERNAME)
        const pass = encodeURIComponent(env.BASIC_AUTH_PASSWORD)
        const origin = env.SERVER_URL || url.origin
        const fileUrl = `${origin}/api/file?path=${encodeURIComponent(filePath)}`

        const parsed = new URL(fileUrl)
        parsed.username = user
        parsed.password = pass

        return Response.json(
          { url: parsed.toString() },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      },
    },
  },
})
