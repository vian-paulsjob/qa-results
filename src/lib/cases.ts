import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { env } from '#/env'

export type BrowseItem = {
  key: string
  name: string
  type: 'directory' | 'file'
  size?: string
  modified?: string
}

export type BrowseResult = {
  prefix: string
  items: BrowseItem[]
}

export type ReportVersionOption = {
  value: string
  label: string
  prefix: string
}

export type ReportResolveResult = {
  ticket: string
  reportPath: string
  selectedVersion: string
  versions: ReportVersionOption[]
  markdown: string
}

export const TICKET_PATTERN = /^[A-Z0-9][A-Z0-9_-]+$/
const REPORT_PATTERN = /^test-results(?:[.-][^/]+)?\.md$/i
const EXCLUDE_FILES = new Set(['index.html'])

export function getCasesRoot(casesDir = env.CASES_DIR) {
  return path.resolve(casesDir)
}

function toPosixPath(input: string) {
  return input.replace(/\\/g, '/').replace(/^\/+/, '')
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

function splitSafeSegments(input: string) {
  const normalized = toPosixPath(input).replace(/\/+$/, '')
  if (!normalized) {
    return []
  }

  const segments = normalized.split('/').filter(Boolean)
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('Invalid path segment')
    }
  }

  return segments
}

export function normalizePrefixPath(prefixRaw: string) {
  const segments = splitSafeSegments(prefixRaw)
  return segments.length ? `${segments.join('/')}/` : ''
}

export function normalizeFilePath(filePathRaw: string) {
  const segments = splitSafeSegments(filePathRaw)
  if (!segments.length) {
    throw new Error('Path is required')
  }
  return segments.join('/')
}

export function normalizeTicket(ticketRaw: string) {
  return (ticketRaw || '').trim().toUpperCase()
}

export function assertTicket(ticketRaw: string) {
  const ticket = normalizeTicket(ticketRaw)
  if (!TICKET_PATTERN.test(ticket)) {
    throw new Error('Invalid ticket format')
  }
  return ticket
}

function bytesToHuman(bytes: number) {
  if (!bytes) {
    return ''
  }

  const units = ['B', 'kB', 'MB', 'GB']
  let size = bytes
  let i = 0

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i += 1
  }

  return `${i === 0 ? size : size.toFixed(1)} ${units[i]}`
}

export async function listBrowseItems(prefixRaw: string, casesRoot = getCasesRoot()): Promise<BrowseResult> {
  const prefix = normalizePrefixPath(prefixRaw)
  const absoluteDir = path.join(casesRoot, ...splitSafeSegments(prefix))
  ensureInsideRoot(absoluteDir, casesRoot)

  let entries: Awaited<ReturnType<typeof fs.readdir>>

  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { prefix, items: [] }
    }
    throw error
  }

  const items: BrowseItem[] = []

  for (const entry of entries) {
    if (EXCLUDE_FILES.has(entry.name)) {
      continue
    }

    if (entry.isDirectory()) {
      items.push({
        key: `${prefix}${entry.name}/`,
        name: entry.name,
        type: 'directory',
      })
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const absoluteFile = path.join(absoluteDir, entry.name)
    const stat = await fs.stat(absoluteFile)

    items.push({
      key: `${prefix}${entry.name}`,
      name: entry.name,
      type: 'file',
      size: bytesToHuman(stat.size),
      modified: stat.mtime.toISOString(),
    })
  }

  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return { prefix, items }
}

function parseVersionNumber(version: string) {
  const match = version.match(/^v(\d+)$/i)
  return match ? Number(match[1]) : Number.NaN
}

async function findBestReportFile(directory: string) {
  let entries: Awaited<ReturnType<typeof fs.readdir>>

  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }

  const candidates: { name: string; modifiedMs: number }[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !REPORT_PATTERN.test(entry.name)) {
      continue
    }

    const stat = await fs.stat(path.join(directory, entry.name))
    candidates.push({
      name: entry.name,
      modifiedMs: stat.mtimeMs,
    })
  }

  candidates.sort((a, b) => {
    const aDefault = a.name === 'test-results.md'
    const bDefault = b.name === 'test-results.md'

    if (aDefault !== bDefault) {
      return aDefault ? -1 : 1
    }

    if (b.modifiedMs !== a.modifiedMs) {
      return b.modifiedMs - a.modifiedMs
    }

    return a.name.localeCompare(b.name)
  })

  return candidates[0] ?? null
}

export async function getReportVersions(ticket: string, casesRoot = getCasesRoot()): Promise<ReportVersionOption[]> {
  const normalizedTicket = assertTicket(ticket)
  const ticketDirectory = path.join(casesRoot, normalizedTicket)
  ensureInsideRoot(ticketDirectory, casesRoot)

  let entries: Awaited<ReturnType<typeof fs.readdir>>

  try {
    entries = await fs.readdir(ticketDirectory, { withFileTypes: true })
  } catch {
    return [{ value: 'v1', label: 'v1', prefix: 'v1/' }]
  }

  const versions = entries
    .filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name))
    .map((entry) => ({
      value: entry.name,
      label: entry.name,
      prefix: `${entry.name}/`,
    }))
    .sort((a, b) => parseVersionNumber(a.value) - parseVersionNumber(b.value))

  if (versions.length > 0) {
    return versions
  }

  const legacyReport = await findBestReportFile(ticketDirectory)
  if (legacyReport) {
    return [{ value: 'legacy', label: 'legacy', prefix: '' }]
  }

  return [{ value: 'v1', label: 'v1', prefix: 'v1/' }]
}

export async function resolveReport(ticketRaw: string, requestedVersion: string, casesRoot = getCasesRoot()): Promise<ReportResolveResult> {
  const ticket = assertTicket(ticketRaw)
  const versions = await getReportVersions(ticket, casesRoot)

  const selectedOption =
    versions.find((version) => version.value === requestedVersion) ?? versions[0]

  const reportDirectory = path.join(
    casesRoot,
    ...splitSafeSegments(`${ticket}/${selectedOption.prefix}`),
  )
  ensureInsideRoot(reportDirectory, casesRoot)

  const reportFile = await findBestReportFile(reportDirectory)
  const reportName = reportFile?.name ?? 'test-results.md'
  const reportPath = `${ticket}/${selectedOption.prefix}${reportName}`

  const absoluteReportPath = path.join(casesRoot, ...splitSafeSegments(reportPath))
  ensureInsideRoot(absoluteReportPath, casesRoot)

  let markdown = ''

  try {
    markdown = await fs.readFile(absoluteReportPath, 'utf8')
  } catch {
    throw new Error(`Report file not found for ${ticket}`)
  }

  return {
    ticket,
    reportPath,
    selectedVersion: selectedOption.value,
    versions,
    markdown,
  }
}

export async function resolveFileForRead(filePathRaw: string, casesRoot = getCasesRoot()) {
  const normalizedPath = normalizeFilePath(filePathRaw)
  const absolutePath = path.join(casesRoot, ...splitSafeSegments(normalizedPath))
  ensureInsideRoot(absolutePath, casesRoot)

  const stat = await fs.stat(absolutePath)
  if (!stat.isFile()) {
    throw new Error('Not a file')
  }

  return {
    normalizedPath,
    absolutePath,
    stat,
    stream: Readable.toWeb(createReadStream(absolutePath)) as ReadableStream,
  }
}
