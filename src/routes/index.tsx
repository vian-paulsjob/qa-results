import { createFileRoute } from '@tanstack/react-router'
import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CheckCircle2,
  Command as CommandIcon,
  FileText,
  FolderOpen,
  ListTree,
  Loader2,
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
}

function EvidenceFileCard({ sourcePath, label }: EvidenceNodeProps) {
  const displayPath = label || sourcePath
  const kind = evidenceKind(displayPath)

  return (
    <a href={sourcePath} target="_blank" rel="noopener noreferrer" className="my-2 block no-underline">
      <Card size="sm" className="border border-border/80 py-0 shadow-none transition-colors hover:bg-muted/30">
        <CardContent className="flex items-center gap-3 py-3">
          <Badge variant="outline" className="font-semibold">
            {evidenceBadge(kind)}
          </Badge>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-primary">
              {fileNameFromPath(displayPath) || 'Open evidence file'}
            </span>
            <span className="truncate text-xs text-muted-foreground">{displayPath}</span>
          </span>
        </CardContent>
      </Card>
    </a>
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

function EvidenceNode({ sourcePath, label }: EvidenceNodeProps) {
  const displayPath = label || sourcePath
  return evidenceKind(displayPath) === 'image' ? (
    <EvidenceImage sourcePath={sourcePath} label={label} />
  ) : (
    <EvidenceFileCard sourcePath={sourcePath} label={label} />
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
          return <EvidenceNode sourcePath={toFileHref(resolved)} label={hrefText} />
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
          return <EvidenceNode sourcePath={toFileHref(resolved)} label={text} />
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
