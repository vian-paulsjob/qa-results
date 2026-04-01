import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getReportVersions,
  listBrowseItems,
  normalizeFilePath,
  resolveFileForRead,
  resolveReport,
} from './cases'

describe('cases helpers', () => {
  let tempRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'qa-results-cases-'))
  })

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('lists directories and files for browse view', async () => {
    await mkdir(path.join(tempRoot, 'MAMAS-0001'))
    await writeFile(path.join(tempRoot, 'README.md'), '# hello', 'utf8')

    const result = await listBrowseItems('', tempRoot)

    expect(result.prefix).toBe('')
    expect(result.items.map((item) => item.key)).toEqual([
      'MAMAS-0001/',
      'README.md',
    ])
  })

  it('resolves report from selected version', async () => {
    const ticketRoot = path.join(tempRoot, 'MAMAS-7000')
    await mkdir(path.join(ticketRoot, 'v1'), { recursive: true })
    await mkdir(path.join(ticketRoot, 'v2'), { recursive: true })

    await writeFile(path.join(ticketRoot, 'v1', 'test-results.md'), 'v1 body', 'utf8')
    await writeFile(path.join(ticketRoot, 'v2', 'test-results.md'), 'v2 body', 'utf8')

    const report = await resolveReport('mamas-7000', 'v2', tempRoot)

    expect(report.ticket).toBe('MAMAS-7000')
    expect(report.selectedVersion).toBe('v2')
    expect(report.reportPath).toBe('MAMAS-7000/v2/test-results.md')
    expect(report.markdown).toBe('v2 body')
  })

  it('defaults to latest version when version is not provided', async () => {
    const ticketRoot = path.join(tempRoot, 'MAMAS-7001')
    await mkdir(path.join(ticketRoot, 'v1'), { recursive: true })
    await mkdir(path.join(ticketRoot, 'v2'), { recursive: true })
    await writeFile(path.join(ticketRoot, 'v1', 'test-results.md'), 'v1 body', 'utf8')
    await writeFile(path.join(ticketRoot, 'v2', 'test-results.md'), 'v2 body', 'utf8')

    const report = await resolveReport('MAMAS-7001', '', tempRoot)

    expect(report.selectedVersion).toBe('v2')
    expect(report.reportPath).toBe('MAMAS-7001/v2/test-results.md')
    expect(report.markdown).toBe('v2 body')
  })

  it('builds version metadata with last updated text', async () => {
    const ticketRoot = path.join(tempRoot, 'MAMAS-9000')
    await mkdir(path.join(ticketRoot, 'v1'), { recursive: true })
    await mkdir(path.join(ticketRoot, 'v2', 'evidence'), { recursive: true })
    await writeFile(path.join(ticketRoot, 'v1', 'test-results.md'), 'v1', 'utf8')
    await writeFile(path.join(ticketRoot, 'v2', 'test-results.md'), 'v2', 'utf8')
    await writeFile(path.join(ticketRoot, 'v2', 'evidence', 'screenshot.png'), 'image', 'utf8')

    const versions = await getReportVersions('mamas-9000', tempRoot)

    expect(versions.map((version) => version.value)).toEqual(['v1', 'v2'])
    expect(versions[0].versionText).toBe('v1')
    expect(versions[0].lastUpdatedMs).toBeGreaterThan(0)
    expect(versions[0].updatedText).not.toBe('Unknown')
    expect(versions[0].label).toMatch(/^v1 • /)
  })

  it('rejects path traversal and out-of-root paths', async () => {
    expect(() => normalizeFilePath('../secret.txt')).toThrow()
    await expect(resolveFileForRead('../secret.txt', tempRoot)).rejects.toThrow()
  })
})
