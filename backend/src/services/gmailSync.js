import { makeGmailFetcher } from '../lib/gmailAuth.js'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
// Two-arm query: broad subject keywords OR common recruiting sender patterns
const JOB_QUERY = [
  '(',
  // Subject arm — catches most job comms regardless of sender
  'subject:(',
    'interview OR application OR offer OR recruiter OR recruiting OR',
    '"phone screen" OR "phone call" OR "video call" OR',
    '"technical screen" OR "technical interview" OR "coding challenge" OR',
    '"take-home" OR "take home" OR assessment OR',
    'onsite OR "on-site" OR "on site" OR',
    '"next steps" OR "moving forward" OR "following up" OR',
    '"your application" OR "thank you for applying" OR "we received your application" OR',
    '"we reviewed your application" OR "application status" OR',
    'position OR opportunity OR role OR',
    'rejected OR rejection OR "not moving forward" OR "decided to move" OR',
    '"background check" OR "reference check" OR',
    '"start date" OR "offer letter" OR "job offer" OR congratulations OR',
    '"happy to connect" OR "excited to connect" OR',
    'hiring OR "join our team" OR "joining the team"',
  ')',
  // Sender arm — catches ATS / recruiting tools that use generic subjects
  'OR from:(careers OR recruiting OR recruiter OR talent OR jobs OR',
    'noreply OR no-reply OR apply OR hr OR "human resources" OR',
    'greenhouse OR lever OR workday OR smartrecruiters OR ashby OR',
    'icims OR taleo OR jobvite OR bamboohr OR rippling OR workable OR',
    'hirevue OR codility OR hackerrank OR codesignal OR karat OR',
    'indeed OR linkedin OR glassdoor OR ziprecruiter)',
  ')',
].join(' ')

const ATS_DOMAINS = new Set([
  'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
  'smartrecruiters.com', 'icims.com', 'taleo.net', 'jobvite.com',
  'bamboohr.com', 'applytojob.com', 'recruitee.com', 'ashbyhq.com',
  'rippling.com', 'workable.com', 'jazz.co', 'breezy.hr',
  'successfactors.com', 'oracle.com', 'cornerstoneondemand.com',
  'hirevue.com', 'codility.com', 'hackerrank.com', 'codesignal.com',
])

// Domains/patterns that should be dropped entirely — automated scheduling
// services that proxy recruiter emails, not actual company senders.
// These appear as "reply to recruiter@company.com" but From is the scheduler.
const BLOCKED_SENDER_RE = /jobhire/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Process IDs in small concurrent batches with a pause between each
async function fetchMetadataBatch(ids, gmailFetch, onProgress) {
  const CONCURRENT = 10   // max parallel requests (10 × 5 units = 50/250 quota)
  const PAUSE_MS   = 200  // pause between batches to stay well under quota

  const results = []
  for (let i = 0; i < ids.length; i += CONCURRENT) {
    const batch = ids.slice(i, i + CONCURRENT)
    const batchResults = await Promise.all(
      batch.map(({ id }) =>
        gmailFetch(
          `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        )
      )
    )
    results.push(...batchResults)
    onProgress?.(`Fetching metadata… ${Math.min(i + CONCURRENT, ids.length)}/${ids.length}`)
    if (i + CONCURRENT < ids.length) await sleep(PAUSE_MS)
  }
  return results
}

function parseMessage(msg) {
  const headers = msg.payload?.headers ?? []
  const get = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  return {
    id:      msg.id,
    subject: get('Subject') || '(no subject)',
    from:    get('From'),
    date:    get('Date'),
    snippet: (msg.snippet ?? '').replace(/&#\d+;|&\w+;/g, ' '),
  }
}

function extractDomain(from = '') {
  const match = from.match(/@([\w.-]+?)>?\s*$/)
  return match ? match[1].toLowerCase() : null
}

// Format a Date as YYYY/MM/DD for Gmail's `after:` search operator
function gmailDateStr(date) {
  const d = new Date(date)
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}`
}

export async function fetchJobEmails(token, onProgress, refreshToken, afterDate = null) {
  const { gmailFetch } = makeGmailFetcher(token, refreshToken)

  onProgress?.('Looking up "companies" label…')
  const { labels = [] } = await gmailFetch('/labels')
  const companiesLabel = labels.find((l) => l.name.toLowerCase() === 'companies')

  if (!companiesLabel) {
    throw new Error(
      'Gmail label "companies" not found. Create that label in Gmail, apply it to your job emails, then sync again.'
    )
  }

  if (afterDate) {
    onProgress?.(`Incremental sync — fetching emails after ${gmailDateStr(afterDate)}…`)
  }

  const allMessages = []
  let pageToken = null

  do {
    const params = new URLSearchParams({ maxResults: 500 })
    params.append('labelIds', companiesLabel.id)
    // Server-side date filter: only ask Gmail for emails newer than afterDate
    if (afterDate) params.set('q', `after:${gmailDateStr(afterDate)}`)
    if (pageToken) params.set('pageToken', pageToken)

    const { messages = [], nextPageToken } = await gmailFetch(`/messages?${params}`)
    allMessages.push(...messages)
    pageToken = nextPageToken
    onProgress?.(`Found ${allMessages.length} emails in "companies" label…`)
  } while (pageToken)

  if (allMessages.length === 0) {
    throw new Error('No emails found in the "companies" label.')
  }

  onProgress?.(`Fetching metadata for ${allMessages.length} emails…`)
  const details = await fetchMetadataBatch(allMessages, gmailFetch, onProgress)
  return details.map(parseMessage)
}

export function groupByDomain(emails) {
  const map = new Map()

  for (const email of emails) {
    const domain = extractDomain(email.from)
    if (!domain) continue
    // Drop scheduling proxies — they're not real company senders
    if (BLOCKED_SENDER_RE.test(email.from)) continue
    if (!map.has(domain)) {
      map.set(domain, { domain, isAts: ATS_DOMAINS.has(domain), emails: [] })
    }
    map.get(domain).emails.push(email)
  }

  for (const group of map.values()) {
    group.emails.sort((a, b) => new Date(a.date) - new Date(b.date))
  }

  return [...map.values()]
}
