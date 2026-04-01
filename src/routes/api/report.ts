import { createFileRoute } from '@tanstack/react-router'
import { resolveReport } from '#/lib/cases'

export const Route = createFileRoute('/api/report')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const ticket = url.searchParams.get('ticket') ?? ''
        const version = url.searchParams.get('version') ?? ''

        if (!ticket.trim()) {
          return Response.json(
            {
              error: 'ticket query parameter is required',
            },
            { status: 400 },
          )
        }

        try {
          const result = await resolveReport(ticket, version)
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
            { status: 404 },
          )
        }
      },
    },
  },
})
