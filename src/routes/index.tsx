import { createFileRoute } from '@tanstack/react-router'
import { Children, Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownUp,
  CheckCircle2,
  CircleX,
  Clock,
  Command as CommandIcon,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  FlaskConical,
  FolderOpen,
  ListTree,
  Loader2,
  Network,
  Scale,
  ShieldCheck,
} from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '#/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  extractTicketFromCommandQuery,
  isCommandPaletteShortcut,
  resolveTicketForCommand,
} from '#/lib/command'
import {
  buildOgMetadata,
  DEFAULT_OG_DESCRIPTION,
  DEFAULT_OG_IMAGE_ALT,
} from '#/lib/seo'

type BrowseItem = {
  key: string
  name: string
  type: 'directory' | 'file'
  size?: string
  modified?: string
}

type BrowseResponse = {
  prefix: string
  items: BrowseItem[]
}

type ReportVersionOption = {
  value: string
  label: string
  prefix: string
  lastUpdatedMs: number
  updatedText: string
  versionText: string
  isDraft: boolean
}

type ReportResponse = {
  ticket: string
  reportPath: string
  selectedVersion: string
  versions: ReportVersionOption[]
  markdown: string
}

type ApproveDraftResponse = {
  ok: boolean
  ticket: string
  approvedVersion: string
}

type TocItem = {
  id: string
  text: string
  level: number
}

type HomeSearch = {
  ticket?: string
  version?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    ticket: typeof search.ticket === 'string' ? search.ticket : undefined,
    version: typeof search.version === 'string' ? search.version : undefined,
  }),
  loaderDeps: ({ search }) => ({
    ticket: search.ticket || '',
    version: search.version || '',
  }),
  loader: ({ deps }) =>
    buildOgMetadata({
      siteUrl: process.env.PUBLIC_SITE_URL,
      ticketRaw: deps.ticket,
      versionRaw: deps.version,
    }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.title },
      { name: 'description', content: loaderData.description || DEFAULT_OG_DESCRIPTION },
      { property: 'og:title', content: loaderData.title },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'QA Test Result' },
      { property: 'og:description', content: loaderData.description || DEFAULT_OG_DESCRIPTION },
      { property: 'og:image', content: loaderData.image },
      { property: 'og:image:secure_url', content: loaderData.image },
      { property: 'og:image:type', content: 'image/x-icon' },
      { property: 'og:image:alt', content: DEFAULT_OG_IMAGE_ALT },
      { property: 'og:url', content: loaderData.url },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: loaderData.title },
      { name: 'twitter:description', content: loaderData.description || DEFAULT_OG_DESCRIPTION },
      { name: 'twitter:image', content: loaderData.image },
    ],
    links: [
      { rel: 'canonical', href: loaderData.url },
    ],
  }),
  component: App,
})

function normalizeSlug(value: string) {
  return (value || '').trim().toUpperCase()
}

function formatVersionUpdatedTextForViewer(lastUpdatedMs: number) {
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

function cleanPath(value: string) {
  return String(value || '').split(/[?#]/)[0]
}

function evidenceKind(path: string) {
  const cleaned = cleanPath(path).toLowerCase()
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(cleaned)) return 'image'
  if (/\.json$/i.test(cleaned)) return 'json'
  if (/\.xml$/i.test(cleaned)) return 'xml'
  if (/\.(log|txt)$/i.test(cleaned)) return 'log'
  if (/\.(md|markdown)$/i.test(cleaned)) return 'md'
  if (/\.(csv|tsv)$/i.test(cleaned)) return 'tabular'
  return 'file'
}

function evidenceBadge(kind: string) {
  if (kind === 'json') return 'JSON'
  if (kind === 'xml') return 'XML'
  if (kind === 'log') return 'LOG'
  if (kind === 'md') return 'MD'
  if (kind === 'tabular') return 'CSV'
  return 'FILE'
}

function fileNameFromPath(pathValue: string) {
  const parts = cleanPath(pathValue).split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cleanPath(pathValue)
}

function isEvidenceReference(value: string) {
  return (
    /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(value) ||
    /^evidence\//i.test(value) ||
    /\/evidence\//i.test(value)
  )
}

function resolveEvidencePath(rawPath: string, reportDirectory: string, slug: string) {
  const trimmed = rawPath.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  const normalized = trimmed.replace(/^\.\/+/, '')
  const ticketRoot = reportDirectory.split('/')[0] || slug

  if (normalized.startsWith(`${reportDirectory}/`)) {
    return normalized
  }

  if (ticketRoot && normalized.startsWith(`${ticketRoot}/`)) {
    return normalized
  }

  if (reportDirectory) {
    return `${reportDirectory}/${normalized}`
  }

  if (slug && !normalized.startsWith(`${slug}/`)) {
    return `${slug}/${normalized}`
  }

  return normalized
}

function toFileHref(relativePath: string) {
  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath
  }
  return `/api/file?path=${encodeURIComponent(relativePath)}`
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  })
  let payload: unknown = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

function textFromNode(children: ReactNode) {
  return Children.toArray(children)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number' ? String(child) : '',
    )
    .join('')
}

type EvidenceNodeProps = {
  sourcePath: string
  label: string
  resolvedPath: string
}

type LoadedEvidenceDoc = {
  sourcePath: string
  displayPath: string
  kind: string
  text: string
  parsedJson: unknown | null
}

function isHttpPath(pathValue: string) {
  return /^https?:\/\//i.test(pathValue)
}

function canPreviewEvidence(kind: string, sourcePath: string) {
  if (isHttpPath(sourcePath)) {
    return false
  }

  return kind === 'json' || kind === 'log' || kind === 'xml' || kind === 'md' || kind === 'tabular'
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

type NewmanHeader = { key: string; value: string; system?: boolean }
type NewmanAssertion = { assertion: string; skipped: boolean; error?: { message: string } }

type ParsedNewmanEvidence = {
  testName: string
  method: string
  fullUrl: string
  requestHeaders: NewmanHeader[]
  requestBody: string
  requestBodyParsed: unknown | null
  responseCode: number
  responseStatus: string
  responseHeaders: NewmanHeader[]
  responseBody: string
  responseBodyParsed: unknown | null
  responseTime: number
  responseSize: number
  assertions: NewmanAssertion[]
  testScripts: string[]
}

function isNewmanFormat(parsed: unknown): boolean {
  const record = normalizeObject(parsed)
  if (!record) return false
  const response = normalizeObject(record.response)
  if (!response) return false
  return (
    'cursor' in record &&
    'item' in record &&
    'assertions' in record &&
    normalizeObject(response.stream) !== null &&
    typeof response.code === 'number'
  )
}

function reconstructNewmanUrl(url: unknown): string {
  const record = normalizeObject(url)
  if (!record) return ''
  const protocol = typeof record.protocol === 'string' ? record.protocol : 'https'
  const host = Array.isArray(record.host) ? (record.host as string[]).join('.') : ''
  const pathSegments = Array.isArray(record.path) ? (record.path as string[]).join('/') : ''
  const queryParts = Array.isArray(record.query)
    ? (record.query as Array<{ key: string; value: string }>)
        .filter((q) => q.key)
        .map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value ?? '')}`)
    : []
  const qs = queryParts.length ? `?${queryParts.join('&')}` : ''
  return `${protocol}://${host}/${pathSegments}${qs}`
}

function decodeNewmanStream(stream: unknown): string {
  const record = normalizeObject(stream)
  if (!record || !Array.isArray(record.data)) return ''
  try {
    return String.fromCharCode(...(record.data as number[]))
  } catch {
    return ''
  }
}

function parseNewmanEvidence(parsed: unknown): ParsedNewmanEvidence | null {
  const record = normalizeObject(parsed)
  if (!record) return null

  const item = normalizeObject(record.item)
  const request = normalizeObject(record.request)
  const response = normalizeObject(record.response)
  if (!item || !request || !response) return null

  const method = typeof request.method === 'string' ? request.method.toUpperCase() : 'UNKNOWN'
  const fullUrl = reconstructNewmanUrl(request.url)

  const requestHeaders = (Array.isArray(request.header) ? request.header : []) as NewmanHeader[]
  const responseHeaders = (Array.isArray(response.header) ? response.header : []) as NewmanHeader[]

  const body = normalizeObject(request.body)
  let requestBodyRaw = ''
  if (body) {
    const mode = typeof body.mode === 'string' ? body.mode : ''
    if (mode === 'raw' && typeof body.raw === 'string') {
      requestBodyRaw = body.raw
    } else if (mode === 'urlencoded' && Array.isArray(body.urlencoded)) {
      requestBodyRaw = (body.urlencoded as Array<{ key: string; value: string; disabled?: boolean }>)
        .filter((p) => !p.disabled)
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? '')}`)
        .join('&')
    } else if (mode === 'formdata' && Array.isArray(body.formdata)) {
      requestBodyRaw = (body.formdata as Array<{ key: string; value: string; type?: string; disabled?: boolean }>)
        .filter((p) => !p.disabled)
        .map((p) => `${p.key}: ${p.value ?? ''}`)
        .join('\n')
    } else if (mode === 'graphql') {
      const gql = normalizeObject(body.graphql)
      if (gql) {
        requestBodyRaw = JSON.stringify({ query: gql.query, variables: gql.variables }, null, 2)
      }
    }
  }
  let requestBodyParsed: unknown | null = null
  if (requestBodyRaw) {
    try {
      requestBodyParsed = JSON.parse(requestBodyRaw)
    } catch {
      requestBodyParsed = null
    }
  }

  const rawBody = decodeNewmanStream(response.stream)
  let responseBodyParsed: unknown | null = null
  try {
    responseBodyParsed = JSON.parse(rawBody)
  } catch {
    responseBodyParsed = null
  }

  const assertions = (Array.isArray(record.assertions) ? record.assertions : []) as NewmanAssertion[]

  const testScripts: string[] = []
  const events = Array.isArray(item.event) ? item.event : []
  for (const ev of events) {
    const evRecord = normalizeObject(ev)
    if (!evRecord || evRecord.listen !== 'test') continue
    const script = normalizeObject(evRecord.script)
    if (script && Array.isArray(script.exec)) {
      testScripts.push(...(script.exec as string[]))
    }
  }

  return {
    testName: typeof item.name === 'string' ? item.name : '',
    method,
    fullUrl,
    requestHeaders,
    requestBody: requestBodyRaw,
    requestBodyParsed,
    responseCode: typeof response.code === 'number' ? response.code : 0,
    responseStatus: typeof response.status === 'string' ? response.status : '',
    responseHeaders,
    responseBody: rawBody,
    responseBodyParsed,
    responseTime: typeof response.responseTime === 'number' ? response.responseTime : 0,
    responseSize: typeof response.responseSize === 'number' ? response.responseSize : 0,
    assertions,
    testScripts,
  }
}

function findValueCaseInsensitive(record: Record<string, unknown>, keys: string[]) {
  const map = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]))
  for (const key of keys) {
    if (map.has(key.toLowerCase())) {
      return map.get(key.toLowerCase())
    }
  }
  return undefined
}

function extractRequestResponse(parsedJson: unknown) {
  const record = normalizeObject(parsedJson)
  if (!record) {
    return {
      request: undefined,
      response: undefined,
    }
  }

  const request = findValueCaseInsensitive(record, [
    'request',
    'request_payload',
    'requestpayload',
    'payload',
    'input',
    'req',
  ])
  const response = findValueCaseInsensitive(record, [
    'response',
    'response_body',
    'responsebody',
    'result',
    'output',
    'res',
  ])

  return { request, response }
}

function evidenceRole(pathValue: string) {
  const fileName = fileNameFromPath(pathValue).toLowerCase()
  if (/(^|[-_.])(request|req|payload|input)([-_.]|$)/i.test(fileName)) {
    return 'request'
  }
  if (/(^|[-_.])(response|res|result|output)([-_.]|$)/i.test(fileName)) {
    return 'response'
  }
  return null
}

function replaceFirstCaseInsensitive(value: string, from: string, to: string) {
  return value.replace(new RegExp(from, 'i'), to)
}

function buildCounterpartCandidates(pathValue: string) {
  const cleaned = cleanPath(pathValue)
  if (!cleaned || isHttpPath(cleaned)) {
    return []
  }

  const slashIndex = cleaned.lastIndexOf('/')
  const directory = slashIndex >= 0 ? cleaned.slice(0, slashIndex + 1) : ''
  const fileName = slashIndex >= 0 ? cleaned.slice(slashIndex + 1) : cleaned
  const dotIndex = fileName.lastIndexOf('.')
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : ''
  const baseNameLower = baseName.toLowerCase()

  const swaps: Array<[string, string]> = [
    ['request', 'response'],
    ['response', 'request'],
    ['req', 'res'],
    ['res', 'req'],
    ['input', 'output'],
    ['output', 'input'],
    ['payload', 'response'],
    ['result', 'request'],
  ]

  const candidates: string[] = []
  for (const [from, to] of swaps) {
    if (!baseNameLower.includes(from)) {
      continue
    }

    const swapped = replaceFirstCaseInsensitive(baseName, from, to)
    candidates.push(`${directory}${swapped}${extension}`)
    if (extension.toLowerCase() === '.json') {
      candidates.push(`${directory}${swapped}.log`)
      candidates.push(`${directory}${swapped}.txt`)
    }
  }

  return candidates.filter((candidate, index) => candidate !== cleaned && candidates.indexOf(candidate) === index)
}

async function loadEvidenceDocument(sourcePath: string, displayPath: string, kind: string): Promise<LoadedEvidenceDoc> {
  const response = await fetch(sourcePath, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Unable to load evidence (${response.status})`)
  }

  const text = await response.text()
  let parsedJson: unknown | null = null

  if (kind === 'json') {
    try {
      parsedJson = JSON.parse(text)
    } catch {
      parsedJson = null
    }
  }

  return {
    sourcePath,
    displayPath,
    kind,
    text,
    parsedJson,
  }
}

function prettyPrint(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function findRequestUrl(value: unknown): string | null {
  if (!value) {
    return null
  }

  const asText = asNonEmptyString(value)
  if (asText) {
    if (/^https?:\/\//i.test(asText) || asText.startsWith('/')) {
      return asText
    }
    const inlineUrl = asText.match(/https?:\/\/[^\s"'`]+/i)?.[0]
    if (inlineUrl) {
      return inlineUrl
    }
    const pathMatch = asText.match(/\b\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*/)?.[0]
    if (pathMatch) {
      return pathMatch
    }
  }

  const record = normalizeObject(value)
  if (!record) {
    return null
  }

  const direct = findValueCaseInsensitive(record, [
    'url',
    'request_url',
    'requesturl',
    'endpoint',
    'uri',
    'path',
  ])
  const directText = asNonEmptyString(direct)
  if (directText && (/^https?:\/\//i.test(directText) || directText.startsWith('/'))) {
    return directText
  }

  const nestedRequest = findValueCaseInsensitive(record, ['request', 'req', 'payload', 'input'])
  if (nestedRequest) {
    const nestedUrl = findRequestUrl(nestedRequest)
    if (nestedUrl) {
      return nestedUrl
    }
  }

  return null
}

function findResponseStatus(value: unknown): string | null {
  const record = normalizeObject(value)
  if (!record) {
    return null
  }

  const statusValue = findValueCaseInsensitive(record, ['status', 'status_code', 'statuscode', 'code'])
  if (typeof statusValue === 'number' && Number.isFinite(statusValue)) {
    return String(statusValue)
  }
  if (typeof statusValue === 'string' && statusValue.trim()) {
    return statusValue.trim()
  }

  const nestedResponse = findValueCaseInsensitive(record, ['response', 'res', 'result', 'output'])
  if (nestedResponse) {
    return findResponseStatus(nestedResponse)
  }

  return null
}

function findRequestMethod(value: unknown): string | null {
  const normalizeMethod = (methodRaw: string) => {
    const method = methodRaw.trim().toUpperCase()
    return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ? method : null
  }

  const asText = asNonEmptyString(value)
  if (asText) {
    const matched = asText.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i)?.[0]
    if (matched) {
      return normalizeMethod(matched)
    }
  }

  const record = normalizeObject(value)
  if (!record) {
    return null
  }

  const direct = findValueCaseInsensitive(record, ['method', 'http_method', 'request_method', 'verb'])
  if (typeof direct === 'string') {
    const normalized = normalizeMethod(direct)
    if (normalized) {
      return normalized
    }
  }

  const nestedRequest = findValueCaseInsensitive(record, ['request', 'req', 'payload', 'input'])
  if (nestedRequest) {
    return findRequestMethod(nestedRequest)
  }

  return null
}

function stripKeys(record: Record<string, unknown>, keys: string[]) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()))
  const entries = Object.entries(record).filter(([key]) => !keySet.has(key.toLowerCase()))
  return Object.fromEntries(entries)
}

function extractRequestBody(value: unknown): unknown {
  const record = normalizeObject(value)
  if (!record) {
    return value
  }

  const directBody = findValueCaseInsensitive(record, [
    'body',
    'request_body',
    'requestbody',
    'data',
    'payload',
    'input',
  ])
  if (directBody !== undefined) {
    return directBody
  }

  const nestedRequest = findValueCaseInsensitive(record, ['request', 'req'])
  if (nestedRequest !== undefined) {
    return extractRequestBody(nestedRequest)
  }

  const payloadOnly = stripKeys(record, [
    'url',
    'uri',
    'endpoint',
    'path',
    'method',
    'http_method',
    'request_method',
    'verb',
    'headers',
    'params',
    'query',
  ])
  return Object.keys(payloadOnly).length ? payloadOnly : value
}

function extractResponseBody(value: unknown): unknown {
  const record = normalizeObject(value)
  if (!record) {
    return value
  }

  const directBody = findValueCaseInsensitive(record, [
    'body',
    'response_body',
    'responsebody',
    'data',
    'result',
    'output',
  ])
  if (directBody !== undefined) {
    return directBody
  }

  const nestedResponse = findValueCaseInsensitive(record, ['response', 'res'])
  if (nestedResponse !== undefined) {
    return extractResponseBody(nestedResponse)
  }

  const payloadOnly = stripKeys(record, [
    'status',
    'status_code',
    'statuscode',
    'code',
    'headers',
    'duration',
    'duration_ms',
    'latency',
    'latency_ms',
    'size',
  ])
  return Object.keys(payloadOnly).length ? payloadOnly : value
}

function toDisplayBody(value: unknown, fallbackText: string) {
  if (value === undefined || value === null) {
    return fallbackText
  }

  if (typeof value === 'string') {
    return value
  }

  return prettyPrint(value)
}

type JsonToken = {
  type: 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'text'
  value: string
}

function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = []
  const pattern =
    /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g

  let lastIndex = 0
  let match: RegExpExecArray | null = null
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        value: line.slice(lastIndex, match.index),
      })
    }

    if (match[1]) {
      tokens.push({ type: 'key', value: match[1] })
    } else if (match[2]) {
      tokens.push({ type: 'string', value: match[2] })
    } else if (match[3]) {
      tokens.push({ type: 'boolean', value: match[3] })
    } else if (match[4]) {
      tokens.push({ type: 'null', value: match[4] })
    } else if (match[5]) {
      tokens.push({ type: 'number', value: match[5] })
    } else if (match[6]) {
      tokens.push({ type: 'punctuation', value: match[6] })
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'text',
      value: line.slice(lastIndex),
    })
  }

  return tokens
}

function colorClassForJsonToken(type: JsonToken['type']) {
  if (type === 'key') return 'text-[#9CDCFE]'
  if (type === 'string') return 'text-[#CE9178]'
  if (type === 'number') return 'text-[#B5CEA8]'
  if (type === 'boolean') return 'text-[#569CD6]'
  if (type === 'null') return 'text-[#C586C0] italic'
  if (type === 'punctuation') return 'text-[#D4D4D4]'
  return 'text-[#D4D4D4]'
}

function renderJsonSyntaxHighlight(content: string): ReactNode {
  const lines = content.split('\n')
  return lines.map((line, lineIndex) => {
    const tokens = tokenizeJsonLine(line)
    return (
      <Fragment key={`${lineIndex}-${line}`}>
        {tokens.map((token, tokenIndex) => (
          <span
            key={`${lineIndex}-${tokenIndex}-${token.value}`}
            className={colorClassForJsonToken(token.type)}
          >
            {token.value}
          </span>
        ))}
        {lineIndex < lines.length - 1 ? '\n' : null}
      </Fragment>
    )
  })
}

function CodePreview({ content, animationKey }: { content: string, animationKey?: string }) {
  let highlighted: ReactNode = content
  try {
    JSON.parse(content)
    highlighted = renderJsonSyntaxHighlight(content)
  } catch {
    highlighted = content
  }

  return (
    <div key={animationKey} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
      <div className="h-[15rem] min-h-[10rem] max-h-[70vh] resize-y overflow-auto rounded-lg border border-[#2D2D30] bg-[#1E1E1E] p-3 font-mono text-xs leading-relaxed text-[#D4D4D4]">
        <pre className="m-0 min-h-full whitespace-pre">{highlighted}</pre>
      </div>
    </div>
  )
}

function methodBadgeClass(method: string) {
  if (method === 'GET') return 'bg-[#134E3A] text-[#D1FAE5] ring-[#22C55E]/40'
  if (method === 'POST') return 'bg-[#4A3215] text-[#FEF3C7] ring-[#F59E0B]/40'
  if (method === 'PUT' || method === 'PATCH') return 'bg-[#1E3A5F] text-[#DBEAFE] ring-[#3B82F6]/40'
  if (method === 'DELETE') return 'bg-[#4C1D1D] text-[#FFE4E6] ring-[#EF4444]/40'
  return 'bg-[#282D37] text-[#E2E8F0] ring-[#64748B]/40'
}

function responseStatusBadgeClass(statusCode: number | null) {
  if (!statusCode) return 'bg-[#282D37] text-[#E2E8F0] ring-[#64748B]/40'
  if (statusCode >= 200 && statusCode < 300) return 'bg-[#134E3A] text-[#D1FAE5] ring-[#22C55E]/40'
  if (statusCode >= 300 && statusCode < 400) return 'bg-[#1E3A5F] text-[#DBEAFE] ring-[#3B82F6]/40'
  if (statusCode >= 400 && statusCode < 500) return 'bg-[#4A2512] text-[#FFEDD5] ring-[#F97316]/40'
  return 'bg-[#4C1D1D] text-[#FFE4E6] ring-[#EF4444]/40'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function NewmanEvidenceViewer({ data }: { data: ParsedNewmanEvidence }) {
  const [activeTab, setActiveTab] = useState<'response' | 'request' | 'assertions' | 'scripts'>('response')
  const [responseView, setResponseView] = useState<'pretty' | 'raw' | 'headers'>('pretty')
  const [requestView, setRequestView] = useState<'body' | 'headers' | 'url'>(data.requestBody ? 'body' : 'headers')
  const [copied, setCopied] = useState('')

  const allPassed = data.assertions.length > 0 && data.assertions.every((a) => !a.error && !a.skipped)
  const failedCount = data.assertions.filter((a) => a.error).length
  const userHeaders = data.requestHeaders.filter((h) => !h.system)
  const statusCodeNum = data.responseCode
  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    })
  }

  return (
    <div className="space-y-3">
      {data.testName ? (
        <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-300">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-foreground">{data.testName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {allPassed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600">
                  <CheckCircle2 className="size-3" />
                  {data.assertions.length}/{data.assertions.length} passed
                </span>
              ) : failedCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-600">
                  <CircleX className="size-3" />
                  {failedCount} failed
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {formatMs(data.responseTime)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Scale className="size-3" />
                {formatBytes(data.responseSize)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 fill-mode-both" style={{ animationDelay: '80ms' }}>
        <span
          className={`inline-flex min-w-[4rem] items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide ring-1 transition-all duration-200 hover:scale-105 hover:brightness-125 ${methodBadgeClass(data.method)}`}
        >
          {data.method}
        </span>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <code className="block whitespace-nowrap text-xs text-foreground">{data.fullUrl}</code>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-110 active:scale-95"
          title="Copy URL"
          onClick={() => copyToClipboard(data.fullUrl, 'url')}
        >
          {copied === 'url' ? <CheckCircle2 className="size-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" /> : <Copy className="size-3.5" />}
        </button>
        <span
          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ring-1 transition-all duration-200 hover:scale-105 hover:brightness-125 ${responseStatusBadgeClass(statusCodeNum)}`}
        >
          {statusCodeNum} {data.responseStatus}
        </span>
      </div>

      <div className="rounded-xl border border-border/80 bg-card">
        <div className="flex items-center gap-0 border-b border-border/60 px-1">
          {(
            [
              { key: 'response', label: 'Response', icon: ArrowDownUp },
              { key: 'request', label: 'Request', icon: Network },
              { key: 'assertions', label: `Assertions (${data.assertions.length})`, icon: ShieldCheck },
              { key: 'scripts', label: 'Scripts', icon: FileCode2 },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key)
                if (tab.key === 'request') {
                  setRequestView('body')
                }
              }}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all duration-200 ${
                activeTab === tab.key
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
              <span
                className={`absolute right-3 bottom-0 left-3 h-[2px] rounded-full bg-primary transition-all duration-250 ${
                  activeTab === tab.key ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`}
              />
            </button>
          ))}
        </div>

        <div className="max-h-[calc(90vh-280px)] overflow-auto p-3">
          {activeTab === 'response' ? (
            <div key="response" className="space-y-2 animate-in fade-in-0 duration-200">
              <div className="flex items-center gap-1">
                {(['pretty', 'raw', 'headers'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setResponseView(mode)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      responseView === mode
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-110 active:scale-95"
                  title="Copy response body"
                  onClick={() =>
                    copyToClipboard(
                      responseView === 'pretty' && data.responseBodyParsed
                        ? prettyPrint(data.responseBodyParsed)
                        : responseView === 'headers'
                          ? data.responseHeaders.map((h) => `${h.key}: ${h.value}`).join('\n')
                          : data.responseBody,
                      'response',
                    )
                  }
                >
                  {copied === 'response' ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>
              {responseView === 'headers' ? (
                <div className="rounded-lg border border-border/60 bg-muted/20">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Header</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.responseHeaders.map((h, i) => (
                        <tr key={i} className="border-b border-border/30 last:border-0">
                          <td className="px-3 py-1.5 font-mono font-medium text-foreground">{h.key}</td>
                          <td className="break-all px-3 py-1.5 font-mono text-muted-foreground">{h.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <CodePreview
                  content={
                    responseView === 'pretty' && data.responseBodyParsed
                      ? prettyPrint(data.responseBodyParsed)
                      : data.responseBody || '(empty body)'
                  }
                  animationKey={`response-${responseView}`}
                />
              )}
            </div>
          ) : activeTab === 'request' ? (
            <div key="request" className="space-y-2 animate-in fade-in-0 duration-200">
              <div className="flex items-center gap-1">
                {(['body', 'headers', 'url'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRequestView(mode)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      requestView === mode
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:scale-110 active:scale-95"
                  title="Copy request body"
                  onClick={() =>
                    copyToClipboard(
                      requestView === 'body' && data.requestBodyParsed
                        ? prettyPrint(data.requestBodyParsed)
                        : requestView === 'headers'
                          ? data.requestHeaders.map((h) => `${h.key}: ${h.value}`).join('\n')
                          : data.requestBody || data.fullUrl,
                      'request',
                    )
                  }
                >
                  {copied === 'request' ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>
              {requestView === 'body' ? (
                <CodePreview
                  content={
                    data.requestBodyParsed
                      ? prettyPrint(data.requestBodyParsed)
                      : data.requestBody || '(empty body)'
                  }
                  animationKey={`request-${requestView}`}
                />
              ) : requestView === 'url' ? (
                <div className="space-y-2">
                  <CodePreview
                    content={`${data.method} ${data.fullUrl} HTTP/1.1\n${userHeaders.map((h) => `${h.key}: ${h.value}`).join('\n')}`}
                    animationKey={`request-${requestView}`}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Header</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Value</th>
                        <th className="w-16 px-3 py-2 text-left font-semibold text-muted-foreground">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.requestHeaders.map((h, i) => (
                        <tr key={i} className={`border-b border-border/30 last:border-0 ${h.system ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-1.5 font-mono font-medium text-foreground">{h.key}</td>
                          <td className="break-all px-3 py-1.5 font-mono text-muted-foreground">{h.value}</td>
                          <td className="px-3 py-1.5">
                            {h.system ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                auto
                              </span>
                            ) : (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                custom
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'assertions' ? (
            <div key="assertions" className="space-y-1 animate-in fade-in-0 duration-200">
              {data.assertions.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No assertions recorded.</p>
              ) : (
                data.assertions.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm ${
                      a.error
                        ? 'border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20'
                        : a.skipped
                          ? 'border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                          : 'bg-muted/30'
                    }`}
                  >
                    {a.error ? (
                      <CircleX className="mt-0.5 size-4 shrink-0 text-rose-500" />
                    ) : a.skipped ? (
                      <span className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-amber-400" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={`font-medium ${a.error ? 'text-rose-700 dark:text-rose-300' : 'text-foreground'}`}>
                        {a.assertion}
                      </span>
                      {a.error?.message ? (
                        <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">{a.error.message}</p>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div key="scripts" className="space-y-2 animate-in fade-in-0 duration-200">
              {data.testScripts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No test scripts recorded.</p>
              ) : (
                <CodePreview content={data.testScripts.join('\n')} animationKey="scripts" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EvidenceFileCard({ sourcePath, label, resolvedPath }: EvidenceNodeProps) {
  const displayPath = label || resolvedPath || sourcePath
  const kind = evidenceKind(displayPath)
  const previewable = canPreviewEvidence(kind, sourcePath)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loadingViewer, setLoadingViewer] = useState(false)
  const [viewerError, setViewerError] = useState('')
  const [currentDoc, setCurrentDoc] = useState<LoadedEvidenceDoc | null>(null)
  const [requestDoc, setRequestDoc] = useState<LoadedEvidenceDoc | null>(null)
  const [responseDoc, setResponseDoc] = useState<LoadedEvidenceDoc | null>(null)
  const [requestUrl, setRequestUrl] = useState<string | null>(null)
  const [requestMethod, setRequestMethod] = useState<string | null>(null)
  const [responseStatus, setResponseStatus] = useState<string | null>(null)
  const [requestViewMode, setRequestViewMode] = useState<'body' | 'raw'>('body')
  const [responseViewMode, setResponseViewMode] = useState<'body' | 'raw'>('body')
  const [newmanData, setNewmanData] = useState<ParsedNewmanEvidence | null>(null)

  useEffect(() => {
    if (!dialogOpen || !previewable) {
      return
    }

    let cancelled = false
    const candidates = buildCounterpartCandidates(resolvedPath)

    const load = async () => {
      setLoadingViewer(true)
      setViewerError('')
      setCurrentDoc(null)
      setRequestDoc(null)
      setResponseDoc(null)
      setRequestUrl(null)
      setRequestMethod(null)
      setResponseStatus(null)
      setRequestViewMode('body')
      setResponseViewMode('body')
      setNewmanData(null)

      try {
        const mainDoc = await loadEvidenceDocument(sourcePath, displayPath, kind)
        if (cancelled) {
          return
        }

        if (isNewmanFormat(mainDoc.parsedJson)) {
          const parsed = parseNewmanEvidence(mainDoc.parsedJson)
          if (parsed) {
            setCurrentDoc(mainDoc)
            setNewmanData(parsed)
            return
          }
        }

        let reqDoc: LoadedEvidenceDoc | null = null
        let resDoc: LoadedEvidenceDoc | null = null

        const extracted = extractRequestResponse(mainDoc.parsedJson)
        if (extracted.request !== undefined) {
          reqDoc = {
            ...mainDoc,
            text: prettyPrint(extracted.request),
            parsedJson: extracted.request,
            displayPath: `${displayPath}#request`,
          }
        }
        if (extracted.response !== undefined) {
          resDoc = {
            ...mainDoc,
            text: prettyPrint(extracted.response),
            parsedJson: extracted.response,
            displayPath: `${displayPath}#response`,
          }
        }

        if (!reqDoc && !resDoc) {
          for (const candidatePath of candidates) {
            const candidateSourcePath = toFileHref(candidatePath)
            const candidateKind = evidenceKind(candidatePath)
            if (!canPreviewEvidence(candidateKind, candidateSourcePath)) {
              continue
            }

            try {
              const candidateDoc = await loadEvidenceDocument(
                candidateSourcePath,
                candidatePath,
                candidateKind,
              )
              const role = evidenceRole(candidatePath)
              if (role === 'request' && !reqDoc) {
                reqDoc = candidateDoc
              } else if (role === 'response' && !resDoc) {
                resDoc = candidateDoc
              }

              if (reqDoc && resDoc) {
                break
              }
            } catch {
              continue
            }
          }
        }

        const currentRole = evidenceRole(displayPath)
        if (currentRole === 'request' && !reqDoc) {
          reqDoc = mainDoc
        } else if (currentRole === 'response' && !resDoc) {
          resDoc = mainDoc
        }

        setCurrentDoc(mainDoc)
        setRequestDoc(reqDoc)
        setResponseDoc(resDoc)
        setRequestUrl(
          findRequestUrl(reqDoc?.parsedJson ?? reqDoc?.text ?? null)
          ?? findRequestUrl(mainDoc.parsedJson)
          ?? findRequestUrl(mainDoc.text),
        )
        setRequestMethod(
          findRequestMethod(reqDoc?.parsedJson ?? reqDoc?.text ?? null)
          ?? findRequestMethod(mainDoc.parsedJson)
          ?? findRequestMethod(mainDoc.text),
        )
        setResponseStatus(
          findResponseStatus(resDoc?.parsedJson ?? null)
          ?? findResponseStatus(mainDoc.parsedJson),
        )
      } catch (error) {
        setViewerError((error as Error).message)
      } finally {
        if (!cancelled) {
          setLoadingViewer(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [dialogOpen, displayPath, kind, previewable, resolvedPath, sourcePath])

  return (
    <>
      <Card size="sm" className="my-2 border border-border/80 py-0 shadow-none transition-colors hover:bg-muted/30">
        <CardContent className="flex items-center gap-3 py-3">
          <Badge variant="outline" className="font-semibold">
            {evidenceBadge(kind)}
          </Badge>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-primary">
              {fileNameFromPath(displayPath) || 'Open evidence file'}
            </span>
            <span className="truncate text-xs text-muted-foreground">{displayPath}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <a
              href={sourcePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground no-underline transition-colors hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
            >
              Open file
            </a>
            {previewable ? (
              <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
                View payload
              </Button>
            ) : null}
          </span>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="w-[min(1700px,calc(100vw-1rem))] max-w-[min(1700px,calc(100vw-1rem))] sm:max-w-[min(1700px,calc(100vw-1rem))] gap-3 p-0"
          showCloseButton
        >
          <DialogHeader className="border-b px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <Badge variant="outline" className="shrink-0 font-semibold">
                {evidenceBadge(kind)}
              </Badge>
              <DialogTitle className="min-w-0 truncate text-base">
                {fileNameFromPath(displayPath) || 'Evidence Viewer'}
              </DialogTitle>
            </div>
            <DialogDescription className="flex items-center gap-2 truncate font-mono text-xs">
              <span className="truncate">{displayPath}</span>
              <a
                href={sourcePath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                Open
              </a>
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto px-5 py-4" style={{ maxHeight: 'calc(90vh - 120px)' }}>
            {loadingViewer ? (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading evidence...</span>
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </div>
            ) : viewerError ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to load evidence</AlertTitle>
                <AlertDescription>{viewerError}</AlertDescription>
              </Alert>
            ) : currentDoc && newmanData ? (
              <NewmanEvidenceViewer data={newmanData} />
            ) : currentDoc ? (
              requestDoc && responseDoc ? (
                <div className="space-y-3 rounded-xl border border-[#1D4477] bg-[#0A1F3F] p-3 text-[#EAF1FF] animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                  <section className="rounded-lg border border-[#1D4477] bg-[#081833] p-3 animate-in fade-in-0 duration-300 fill-mode-both" style={{ animationDelay: '50ms' }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold tracking-wide text-[#EAF1FF] uppercase">Request</span>
                      <span className="flex items-center gap-2">
                        <span className="inline-flex overflow-hidden rounded-md border border-[#1D4477] bg-[#0A254B]">
                          <button
                            type="button"
                            className={`px-2 py-0.5 text-[11px] transition-all duration-150 ${requestViewMode === 'body' ? 'bg-[#FF6C37] text-white' : 'text-[#9CB0CF] hover:text-[#EAF1FF]'}`}
                            onClick={() => setRequestViewMode('body')}
                          >
                            Body
                          </button>
                          <button
                            type="button"
                            className={`px-2 py-0.5 text-[11px] transition-all duration-150 ${requestViewMode === 'raw' ? 'bg-[#FF6C37] text-white' : 'text-[#9CB0CF] hover:text-[#EAF1FF]'}`}
                            onClick={() => setRequestViewMode('raw')}
                          >
                            Raw
                          </button>
                        </span>
                        <span className="text-[11px] text-[#9CB0CF]">{fileNameFromPath(requestDoc.displayPath)}</span>
                      </span>
                    </div>
                    <div className="mb-2 rounded-md border border-[#1D4477] bg-[#0A254B] px-2.5 py-1.5 text-xs">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex min-w-[3.75rem] items-center justify-center rounded px-2 py-0.5 font-semibold tracking-wide ring-1 transition-all duration-200 hover:scale-105 hover:brightness-125 ${methodBadgeClass(requestMethod || 'UNKNOWN')}`}
                        >
                          {requestMethod || 'REQ'}
                        </span>
                        <code className="break-all text-[#EAF1FF]">{requestUrl || 'No URL detected in evidence'}</code>
                      </span>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold tracking-wide text-[#9CB0CF] uppercase">
                        {requestViewMode === 'body' ? 'Body (read only)' : 'Raw (read only)'}
                      </div>
                      <CodePreview
                        content={
                          requestViewMode === 'body'
                            ? toDisplayBody(extractRequestBody(requestDoc.parsedJson), requestDoc.text)
                            : requestDoc.text
                        }
                        animationKey={`request-${requestViewMode}`}
                      />
                    </div>
                  </section>

                  <section className="rounded-lg border border-[#1D4477] bg-[#081833] p-3 animate-in fade-in-0 duration-300 fill-mode-both" style={{ animationDelay: '120ms' }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold tracking-wide text-[#EAF1FF] uppercase">Response</span>
                      <span className="flex items-center gap-2 text-[11px] text-[#9CB0CF]">
                        <span className="inline-flex overflow-hidden rounded-md border border-[#1D4477] bg-[#0A254B]">
                          <button
                            type="button"
                            className={`px-2 py-0.5 text-[11px] transition-all duration-150 ${responseViewMode === 'body' ? 'bg-[#FF6C37] text-white' : 'text-[#9CB0CF] hover:text-[#EAF1FF]'}`}
                            onClick={() => setResponseViewMode('body')}
                          >
                            Body
                          </button>
                          <button
                            type="button"
                            className={`px-2 py-0.5 text-[11px] transition-all duration-150 ${responseViewMode === 'raw' ? 'bg-[#FF6C37] text-white' : 'text-[#9CB0CF] hover:text-[#EAF1FF]'}`}
                            onClick={() => setResponseViewMode('raw')}
                          >
                            Raw
                          </button>
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ring-1 transition-all duration-200 hover:scale-105 hover:brightness-125 ${responseStatusBadgeClass(Number.parseInt(responseStatus || '', 10) || null)}`}
                        >
                          {responseStatus || 'N/A'}
                        </span>
                        <span>{fileNameFromPath(responseDoc.displayPath)}</span>
                      </span>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold tracking-wide text-[#9CB0CF] uppercase">
                        {responseViewMode === 'body' ? 'Body (read only)' : 'Raw (read only)'}
                      </div>
                      <CodePreview
                        content={
                          responseViewMode === 'body'
                            ? toDisplayBody(extractResponseBody(responseDoc.parsedJson), responseDoc.text)
                            : responseDoc.text
                        }
                        animationKey={`response-${responseViewMode}`}
                      />
                    </div>
                  </section>
                </div>
              ) : (
                <Tabs
                  key={`${requestDoc ? 'req' : 'noreq'}-${responseDoc ? 'res' : 'nores'}-${currentDoc.parsedJson ? 'json' : 'text'}`}
                  defaultValue={requestDoc ? 'request' : responseDoc ? 'response' : currentDoc.parsedJson ? 'pretty' : 'raw'}
                  className="gap-3"
                >
                  {requestUrl ? (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                      <span className="mr-2 inline-flex rounded border border-border/80 bg-background px-1.5 py-0.5 font-semibold uppercase">
                        URL
                      </span>
                      <code className="break-all">{requestUrl}</code>
                    </div>
                  ) : null}
                  <TabsList variant="line">
                    {requestDoc ? <TabsTrigger value="request">Request</TabsTrigger> : null}
                    {responseDoc ? <TabsTrigger value="response">Response</TabsTrigger> : null}
                    {currentDoc.parsedJson ? <TabsTrigger value="pretty">Pretty</TabsTrigger> : null}
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                  </TabsList>

                  {requestDoc ? (
                    <TabsContent value="request">
                      <CodePreview content={requestDoc.text} />
                    </TabsContent>
                  ) : null}

                  {responseDoc ? (
                    <TabsContent value="response">
                      <CodePreview content={responseDoc.text} />
                    </TabsContent>
                  ) : null}

                  {currentDoc.parsedJson ? (
                    <TabsContent value="pretty">
                      <CodePreview content={prettyPrint(currentDoc.parsedJson)} />
                    </TabsContent>
                  ) : null}

                  <TabsContent value="raw">
                    <CodePreview content={currentDoc.text} />
                  </TabsContent>
                </Tabs>
              )
            ) : null}
          </div>

        </DialogContent>
      </Dialog>
    </>
  )
}

function EvidenceImage({ sourcePath, label }: EvidenceNodeProps) {
  return (
    <a href={sourcePath} target="_blank" rel="noopener noreferrer" className="my-2 block">
      <img
        src={sourcePath}
        alt={label || 'Evidence image'}
        className="h-auto max-w-full rounded-lg border border-slate-300"
        loading="lazy"
        decoding="async"
      />
    </a>
  )
}

function EvidenceNode({ sourcePath, label, resolvedPath }: EvidenceNodeProps) {
  const displayPath = label || resolvedPath || sourcePath
  return evidenceKind(displayPath) === 'image' ? (
    <EvidenceImage sourcePath={sourcePath} label={label} resolvedPath={resolvedPath} />
  ) : (
    <EvidenceFileCard sourcePath={sourcePath} label={label} resolvedPath={resolvedPath} />
  )
}

function App() {
  const [slugInput, setSlugInput] = useState('')
  const [statusText, setStatusText] = useState('')
  const [statusError, setStatusError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [markdownContent, setMarkdownContent] = useState('')
  const [currentSlug, setCurrentSlug] = useState('')
  const [currentReportDirectory, setCurrentReportDirectory] = useState('')
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [tocPlaceholder, setTocPlaceholder] = useState(
    'Load a ticket to generate the section index.',
  )
  const [reportVersions, setReportVersions] = useState<ReportVersionOption[]>([
    {
      value: 'v1',
      label: 'v1 • Unknown',
      prefix: 'v1/',
      lastUpdatedMs: 0,
      updatedText: 'Unknown',
      versionText: 'v1',
      isDraft: false,
    },
  ])
  const [selectedReportVersion, setSelectedReportVersion] = useState('v1')
  const [approvalLoading, setApprovalLoading] = useState(false)

  const [sidebarTab, setSidebarTab] = useState<'browse' | 'toc'>('browse')
  const [browsePrefix, setBrowsePrefix] = useState('')
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')

  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const viewerRef = useRef<HTMLDivElement | null>(null)

  const pageTitle = currentSlug ? `QA Test Result - ${currentSlug}` : 'QA Test Result'
  const selectedVersionOption = useMemo(
    () => reportVersions.find((option) => option.value === selectedReportVersion),
    [reportVersions, selectedReportVersion],
  )
  const hasDraftVersion = useMemo(
    () => reportVersions.some((option) => option.isDraft),
    [reportVersions],
  )
  const selectedVersionText = selectedVersionOption?.versionText || selectedReportVersion || 'v1'
  const selectedVersionUpdatedText = formatVersionUpdatedTextForViewer(
    selectedVersionOption?.lastUpdatedMs ?? 0,
  )
  const commandQueryTicket = useMemo(
    () => extractTicketFromCommandQuery(commandQuery),
    [commandQuery],
  )

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1040)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) {
        return
      }

      const tagName = target?.tagName?.toLowerCase() || ''
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return
      }

      event.preventDefault()
      setIsCommandOpen((open) => !open)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!isCommandOpen) {
      setCommandQuery('')
    }
  }, [isCommandOpen])

  const browseBreadcrumbs = useMemo(() => {
    if (!browsePrefix) return []
    const parts = browsePrefix.replace(/\/$/, '').split('/')
    return parts.map((name, index) => ({
      name,
      prefix: `${parts.slice(0, index + 1).join('/')}/`,
    }))
  }, [browsePrefix])

  function setStatus(text: string, isError = false) {
    setStatusText(text)
    setStatusError(isError)
  }

  async function browseTo(prefix: string) {
    setBrowsePrefix(prefix)
    setBrowseLoading(true)
    setBrowseError('')
    setBrowseItems([])

    try {
      const result = await fetchJson<BrowseResponse>(
        `/api/browse?prefix=${encodeURIComponent(prefix)}`,
      )
      setBrowseItems(result.items)
      setBrowsePrefix(result.prefix)
    } catch (error) {
      setBrowseError((error as Error).message)
    } finally {
      setBrowseLoading(false)
    }
  }

  function browseUp() {
    const parts = browsePrefix.replace(/\/$/, '').split('/').filter(Boolean)
    parts.pop()
    void browseTo(parts.length ? `${parts.join('/')}/` : '')
  }

  function buildToc(viewerElement: HTMLElement) {
    const headings = viewerElement.querySelectorAll('h1, h2, h3')

    if (!headings.length) {
      setTocItems([])
      setTocPlaceholder('No headings found in this report.')
      return
    }

    const items: TocItem[] = []
    headings.forEach((heading) => {
      if (!heading.id) return
      items.push({
        id: heading.id,
        text: heading.textContent || '',
        level: Number(heading.tagName.slice(1)),
      })
    })

    setTocItems(items)
  }

  const markdownComponents = useMemo<Components>(
    () => ({
      a({ node: _node, href = '', children, ...props }) {
        const hrefText = String(href || '')

        if (isEvidenceReference(hrefText)) {
          const resolved = resolveEvidencePath(hrefText, currentReportDirectory, currentSlug)
          return <EvidenceNode sourcePath={toFileHref(resolved)} label={hrefText} resolvedPath={resolved} />
        }

        if (/^https?:\/\//i.test(hrefText)) {
          return (
            <a href={hrefText} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          )
        }

        return (
          <a href={hrefText} {...props}>
            {children}
          </a>
        )
      },
      code({ node: _node, className, children, ...props }) {
        const text = textFromNode(children).trim()

        if (text && !text.includes('\n') && isEvidenceReference(text)) {
          const resolved = resolveEvidencePath(text, currentReportDirectory, currentSlug)
          return <EvidenceNode sourcePath={toFileHref(resolved)} label={text} resolvedPath={resolved} />
        }

        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      },
    }),
    [currentReportDirectory, currentSlug],
  )

  async function loadTicket(ticketRaw: string, requestedVersion = '') {
    const ticket = normalizeSlug(ticketRaw)

    if (!/^[A-Z0-9_-]+$/.test(ticket)) {
      setStatus('Invalid ticket. Use letters, numbers, underscore, or dash.', true)
      setCurrentSlug('')
      setCurrentReportDirectory('')
      setMarkdownContent('')
      setTocItems([])
      return
    }

    setCurrentSlug(ticket)
    setCurrentReportDirectory('')
    setLoading(true)
    setMarkdownContent('')
    setTocItems([])
    setTocPlaceholder('Building section index...')
    setStatus(`Loading ${ticket} report and version metadata ...`)

    try {
      const report = await fetchJson<ReportResponse>(
        `/api/report?ticket=${encodeURIComponent(ticket)}&version=${encodeURIComponent(requestedVersion)}`,
      )

      setReportVersions(report.versions)
      setSelectedReportVersion(report.selectedVersion)
      setCurrentReportDirectory(
        report.reportPath.split('/').slice(0, -1).join('/'),
      )
      setMarkdownContent(report.markdown)
      setStatus(`Loaded ${report.reportPath}`)
      setSidebarTab('toc')

      const url = new URL(window.location.href)
      url.searchParams.set('ticket', ticket)
      if (report.selectedVersion && report.selectedVersion !== 'legacy') {
        url.searchParams.set('version', report.selectedVersion)
      } else {
        url.searchParams.delete('version')
      }
      window.history.replaceState({}, '', url.toString())
    } catch (error) {
      setCurrentReportDirectory('')
      setMarkdownContent('')
      setTocItems([])
      setTocPlaceholder('Unable to build section index.')
      setStatus(`Unable to load ticket (${(error as Error).message}).`, true)
    } finally {
      setLoading(false)
    }
  }

  async function approveDraftForCurrentTicket() {
    const ticket = currentSlug || normalizeSlug(slugInput)
    if (!ticket) {
      setStatus('Load a ticket before approving a draft.', true)
      return
    }

    setApprovalLoading(true)
    setStatus(`Approving draft for ${ticket} ...`)

    try {
      const result = await fetchJson<ApproveDraftResponse>(
        `/api/approve-ticket?ticket=${encodeURIComponent(ticket)}`,
        { method: 'POST' },
      )

      await loadTicket(ticket, result.approvedVersion)
      setStatus(`Approved draft for ${ticket} as ${result.approvedVersion}.`)
    } catch (error) {
      setStatus(`Unable to approve draft (${(error as Error).message}).`, true)
    } finally {
      setApprovalLoading(false)
    }
  }

  useEffect(() => {
    if (!markdownContent || !viewerRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      if (!viewerRef.current) return
      buildToc(viewerRef.current)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [markdownContent])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialTicket = normalizeSlug(params.get('ticket') || '')
    const initialVersion = (params.get('version') || '').trim()

    if (initialTicket) {
      setSlugInput(initialTicket)
      void loadTicket(initialTicket, initialVersion)
      setSidebarTab('toc')
    }

    void browseTo('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onBrowseItemClick(item: BrowseItem) {
    if (item.type !== 'directory') {
      return
    }

    const isTicketDirectory = /^[A-Z0-9][A-Z0-9_-]+$/i.test(item.name)
    if (browsePrefix === '' && isTicketDirectory) {
      const ticket = normalizeSlug(item.name)
      setSlugInput(ticket)
      void loadTicket(ticket, '')
      return
    }

    void browseTo(item.key)
  }

  function loadTicketFromCommand() {
    const resolvedTicket = resolveTicketForCommand(
      commandQueryTicket || slugInput,
      currentSlug,
    )
    if (!resolvedTicket) {
      setStatus('No ticket to load. Enter a ticket ID first.', true)
      setIsCommandOpen(false)
      return
    }

    setSlugInput(resolvedTicket)
    void loadTicket(resolvedTicket, '')
    setIsCommandOpen(false)
  }

  return (
    <main className="mx-auto max-w-screen-xl px-5 py-6">
      <Card className="border border-border/80 bg-card/95 py-0 shadow-sm">
        <CardHeader className="pt-5">
          <Badge
            variant="outline"
            className="h-6 w-fit gap-1.5 border-primary/20 bg-primary/5 px-2.5 py-1 leading-none font-semibold tracking-[0.08em] text-primary uppercase"
          >
            <span className="size-1.5 rounded-full bg-primary/70" aria-hidden="true" />
            QA Results
          </Badge>
          <CardTitle className="text-3xl tracking-tight">{pageTitle}</CardTitle>
          <CardDescription>
            Browse QA ticket reports from the mounted cases directory or load one directly by ID.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pb-5">
          <form
            className="flex flex-wrap items-center gap-2.5"
            onSubmit={(event) => {
              event.preventDefault()
              const ticket = normalizeSlug(slugInput)
              setSlugInput(ticket)

              if (!ticket) {
                setStatus('Please enter a ticket ID.', true)
                return
              }

              void loadTicket(ticket, '')
            }}
          >
            <Input
              value={slugInput}
              onChange={(event) => setSlugInput(event.target.value)}
              type="text"
              placeholder="MAMAS-7325"
              autoComplete="off"
              spellCheck={false}
              aria-label="Ticket ID"
              required
              disabled={loading}
              className="h-11 min-w-56 flex-1 tracking-wide uppercase"
            />

            <Select
              value={selectedReportVersion}
              disabled={loading}
              onValueChange={(version) => {
                setSelectedReportVersion(version)

                const slug = currentSlug || normalizeSlug(slugInput)
                if (!slug) {
                  return
                }

                void loadTicket(slug, version)
              }}
            >
              <SelectTrigger
                size="lg"
                className="h-12 min-w-[20rem] overflow-visible rounded-xl border-border/90 px-3.5 py-0"
              >
                <span className="flex min-w-0 items-center gap-1.5 py-px text-sm leading-6">
                  <span className="truncate font-semibold">{selectedVersionText}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="truncate pt-px pb-0.5 italic text-muted-foreground">
                    {selectedVersionUpdatedText}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent
                side="bottom"
                align="start"
                sideOffset={8}
                alignItemWithTrigger={false}
                className="min-w-[20rem] max-h-[15.75rem] rounded-xl p-1.5"
              >
                {reportVersions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-12 rounded-lg px-3 py-3 leading-6"
                  >
                    <span className="font-semibold">{option.versionText || option.value}</span>
                    <span className="mx-1 text-muted-foreground">•</span>
                    <span className="pt-px pb-0.5 italic text-muted-foreground">
                      {formatVersionUpdatedTextForViewer(option.lastUpdatedMs)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="submit" disabled={loading} className="h-11 px-4 font-semibold">
              {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Load Ticket
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setIsCommandOpen(true)}
            >
              <CommandIcon className="mr-1.5 size-4" />
              Command
            </Button>

            {selectedVersionOption?.isDraft ? (
              <Button
                type="button"
                className="h-11 px-4 font-semibold"
                disabled={loading || approvalLoading || !currentSlug}
                onClick={() => {
                  void approveDraftForCurrentTicket()
                }}
              >
                {approvalLoading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                Approve Draft
              </Button>
            ) : null}
          </form>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {loading ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <span className="size-2 rounded-full bg-primary/70" aria-hidden="true" />
            )}
            <span className={loading ? 'animate-pulse' : ''}>
              {loading
                ? 'Loading report and version details...'
                : selectedVersionOption?.isDraft
                  ? `Draft pending approval • Last updated ${selectedVersionUpdatedText}`
                  : `Version ${selectedVersionText} • Last updated ${selectedVersionUpdatedText}`}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Direct link format:{' '}
            <code className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              ?ticket=MAMAS-7325&version=v1
            </code>
          </p>

          {statusText ? (
            <Alert variant={statusError ? 'destructive' : 'default'}>
              {statusError ? null : <CheckCircle2 className="size-4" />}
              <AlertTitle>{statusError ? 'Unable to complete request' : 'Status'}</AlertTitle>
              <AlertDescription>{statusText}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <section
        className={`mt-4 grid items-start gap-4 ${
          isMobile ? 'grid-cols-1' : 'grid-cols-[300px_minmax(0,1fr)]'
        }`}
      >
        <Card
          className={`border border-border/80 py-0 shadow-sm ${
            isMobile ? 'static' : 'sticky top-4'
          }`}
        >
          <Tabs
            value={sidebarTab}
            onValueChange={(value) => setSidebarTab(value as 'browse' | 'toc')}
            className="gap-0"
          >
            <CardHeader className="pb-0">
              <TabsList variant="line" className="w-full rounded-none bg-transparent p-0">
                <TabsTrigger value="browse" className="h-10 flex-1 rounded-none">
                  <FolderOpen className="size-4" />
                  Browse
                </TabsTrigger>
                <TabsTrigger value="toc" className="h-10 flex-1 rounded-none">
                  <ListTree className="size-4" />
                  Contents
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <Separator />

            <TabsContent value="browse" className="m-0">
              <ScrollArea
                className={`sidebar-scroll ${
                  isMobile ? 'max-h-[28rem]' : 'h-[calc(100vh-270px)] min-h-[420px]'
                }`}
              >
                <CardContent className="p-3.5">
                  <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => void browseTo('')}
                      className={`font-semibold hover:text-primary ${
                        browsePrefix === '' ? 'text-primary' : ''
                      }`}
                    >
                      root
                    </button>

                    {browseBreadcrumbs.map((segment, index) => (
                      <span key={segment.prefix} className="contents">
                        <span>/</span>
                        <button
                          type="button"
                          onClick={() => void browseTo(segment.prefix)}
                          className={`max-w-[120px] truncate hover:text-primary ${
                            index === browseBreadcrumbs.length - 1
                              ? 'font-semibold text-foreground'
                              : ''
                          }`}
                          title={segment.name}
                        >
                          {segment.name}
                        </button>
                      </span>
                    ))}
                  </nav>

                  {browseLoading ? (
                    <div className="space-y-2 py-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : browseError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Browse error</AlertTitle>
                      <AlertDescription>{browseError}</AlertDescription>
                    </Alert>
                  ) : !browseItems.length ? (
                    <div className="py-3 text-center text-sm text-muted-foreground">No items found.</div>
                  ) : (
                    <ul className="m-0 grid list-none gap-0.5 p-0">
                      {browsePrefix ? (
                        <li>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={browseUp}
                            className="w-full justify-start"
                          >
                            ../
                          </Button>
                        </li>
                      ) : null}

                      {browseItems.map((item) => (
                        <li key={item.key}>
                          {item.type === 'directory' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onBrowseItemClick(item)}
                              className="w-full justify-start"
                              title={item.name}
                            >
                              <FolderOpen className="size-3.5" />
                              <span className="truncate font-medium">{item.name}</span>
                            </Button>
                          ) : (
                            <a
                              href={toFileHref(item.key)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-foreground no-underline hover:bg-muted"
                              title={item.name}
                            >
                              <FileText className="size-3.5 shrink-0" />
                              <span className="truncate">{item.name}</span>
                              {item.size ? (
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                  {item.size}
                                </span>
                              ) : null}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="toc" className="m-0">
              <ScrollArea
                className={`sidebar-scroll ${
                  isMobile ? 'max-h-[28rem]' : 'h-[calc(100vh-270px)] min-h-[420px]'
                }`}
              >
                <CardContent className="p-3.5">
                  {tocItems.length ? (
                    <ul className="m-0 grid list-none gap-1 p-0">
                      {tocItems.map((item) => (
                        <li key={item.id} className={item.level >= 3 ? 'pl-3' : ''}>
                          <a
                            href={`#${item.id}`}
                            className={`block rounded-md px-2 py-2 text-sm leading-relaxed no-underline hover:bg-accent ${
                              item.level >= 3 ? 'text-muted-foreground' : 'text-foreground'
                            }`}
                            title={item.text}
                          >
                            {item.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 text-sm leading-relaxed text-muted-foreground">{tocPlaceholder}</p>
                  )}
                </CardContent>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="min-h-[480px] min-w-0 border border-border/80 py-0 shadow-sm">
          <CardContent className="p-5">
            {loading ? (
              <div className="relative overflow-hidden rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  Rendering report...
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-9 w-2/3" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-5/6" />
                  <Skeleton className="h-6 w-4/5" />
                  <Skeleton className="h-44 w-full" />
                </div>
              </div>
            ) : !markdownContent ? (
              <Alert>
                <AlertTitle>No report loaded</AlertTitle>
                <AlertDescription>
                  Enter a ticket ID and click <strong>Load Ticket</strong>, or browse tickets in the
                  sidebar.
                </AlertDescription>
              </Alert>
            ) : (
              <div ref={viewerRef} className="markdown prose prose-slate max-w-none break-words">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    rehypeSlug,
                    [
                      rehypeAutolinkHeadings,
                      {
                        behavior: 'append',
                        properties: {
                          className: ['heading-anchor'],
                          ariaHidden: 'true',
                        },
                      },
                    ],
                    rehypeSanitize,
                  ]}
                  components={markdownComponents}
                >
                  {markdownContent}
                </ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <Command>
          <CommandInput
            placeholder="Search actions/sections, or type ticket (e.g. MAMAS-7348)..."
            value={commandQuery}
            onValueChange={setCommandQuery}
          />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>

            <CommandGroup heading="Actions">
              <CommandItem
                value={commandQueryTicket ? `load-ticket ${commandQueryTicket}` : 'load-ticket'}
                onSelect={loadTicketFromCommand}
              >
                <FileText className="size-4" />
                Load ticket
                <CommandShortcut>
                  {resolveTicketForCommand(commandQueryTicket || slugInput, currentSlug) || 'N/A'}
                </CommandShortcut>
              </CommandItem>
              <CommandItem
                value="approve-draft"
                disabled={!currentSlug || !hasDraftVersion || approvalLoading}
                onSelect={() => {
                  setIsCommandOpen(false)
                  void approveDraftForCurrentTicket()
                }}
              >
                <CheckCircle2 className="size-4" />
                Approve draft
                <CommandShortcut>
                  {!currentSlug ? 'N/A' : hasDraftVersion ? 'Ready' : 'No draft'}
                </CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Navigation">
              <CommandItem
                value="switch-browse"
                onSelect={() => {
                  setSidebarTab('browse')
                  setIsCommandOpen(false)
                }}
              >
                <FolderOpen className="size-4" />
                Switch to Browse
              </CommandItem>
              <CommandItem
                value="switch-contents"
                onSelect={() => {
                  setSidebarTab('toc')
                  setIsCommandOpen(false)
                }}
              >
                <ListTree className="size-4" />
                Switch to Contents
              </CommandItem>
            </CommandGroup>

            {tocItems.length ? <CommandSeparator /> : null}
            {tocItems.length ? (
              <CommandGroup heading="Sections">
                {tocItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`section-${item.text}`}
                    onSelect={() => {
                      const target = document.getElementById(item.id)
                      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      window.location.hash = item.id
                      setIsCommandOpen(false)
                    }}
                  >
                    <ListTree className="size-4" />
                    {item.text}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </main>
  )
}
