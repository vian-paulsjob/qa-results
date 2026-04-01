import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { resolveFileForRead } from '#/lib/cases'

function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.md':
    case '.markdown':
      return 'text/markdown; charset=utf-8'
    case '.txt':
    case '.log':
      return 'text/plain; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.xml':
      return 'application/xml; charset=utf-8'
    case '.csv':
      return 'text/csv; charset=utf-8'
    case '.tsv':
      return 'text/tab-separated-values; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

export const Route = createFileRoute('/api/file')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const filePath = url.searchParams.get('path') ?? ''

        if (!filePath.trim()) {
          return Response.json(
            {
              error: 'path query parameter is required',
            },
            { status: 400 },
          )
        }

        try {
          const file = await resolveFileForRead(filePath)

          return new Response(file.stream, {
            status: 200,
            headers: {
              'Content-Type': getContentType(file.normalizedPath),
              'Content-Length': String(file.stat.size),
              'Last-Modified': file.stat.mtime.toUTCString(),
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
