# QA Results Viewer (TanStack Start)

Single-page QA report viewer built with TanStack Start + React, using server routes to read case artifacts from `CASES_DIR`.

## Stack

- TanStack Start (React)
- Bun package manager/runtime
- Tailwind CSS
- t3env (`src/env.ts`) for typed runtime env

## Local development

```bash
bun install
cp .env.example .env
bun --bun run dev
```

App runs on `http://localhost:3000`.

## Environment variables

- `CASES_DIR` (default: `./data`)
- `BASIC_AUTH_USERNAME` (default: `admin`)
- `BASIC_AUTH_PASSWORD` (default: `admin`)
- `ALLOW_UNAUTHENTICATED_LINK_PREVIEW` (default: `true`)
- `SHARE_TOKEN_SECRET` (default: `change-me-share-secret`)
- `SHARE_LINK_TTL_SECONDS` (default: `604800`)
- `VITE_APP_TITLE` (default: `QA Test Result`)

## API routes

- `GET /api/health`
- `GET /api/browse?prefix=...`
- `GET /api/report?ticket=...&version=...`
- `GET /api/file?path=...`
- `GET /api/share-link?ticket=...&version=...`
- `GET /share/<signed-token>` (public share URL; redirects humans to report, serves metadata HTML to preview crawlers)

Global request middleware in `src/start.ts` enforces HTTP Basic Auth for most routes.
Public exceptions:
- `/api/health`
- `/favicon.ico`
- `/share/<signed-token>` (metadata-only share page for Jira/Teams previews)

With the default `ALLOW_UNAUTHENTICATED_LINK_PREVIEW=true`, known preview bots can fetch non-API GET/HEAD pages for link-card metadata. Set it to `false` to disable user-agent based bypass.

## Build and test

```bash
bun --bun run test
bun --bun run build
```

## Cloud Run deployment

CI manifests are in `ci/`:

- `ci/Dockerfile`
- `ci/cloud-build.yaml`
- `ci/cloud-run.yaml`
- `ci/skaffold.yaml`

Cloud Run service configuration expects:

- mounted bucket `gs://oracle_results` at `/data`
- `CASES_DIR=/data`
- secret-backed env vars for basic auth:
  - `BASIC_AUTH_USERNAME`
  - `BASIC_AUTH_PASSWORD`
