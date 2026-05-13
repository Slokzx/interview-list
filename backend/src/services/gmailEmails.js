/**
 * Gmail email search + metadata fetching utilities.
 * Shared between chat.js (inline search during chat) and gmailSearch.js (sync endpoint).
 */

// Words that add noise when converting a natural-language question into a Gmail query
const STOP_WORDS = new Set([
  'can', 'you', 'fetch', 'all', 'the', 'emails', 'email', 'which', 'are', 'related',
  'to', 'my', 'and', 'has', 'an', 'with', 'i', 'a', 'is', 'it', 'in', 'on', 'at',
  'for', 'of', 'from', 'that', 'this', 'these', 'those', 'show', 'find', 'get',
  'list', 'give', 'me', 'please', 'about', 'any', 'some', 'have', 'been', 'was',
  'were', 'be', 'do', 'did', 'will', 'would', 'could', 'should', 'what', 'where',
  'when', 'how', 'create', 'make', 'table', 'tell', 'inbox', 'sent', 'recent',
  'latest', 'old', 'new', 'every', 'each', 'also', 'just', 'only', 'very',
  'attachment', 'attachments', 'attached', 'between', 'during', 'after', 'before',
])

/**
 * Convert a natural-language question into a Gmail API search query string.
 * Detects Gmail modifiers (has:attachment, is:unread, year ranges, from:) automatically.
 */
export function buildGmailQuery(userMessage) {
  const parts = []

  // Gmail modifier detection
  if (/has\s+attach|with\s+attach|\battach(ment|ed)?s?\b/i.test(userMessage)) {
    parts.push('has:attachment')
  }
  if (/\bunread\b/i.test(userMessage))  parts.push('is:unread')
  if (/\bstarred\b/i.test(userMessage)) parts.push('is:starred')

  // "from email@domain" extraction
  const fromMatch = userMessage.match(/\bfrom\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i)
  if (fromMatch) parts.push(`from:${fromMatch[1]}`)

  // Year filter — "in 2024", "during 2023", "last year" (approximate)
  const yearMatch = userMessage.match(/\b(20\d{2})\b/)
  if (yearMatch) {
    const y = Number(yearMatch[1])
    parts.push(`after:${y}/01/01`, `before:${y + 1}/01/01`)
  }

  // "last N months/weeks" → approximate after: date
  const recentMatch = userMessage.match(/last\s+(\d+)\s+(month|week|day)s?/i)
  if (recentMatch && !yearMatch) {
    const n    = Number(recentMatch[1])
    const unit = recentMatch[2].toLowerCase()
    const ms   = unit === 'day' ? 86400000 : unit === 'week' ? 604800000 : 2592000000
    const d    = new Date(Date.now() - n * ms)
    parts.push(`after:${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`)
  }

  // Extract meaningful content keywords
  const keywords = userMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .slice(0, 8)                               // cap at 8

  parts.push(...keywords)
  return parts.join(' ').trim() || userMessage.slice(0, 200)
}

/**
 * Search Gmail and return an array of { id } objects.
 * Paginates automatically up to maxResults.
 * Pass an AbortSignal to cancel in-flight requests.
 */
export async function searchGmailIds(gmailToken, query, maxResults = 500, signal = null) {
  const messages = []
  let pageToken  = null

  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.set('q', query)
    url.searchParams.set('maxResults', Math.min(500, maxResults - messages.length).toString())
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${gmailToken}` },
      signal,
    })
    if (!res.ok) break

    const data = await res.json()
    messages.push(...(data.messages ?? []))
    pageToken = messages.length < maxResults ? (data.nextPageToken ?? null) : null
  } while (pageToken)

  return messages // [{ id, threadId }, ...]
}

/**
 * Fetch metadata (subject, from, to, date, snippet, hasAttachment, messageId)
 * for a single Gmail message.
 * Pass an AbortSignal to cancel in-flight requests.
 */
export async function fetchEmailMeta(gmailToken, messageId, signal = null) {
  try {
    const url =
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}` +
      `?format=metadata&metadataHeaders=Subject&metadataHeaders=From` +
      `&metadataHeaders=To&metadataHeaders=Date`

    const res = await fetch(url, { headers: { Authorization: `Bearer ${gmailToken}` }, signal })
    if (!res.ok) return null

    const data    = await res.json()
    const headers = data.payload?.headers ?? []
    const getH    = name =>
      headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '—'

    const parts         = data.payload?.parts ?? []
    const hasAttachment = parts.some(p => p.filename && p.filename.length > 0) ||
                          data.payload?.mimeType === 'multipart/mixed'

    return {
      messageId,
      subject:       getH('Subject'),
      from:          getH('From'),
      to:            getH('To'),
      date:          getH('Date'),
      snippet:       (data.snippet ?? '').replace(/\s+/g, ' ').slice(0, 250),
      hasAttachment,
    }
  } catch {
    return null
  }
}

/**
 * Fetch metadata for a list of message objects in batches.
 * batchSize controls how many concurrent requests per round.
 */
export async function fetchEmailMetaBatch(gmailToken, messageObjects, batchSize = 20) {
  const results = []
  for (let i = 0; i < messageObjects.length; i += batchSize) {
    const batch = messageObjects.slice(i, i + batchSize)
    const round = await Promise.all(batch.map(m => fetchEmailMeta(gmailToken, m.id)))
    results.push(...round.filter(Boolean))
  }
  return results
}

/** Standard columns for a Gmail-based research table */
export const GMAIL_TABLE_COLUMNS = ['Subject', 'From', 'Date', 'Has Attachment', 'Preview']

/** Convert raw fetchEmailMeta results into custom_tables rows */
export function emailsToRows(emails) {
  return emails.map(e => ({
    Subject:          e.subject,
    From:             e.from,
    Date:             e.date,
    'Has Attachment': e.hasAttachment ? 'Yes' : 'No',
    Preview:          e.snippet,
    _gmailId:         e.messageId, // hidden — used for "Open in Gmail" link
  }))
}
