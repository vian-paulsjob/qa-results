import { createMiddleware, createStart } from '@tanstack/react-start'
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

const basicAuthMiddleware = createMiddleware().server(async ({ pathname, request, next }) => {
  if (pathname === '/api/health') {
    return next()
  }

  if (!isAuthorized(request)) {
    return unauthorizedResponse()
  }

  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [basicAuthMiddleware],
}))
