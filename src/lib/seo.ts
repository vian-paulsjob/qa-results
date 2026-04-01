export const DEFAULT_SITE_URL = 'https://qa-results-621964697798.europe-west10.run.app'
export const DEFAULT_OG_TITLE = 'QA Test Result'
export const DEFAULT_OG_DESCRIPTION =
  'QA Results Viewer runs on TanStack Start and reads case artifacts from the configured CASES_DIR.'
export const DEFAULT_OG_IMAGE_PATH = '/favicon.ico'
export const DEFAULT_OG_IMAGE_ALT = 'QA Results Viewer'

type BuildOgMetadataInput = {
  siteUrl?: string
  ticketRaw?: string
  versionRaw?: string
}

function normalizeSiteUrl(siteUrl: string) {
  return siteUrl.replace(/\/$/, '')
}

function normalizeTicket(value: string) {
  return value.trim().toUpperCase()
}

function normalizeVersion(value: string) {
  return value.trim()
}

export function buildOgMetadata(input: BuildOgMetadataInput) {
  const siteUrl = normalizeSiteUrl(input.siteUrl || DEFAULT_SITE_URL)
  const ticket = normalizeTicket(input.ticketRaw || '')
  const version = normalizeVersion(input.versionRaw || '')
  const image = `${siteUrl}${DEFAULT_OG_IMAGE_PATH}`

  if (!/^[A-Z0-9_-]+$/.test(ticket)) {
    return {
      title: DEFAULT_OG_TITLE,
      description: DEFAULT_OG_DESCRIPTION,
      image,
      url: `${siteUrl}/`,
    }
  }

  const params = new URLSearchParams({ ticket })
  if (version) {
    params.set('version', version)
  }

  return {
    title: `QA Test Result - ${ticket}`,
    description: `View QA report for ticket ${ticket}${version ? ` (version ${version})` : ''}.`,
    image,
    url: `${siteUrl}/?${params.toString()}`,
  }
}
