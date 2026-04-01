import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod'

const viteEnv =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
const processEnv = typeof process !== 'undefined' ? process.env : {}

export const env = createEnv({
  server: {
    SERVER_URL: z.string().url().optional(),
    CASES_DIR: z.string().default('./data'),
    BASIC_AUTH_USERNAME: z.string().min(1).default('admin'),
    BASIC_AUTH_PASSWORD: z.string().min(1).default('admin'),
    ALLOW_UNAUTHENTICATED_LINK_PREVIEW: z.string().default('true'),
    SHARE_TOKEN_SECRET: z.string().min(1).default('change-me-share-secret'),
    SHARE_LINK_TTL_SECONDS: z.string().default('604800'),
  },

  clientPrefix: 'VITE_',

  client: {
    VITE_APP_TITLE: z.string().min(1).default('QA Test Result'),
  },

  runtimeEnv: { ...processEnv, ...viteEnv },

  emptyStringAsUndefined: true,
})
