import { createFileRoute } from '@tanstack/react-router'
import { approveDraft, assertTicket } from '#/lib/cases'

export const Route = createFileRoute('/api/approve-ticket')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const ticketRaw = url.searchParams.get('ticket') ?? ''

        if (!ticketRaw.trim()) {
          return Response.json(
            { error: 'ticket query parameter is required' },
            { status: 400 },
          )
        }

        try {
          const ticket = assertTicket(ticketRaw)
          const approved = await approveDraft(ticket)

          return Response.json(
            {
              ok: true,
              ticket: approved.ticket,
              approvedVersion: approved.version,
            },
            {
              headers: {
                'Cache-Control': 'no-store',
              },
            },
          )
        } catch (error) {
          const message = (error as Error).message || 'Approval failed'
          const status = /Draft not found/i.test(message) ? 404 : 400
          return Response.json({ error: message }, { status })
        }
      },
    },
  },
})
