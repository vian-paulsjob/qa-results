import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createFileRoute } from '@tanstack/react-router'
import { assertTicket, getCasesRoot } from '#/lib/cases'

const execFileAsync = promisify(execFile)

function normalizeVersion(raw: string) {
  const normalized = (raw || '').trim()
  if (!/^v\d+$/i.test(normalized)) {
    throw new Error('version query parameter must be in vN format')
  }
  return normalized.toLowerCase()
}

function parseBooleanQuery(value: string | null) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  )
}

function ensureInsideRoot(absolutePath: string, root: string) {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(absolutePath)

  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error('Path escapes CASES_DIR')
  }
}

function normalizeArchiveEntry(entryRaw: string) {
  const raw = String(entryRaw || '').trim()
  if (!raw || raw.endsWith('/')) {
    return null
  }

  const withoutDotPrefix = raw.replace(/^\.\/+/, '')
  const normalized = path.posix.normalize(withoutDotPrefix)
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`Invalid archive entry path: ${raw}`)
  }

  return normalized
}

function normalizeUploadPath(pathRaw: string) {
  const raw = String(pathRaw || '').trim()
  if (!raw || raw.endsWith('/')) {
    throw new Error('path query parameter must reference a file')
  }

  const withoutDotPrefix = raw.replace(/^\.\/+/, '').replace(/\\/g, '/')
  const normalized = path.posix.normalize(withoutDotPrefix)
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`Invalid upload path: ${raw}`)
  }

  return normalized
}

async function listArchiveEntries(archivePath: string) {
  const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], {
    maxBuffer: 10 * 1024 * 1024,
  })

  const uniqueEntries = new Set<string>()
  String(stdout)
    .split('\n')
    .forEach((line) => {
      const normalized = normalizeArchiveEntry(line)
      if (normalized) {
        uniqueEntries.add(normalized)
      }
    })

  return [...uniqueEntries]
}

async function extractArchiveEntry(archivePath: string, entryPath: string) {
  const { stdout } = await execFileAsync('tar', ['-xOf', archivePath, entryPath], {
    encoding: 'buffer',
    maxBuffer: 50 * 1024 * 1024,
  })
  return stdout as Buffer
}

async function writeRequestBodyToFile(request: Request, destinationPath: string) {
  if (!request.body) {
    throw new Error('Request body is required')
  }

  const nodeReadable = Readable.fromWeb(request.body as ReadableStream<Uint8Array>)
  await pipeline(nodeReadable, createWriteStream(destinationPath))
}

export const Route = createFileRoute('/api/upload-ticket')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const ticketRaw = url.searchParams.get('ticket') ?? ''
        const versionRaw = url.searchParams.get('version') ?? ''
        const pathRaw = url.searchParams.get('path')
        const replace = parseBooleanQuery(url.searchParams.get('replace'))

        if (!ticketRaw.trim()) {
          return Response.json(
            { error: 'ticket query parameter is required' },
            { status: 400 },
          )
        }
        if (!versionRaw.trim()) {
          return Response.json(
            { error: 'version query parameter is required' },
            { status: 400 },
          )
        }

        let ticket = ''
        let version = ''
        try {
          ticket = assertTicket(ticketRaw)
          version = normalizeVersion(versionRaw)
        } catch (error) {
          return Response.json(
            { error: (error as Error).message },
            { status: 400 },
          )
        }

        const casesRoot = getCasesRoot()
        const ticketVersionRoot = path.join(casesRoot, ticket, version)

        if (pathRaw) {
          try {
            const relativePath = normalizeUploadPath(pathRaw)
            const destinationPath = path.join(ticketVersionRoot, relativePath)

            ensureInsideRoot(ticketVersionRoot, casesRoot)
            ensureInsideRoot(destinationPath, ticketVersionRoot)

            if (replace) {
              await rm(ticketVersionRoot, { recursive: true, force: true })
            }
            await mkdir(path.dirname(destinationPath), { recursive: true })

            const body = Buffer.from(await request.arrayBuffer())
            await writeFile(destinationPath, body)

            return Response.json(
              {
                ok: true,
                ticket,
                version,
                path: relativePath,
                uploadedFiles: 1,
                replaced: replace,
              },
              {
                headers: {
                  'Cache-Control': 'no-store',
                },
              },
            )
          } catch (error) {
            return Response.json(
              { error: (error as Error).message || 'Upload failed' },
              { status: 400 },
            )
          }
        }

        let tempRoot = ''
        try {
          tempRoot = await mkdtemp(path.join(tmpdir(), 'qa-results-upload-'))
          const archivePath = path.join(tempRoot, 'ticket.tar.gz')

          await writeRequestBodyToFile(request, archivePath)
          const archiveStat = await stat(archivePath)
          if (archiveStat.size <= 0) {
            throw new Error('Uploaded archive is empty')
          }

          const entries = await listArchiveEntries(archivePath)
          if (entries.length === 0) {
            throw new Error('Archive does not contain any files')
          }

          await rm(ticketVersionRoot, { recursive: true, force: true })
          await mkdir(ticketVersionRoot, { recursive: true })
          ensureInsideRoot(ticketVersionRoot, casesRoot)

          for (const entry of entries) {
            const destinationPath = path.join(ticketVersionRoot, entry)
            ensureInsideRoot(destinationPath, ticketVersionRoot)
            await mkdir(path.dirname(destinationPath), { recursive: true })

            const content = await extractArchiveEntry(archivePath, entry)
            await writeFile(destinationPath, content)
          }

          return Response.json(
            {
              ok: true,
              ticket,
              version,
              uploadedFiles: entries.length,
            },
            {
              headers: {
                'Cache-Control': 'no-store',
              },
            },
          )
        } catch (error) {
          return Response.json(
            { error: (error as Error).message || 'Upload failed' },
            { status: 400 },
          )
        } finally {
          if (tempRoot) {
            await rm(tempRoot, { recursive: true, force: true })
          }
        }
      },
    },
  },
})
