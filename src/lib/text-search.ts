export type TextMatchSegment = {
  text: string
  match: boolean
}

export function normalizeSearchQuery(query: string) {
  return query.trim()
}

export function splitTextMatches(text: string, query: string): TextMatchSegment[] {
  const needle = normalizeSearchQuery(query)
  if (!needle) {
    return [{ text, match: false }]
  }

  const haystack = text.toLocaleLowerCase()
  const normalizedNeedle = needle.toLocaleLowerCase()
  const segments: TextMatchSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const foundAt = haystack.indexOf(normalizedNeedle, cursor)
    if (foundAt === -1) {
      segments.push({ text: text.slice(cursor), match: false })
      break
    }

    if (foundAt > cursor) {
      segments.push({ text: text.slice(cursor, foundAt), match: false })
    }

    segments.push({
      text: text.slice(foundAt, foundAt + needle.length),
      match: true,
    })
    cursor = foundAt + needle.length
  }

  return segments.length > 0 ? segments : [{ text, match: false }]
}

export function countTextMatches(text: string, query: string) {
  return splitTextMatches(text, query).reduce((count, segment) => {
    return segment.match ? count + 1 : count
  }, 0)
}
