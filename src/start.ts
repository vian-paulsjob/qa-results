import { createMiddleware, createStart } from '@tanstack/react-start'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { env } from './env'

function unauthorizedResponse() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="QA Results", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  })
}

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false
  }

  const encoded = authHeader.slice('Basic '.length).trim()
  let decoded = ''

  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    return false
  }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex <= 0) {
    return false
  }

  const username = decoded.slice(0, separatorIndex)
  const password = decoded.slice(separatorIndex + 1)

  return (
    username === env.BASIC_AUTH_USERNAME &&
    password === env.BASIC_AUTH_PASSWORD
  )
}

const staticRoots = [
  resolve(process.cwd(), 'dist/client'),
  resolve(process.cwd(), '.output/public'),
  resolve(process.cwd(), 'public'),
]

function hasFileExtension(pathname: string) {
  const lastSegment = pathname.split('/').pop() || ''
  return lastSegment.includes('.')
}

function getContentType(pathname: string) {
  const lower = pathname.toLowerCase()
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
    return 'application/javascript; charset=utf-8'
  }
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8'
  if (lower.endsWith('.woff2')) return 'font/woff2'
  if (lower.endsWith('.woff')) return 'font/woff'
  if (lower.endsWith('.ttf')) return 'font/ttf'
  return 'application/octet-stream'
}

function isAssetRequest(pathname: string) {
  if (pathname.startsWith('/api/')) return false
  return pathname.startsWith('/assets/') || hasFileExtension(pathname)
}

async function tryServeStaticAsset(pathname: string) {
  if (!isAssetRequest(pathname)) {
    return null
  }

  const relativePath = pathname.replace(/^\/+/, '')
  if (!relativePath || relativePath.includes('..')) {
    return null
  }

  for (const root of staticRoots) {
    const fullPath = resolve(root, relativePath)
    if (!fullPath.startsWith(`${root}/`) && fullPath !== root) {
      continue
    }

    try {
      await access(fullPath)
      const content = await readFile(fullPath)
      const isHashedAsset = pathname.startsWith('/assets/')

      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': getContentType(pathname),
          'Cache-Control': isHashedAsset
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
        },
      })
    } catch {
      // Try next static root.
    }
  }

  return null
}

const staticAssetMiddleware = createMiddleware().server(async ({ pathname, next }) => {
  const staticResponse = await tryServeStaticAsset(pathname)
  if (staticResponse) {
    return staticResponse
  }

  return next()
})

const basicAuthMiddleware = createMiddleware().server(async ({ pathname, request, next }) => {
  if (pathname === '/api/health') {
    return next()
  }

  if (!isAuthorized(request)) {
    return unauthorizedResponse()
  }

  return next()
})

const htmlNoCacheMiddleware = createMiddleware().server(async ({ pathname, next }) => {
  const response = await next()

  if (!(response instanceof Response)) {
    return response
  }

  if (isAssetRequest(pathname) || pathname.startsWith('/api/')) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    basicAuthMiddleware,
    staticAssetMiddleware,
    htmlNoCacheMiddleware,
  ],
}))
