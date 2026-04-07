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
  lastUpdatedMs: number
  updatedText: string
  versionText: string
  isDraft: boolean
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

function isVersionDirectoryName(name: string) {
  return /^v\d+$/i.test(name)
}

function formatVersionUpdatedText(lastUpdatedMs: number) {
  if (!Number.isFinite(lastUpdatedMs) || lastUpdatedMs <= 0) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(lastUpdatedMs)
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function renameWithRetry(fromPath: string, toPath: string) {
  const maxAttempts = 6
  let delayMs = 50

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(fromPath, toPath)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const isRetryable = code === 'EMFILE' || code === 'ENFILE' || code === 'EBUSY'

      if (!isRetryable || attempt === maxAttempts) {
        throw error
      }

      await sleep(delayMs)
      delayMs *= 2
    }
  }
}

function isRetryableFsCode(code: string | undefined) {
  return code === 'EMFILE' || code === 'ENFILE' || code === 'EBUSY'
}

async function copyDirectoryWithRetry(fromPath: string, toPath: string) {
  const maxAttempts = 4
  let delayMs = 100

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(toPath, { recursive: true, force: true })
      await fs.cp(fromPath, toPath, { recursive: true, force: false })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!isRetryableFsCode(code) || attempt === maxAttempts) {
        throw error
      }

      await sleep(delayMs)
      delayMs *= 2
    }
  }
}

async function removeDirectoryWithRetry(targetPath: string) {
  const maxAttempts = 4
  let delayMs = 100

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!isRetryableFsCode(code) || attempt === maxAttempts) {
        throw error
      }

      await sleep(delayMs)
      delayMs *= 2
    }
  }
}

function buildVersionOption(
  value: string,
  prefix: string,
  lastUpdatedMs: number,
  options?: {
    isDraft?: boolean
    versionText?: string
  },
): ReportVersionOption {
  const isDraft = options?.isDraft ?? false
  const versionText = options?.versionText ?? value
  const updatedText = formatVersionUpdatedText(lastUpdatedMs)
  return {
    value,
    prefix,
    lastUpdatedMs,
    updatedText,
    versionText,
    label: `${versionText} • ${updatedText}`,
    isDraft,
  }
}

async function getDirectoryLastUpdatedMs(directory: string): Promise<number> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>

  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return 0
  }

  let maxUpdatedMs = 0

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      const nestedMaxUpdatedMs = await getDirectoryLastUpdatedMs(absolutePath)
      if (nestedMaxUpdatedMs > maxUpdatedMs) {
        maxUpdatedMs = nestedMaxUpdatedMs
      }
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const stat = await fs.stat(absolutePath)
    if (stat.mtimeMs > maxUpdatedMs) {
      maxUpdatedMs = stat.mtimeMs
    }
  }

  return maxUpdatedMs
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
    return [buildVersionOption('v1', 'v1/', 0)]
  }

  const draftEntry = entries.find(
    (entry) => entry.isDirectory() && entry.name.toLowerCase() === 'draft',
  )

  const versionEntries = entries.filter((entry) => entry.isDirectory() && isVersionDirectoryName(entry.name))

  const versions = await Promise.all(
    versionEntries.map(async (entry) => {
      const versionPath = path.join(ticketDirectory, entry.name)
      const lastUpdatedMs = await getDirectoryLastUpdatedMs(versionPath)
      return buildVersionOption(entry.name, `${entry.name}/`, lastUpdatedMs)
    }),
  )

  const publishedVersions = versions.sort((a, b) => {
    const aNumber = parseVersionNumber(a.value)
    const bNumber = parseVersionNumber(b.value)

    if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) {
      return a.value.localeCompare(b.value)
    }
    if (Number.isNaN(aNumber)) {
      return 1
    }
    if (Number.isNaN(bNumber)) {
      return -1
    }

    return aNumber - bNumber
  })

  const result: ReportVersionOption[] = []

  if (draftEntry) {
    const draftDirectory = path.join(ticketDirectory, draftEntry.name)
    const draftUpdatedMs = await getDirectoryLastUpdatedMs(draftDirectory)
    result.push(
      buildVersionOption('draft', 'draft/', draftUpdatedMs, {
        isDraft: true,
        versionText: 'Draft',
      }),
    )
  }

  if (publishedVersions.length > 0) {
    result.push(...publishedVersions)
    return result
  }

  const legacyReport = await findBestReportFile(ticketDirectory)
  if (legacyReport) {
    result.push(buildVersionOption('legacy', '', legacyReport.modifiedMs))
    return result
  }

  if (result.length > 0) {
    return result
  }

  return [buildVersionOption('v1', 'v1/', 0)]
}

export async function resolveReport(ticketRaw: string, requestedVersion: string, casesRoot = getCasesRoot()): Promise<ReportResolveResult> {
  const ticket = assertTicket(ticketRaw)
  const versions = await getReportVersions(ticket, casesRoot)
  const draftOption = versions.find((version) => version.isDraft)
  const latestPublishedOption = [...versions]
    .reverse()
    .find((version) => !version.isDraft && version.value !== 'legacy')

  const selectedOption =
    versions.find((version) => version.value === requestedVersion)
    ?? draftOption
    ?? latestPublishedOption
    ?? versions[versions.length - 1]
    ?? versions[0]

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

export type ApproveDraftResult = {
  ticket: string
  version: string
}

export async function approveDraft(ticketRaw: string, casesRoot = getCasesRoot()): Promise<ApproveDraftResult> {
  const ticket = assertTicket(ticketRaw)
  const ticketDirectory = path.join(casesRoot, ticket)
  const draftDirectory = path.join(ticketDirectory, 'draft')
  ensureInsideRoot(ticketDirectory, casesRoot)
  ensureInsideRoot(draftDirectory, casesRoot)

  let draftStat: Awaited<ReturnType<typeof fs.stat>>
  try {
    draftStat = await fs.stat(draftDirectory)
  } catch {
    throw new Error(`Draft not found for ${ticket}`)
  }

  if (!draftStat.isDirectory()) {
    throw new Error(`Draft not found for ${ticket}`)
  }

  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(ticketDirectory, { withFileTypes: true })
  } catch {
    entries = []
  }

  const publishedVersionNumbers = entries
    .filter((entry) => entry.isDirectory() && isVersionDirectoryName(entry.name))
    .map((entry) => parseVersionNumber(entry.name))
    .filter((versionNumber) => Number.isFinite(versionNumber))

  const nextVersionNumber = publishedVersionNumbers.length
    ? Math.max(...publishedVersionNumbers) + 1
    : 1
  const nextVersion = `v${nextVersionNumber}`
  const nextVersionDirectory = path.join(ticketDirectory, nextVersion)
  ensureInsideRoot(nextVersionDirectory, casesRoot)

  try {
    await fs.stat(nextVersionDirectory)
    throw new Error(`Target version already exists for ${ticket}: ${nextVersion}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  try {
    await renameWithRetry(draftDirectory, nextVersionDirectory)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (!isRetryableFsCode(code)) {
      throw error
    }

    // Fallback for filesystems where rename can continue failing under FD pressure.
    await copyDirectoryWithRetry(draftDirectory, nextVersionDirectory)
    await removeDirectoryWithRetry(draftDirectory)
  }

  return {
    ticket,
    version: nextVersion,
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
