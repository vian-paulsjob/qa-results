import { createFileRoute } from '@tanstack/react-router'
import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeSanitize from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

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
}

type ReportResponse = {
  ticket: string
  reportPath: string
  selectedVersion: string
  versions: ReportVersionOption[]
  markdown: string
}

type TocItem = {
  id: string
  text: string
  level: number
}

export const Route = createFileRoute('/')({
  component: App,
})

function normalizeSlug(value: string) {
  return (value || '').trim().toUpperCase()
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

function resolveEvidencePath(rawPath: string, slug: string) {
  const trimmed = rawPath.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (slug && !trimmed.startsWith(`${slug}/`)) {
    return `${slug}/${trimmed}`
  }
  return trimmed
}

function toFileHref(relativePath: string) {
  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath
  }
  return `/api/file?path=${encodeURIComponent(relativePath)}`
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
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
    <a
      href={sourcePath}
      target="_blank"
      rel="noopener noreferrer"
      className="my-2 flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 no-underline hover:bg-slate-50"
    >
      <span className="inline-flex h-6 min-w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 px-2 text-[11px] font-bold text-slate-600">
        {evidenceBadge(kind)}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-blue-700">
          {fileNameFromPath(displayPath) || 'Open evidence file'}
        </span>
        <span className="truncate text-xs text-slate-500">{displayPath}</span>
      </span>
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
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [tocPlaceholder, setTocPlaceholder] = useState(
    'Load a ticket to generate the section index.',
  )
  const [reportVersions, setReportVersions] = useState<ReportVersionOption[]>([
    { value: 'v1', label: 'v1', prefix: 'v1/' },
  ])
  const [selectedReportVersion, setSelectedReportVersion] = useState('v1')

  const [sidebarTab, setSidebarTab] = useState<'browse' | 'toc'>('browse')
  const [browsePrefix, setBrowsePrefix] = useState('')
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')

  const [isMobile, setIsMobile] = useState(false)
  const viewerRef = useRef<HTMLDivElement | null>(null)

  const pageTitle = currentSlug ? `QA Test Result - ${currentSlug}` : 'QA Test Result'

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1040)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
          const resolved = resolveEvidencePath(hrefText, currentSlug)
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
          const resolved = resolveEvidencePath(text, currentSlug)
          return <EvidenceNode sourcePath={toFileHref(resolved)} label={text} />
        }

        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      },
    }),
    [currentSlug],
  )

  async function loadTicket(ticketRaw: string, requestedVersion = '') {
    const ticket = normalizeSlug(ticketRaw)

    if (!/^[A-Z0-9_-]+$/.test(ticket)) {
      setStatus('Invalid ticket. Use letters, numbers, underscore, or dash.', true)
      setCurrentSlug('')
      setMarkdownContent('')
      setTocItems([])
      return
    }

    setCurrentSlug(ticket)
    setLoading(true)
    setMarkdownContent('')
    setTocItems([])
    setTocPlaceholder('Building section index...')
    setStatus(`Loading ${ticket} ...`)

    try {
      const report = await fetchJson<ReportResponse>(
        `/api/report?ticket=${encodeURIComponent(ticket)}&version=${encodeURIComponent(requestedVersion)}`,
      )

      setReportVersions(report.versions)
      setSelectedReportVersion(report.selectedVersion)
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
      setMarkdownContent('')
      setTocItems([])
      setTocPlaceholder('Unable to build section index.')
      setStatus(`Unable to load ticket (${(error as Error).message}).`, true)
    } finally {
      setLoading(false)
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

  return (
    <main className="mx-auto max-w-screen-xl px-5 py-6">
      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <div className="mb-2 text-xs font-extrabold tracking-wider text-violet-700 uppercase">
          QA Results
        </div>
        <h1 className="m-0 text-3xl leading-tight font-extrabold tracking-tight text-slate-900">
          {pageTitle}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Browse QA ticket reports from the mounted cases directory or load one
          directly by ID.
        </p>

        <form
          className="mt-4 flex flex-wrap items-center gap-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            const ticket = normalizeSlug(slugInput)
            setSlugInput(ticket)

            if (!ticket) {
              setStatus('Please enter a ticket ID.', true)
              return
            }

            void loadTicket(ticket, selectedReportVersion)
          }}
        >
          <input
            value={slugInput}
            onChange={(event) => setSlugInput(event.target.value)}
            type="text"
            placeholder="MAMAS-7325"
            autoComplete="off"
            spellCheck={false}
            aria-label="Ticket ID"
            required
            className="h-11 min-w-60 flex-1 rounded-xl border border-slate-300 px-3.5 text-sm tracking-wide uppercase outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
          />

          <button
            type="submit"
            className="h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white hover:bg-violet-800"
          >
            Load Ticket
          </button>

          <select
            value={selectedReportVersion}
            onChange={(event) => {
              const version = event.target.value
              setSelectedReportVersion(version)

              const slug = currentSlug || normalizeSlug(slugInput)
              if (!slug) {
                return
              }

              void loadTicket(slug, version)
            }}
            className="h-11 min-w-44 rounded-xl border border-slate-300 bg-white px-3 text-sm"
          >
            {reportVersions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </form>

        <div className="mt-2.5 text-sm text-slate-600">
          Direct link format:{' '}
          <code className="rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-sm">
            ?ticket=MAMAS-7325&version=v1
          </code>
        </div>

        <div
          className={`mt-1.5 min-h-[20px] text-sm ${
            statusError ? 'font-semibold text-rose-700' : 'text-slate-600'
          }`}
        >
          {statusText}
        </div>
      </section>

      <section
        className={`mt-4 grid items-start gap-4 ${
          isMobile ? 'grid-cols-1' : 'grid-cols-[280px_minmax(0,1fr)]'
        }`}
      >
        <aside
          className={`rounded-2xl border border-slate-300 bg-white shadow-sm ${
            isMobile ? 'static max-h-none' : 'sticky top-4 max-h-[calc(100vh-46px)] overflow-auto'
          }`}
        >
          <div className="flex border-b border-slate-200 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setSidebarTab('browse')}
              className={`flex-1 px-3 py-2.5 text-center transition-colors ${
                sidebarTab === 'browse'
                  ? 'border-b-2 border-violet-700 text-violet-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('toc')}
              className={`flex-1 px-3 py-2.5 text-center transition-colors ${
                sidebarTab === 'toc'
                  ? 'border-b-2 border-violet-700 text-violet-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Contents
            </button>
          </div>

          {sidebarTab === 'browse' ? (
            <div className="p-3.5">
              <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => void browseTo('')}
                  className={`font-semibold hover:text-violet-700 ${
                    browsePrefix === '' ? 'text-violet-700' : ''
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
                      className={`max-w-[120px] truncate hover:text-violet-700 ${
                        index === browseBreadcrumbs.length - 1
                          ? 'font-semibold text-slate-900'
                          : ''
                      }`}
                    >
                      {segment.name}
                    </button>
                  </span>
                ))}
              </nav>

              {browseLoading ? (
                <div className="py-4 text-center text-sm text-slate-500">Loading...</div>
              ) : browseError ? (
                <div className="py-2 text-sm text-rose-700">{browseError}</div>
              ) : !browseItems.length ? (
                <div className="py-4 text-center text-sm text-slate-400">No items found.</div>
              ) : (
                <ul className="m-0 grid list-none gap-0.5 p-0">
                  {browsePrefix ? (
                    <li>
                      <button
                        type="button"
                        onClick={browseUp}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100"
                      >
                        <span>../</span>
                      </button>
                    </li>
                  ) : null}

                  {browseItems.map((item) => (
                    <li key={item.key}>
                      {item.type === 'directory' ? (
                        <button
                          type="button"
                          onClick={() => onBrowseItemClick(item)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-violet-50"
                        >
                          <span className="truncate font-medium">{item.name}</span>
                        </button>
                      ) : (
                        <a
                          href={toFileHref(item.key)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 no-underline hover:bg-slate-100"
                        >
                          <span className="truncate">{item.name}</span>
                          {item.size ? (
                            <span className="ml-auto shrink-0 text-xs text-slate-400">
                              {item.size}
                            </span>
                          ) : null}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="p-3.5">
              {tocItems.length ? (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {tocItems.map((item) => (
                    <li key={item.id} className={item.level >= 3 ? 'pl-3' : ''}>
                      <a
                        href={`#${item.id}`}
                        className={`block rounded-lg px-2 py-2 text-sm leading-relaxed no-underline hover:bg-violet-50 ${
                          item.level >= 3 ? 'text-slate-500' : 'text-slate-900'
                        }`}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm leading-relaxed text-slate-400">
                  {tocPlaceholder}
                </p>
              )}
            </div>
          )}
        </aside>

        <article className="min-h-[480px] min-w-0 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
          {loading ? (
            <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ) : !markdownContent ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-600">
              Enter a ticket ID and click <strong>Load Ticket</strong>, or browse
              tickets in the sidebar.
            </div>
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
        </article>
      </section>
    </main>
  )
}
