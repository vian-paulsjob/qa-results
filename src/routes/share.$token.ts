import { createFileRoute } from '@tanstack/react-router'
import { buildOgMetadata, DEFAULT_OG_DESCRIPTION, DEFAULT_OG_IMAGE_ALT } from '#/lib/seo'
import { verifyShareToken } from '#/lib/share'
import { env } from '#/env'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getBaseUrl(requestUrl: string) {
  if (env.SERVER_URL) {
    return env.SERVER_URL.replace(/\/$/, '')
  }
  const url = new URL(requestUrl)
  return `${url.protocol}//${url.host}`
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function isPreviewCrawlerRequest(request: Request) {
  const userAgent = request.headers.get('user-agent') || ''
  return /(teams|skypeuripreview|microsoft office|msteams|teamsbot|atlassian|jira|confluence|iframely|twitterbot|facebookexternalhit|linkedinbot)/i.test(
    userAgent,
  )
}

export const Route = createFileRoute('/share/$token')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const token = decodeURIComponent(url.pathname.slice('/share/'.length))
        const payload = verifyShareToken(token, env.SHARE_TOKEN_SECRET)

        if (!payload) {
          return htmlResponse(
            '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Invalid share link</title></head><body>Invalid or expired share link.</body></html>',
            404,
          )
        }

        const baseUrl = getBaseUrl(request.url)
        const appMetadata = buildOgMetadata({
          siteUrl: baseUrl,
          ticketRaw: payload.ticket,
          versionRaw: payload.version || '',
        })
        const shareUrl = `${baseUrl}/share/${encodeURIComponent(token)}`

        const title = escapeHtml(appMetadata.title)
        const description = escapeHtml(appMetadata.description || DEFAULT_OG_DESCRIPTION)
        const image = escapeHtml(appMetadata.image)
        const appUrl = escapeHtml(appMetadata.url)
        const canonical = escapeHtml(shareUrl)

        if (!isPreviewCrawlerRequest(request)) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: appMetadata.url,
              'Cache-Control': 'no-store',
            },
          })
        }

        return htmlResponse(`<!doctype html>
<html lang="en" prefix="og: https://ogp.me/ns#">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="QA Test Result">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:secure_url" content="${image}">
    <meta property="og:image:alt" content="${escapeHtml(DEFAULT_OG_IMAGE_ALT)}">
    <meta property="og:url" content="${canonical}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    <link rel="canonical" href="${canonical}">
  </head>
  <body>
    <main style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem;">
      <h1 style="font-size: 1.3rem; margin-bottom: 0.5rem;">${title}</h1>
      <p style="margin: 0 0 1rem 0; color: #475569;">${description}</p>
      <p style="margin: 0;">
        <a href="${appUrl}">Open QA report</a>
      </p>
    </main>
  </body>
</html>`)
      },
    },
  },
})
