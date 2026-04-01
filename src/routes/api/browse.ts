import { createFileRoute } from '@tanstack/react-router'
import { listBrowseItems } from '#/lib/cases'

export const Route = createFileRoute('/api/browse')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const prefix = url.searchParams.get('prefix') ?? ''

        try {
          const result = await listBrowseItems(prefix)
          return Response.json(result, {
            headers: {
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          return Response.json(
            {
              error: (error as Error).message,
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
