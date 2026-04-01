type KeyLikeEvent = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
}

export function isCommandPaletteShortcut(event: KeyLikeEvent) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
}

export function resolveTicketForCommand(inputValue: string, currentTicket: string) {
  const fromInput = (inputValue || '').trim().toUpperCase()
  if (fromInput) {
    return fromInput
  }
  return (currentTicket || '').trim().toUpperCase()
}

export function extractTicketFromCommandQuery(query: string) {
  const normalized = (query || '').toUpperCase()
  const match = normalized.match(/\b[A-Z][A-Z0-9_]*-\d+\b/)
  return match ? match[0] : ''
}
