import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()
const client = new Anthropic()

const SYSTEM_PROMPT = `You are an Email Research and Intelligence Agent.

You have access to TWO data sources:

1. STRUCTURED EMAIL DATA — pre-parsed job applications and financial receipts extracted from the user's Gmail (company names, stages, recruiters, amounts, dates, etc.)

2. REAL-TIME GMAIL SEARCH RESULTS — a live search of the user's entire Gmail inbox performed specifically for this query. This includes ALL email types: visa, immigration, travel, banking, legal, medical, subscriptions, networking, personal, government, utilities — anything the user has ever received.

Your job is to analyze whichever source(s) are relevant to the user's question and transform unstructured email conversations into structured research outputs.

The user may ask arbitrary research questions such as:
- "Show all companies I interviewed with in the last 2 years."
- "Create a table of every subscription I pay for."
- "List all flights I booked in 2025."
- "Show all investors I spoke with."
- "Find every conversation related to AI agents."
- "Show all visa-related emails with attachments."
- "Track all unresolved customer complaints."
- "Show all receipts above $500."
- "Create a timeline of immigration-related emails."
- "List all recruiters who ghosted me."
- "Find all emails mentioning layoffs."
- "Show all banking alerts from last month."
- "Find all doctor appointment confirmations."
- "Show all Amazon orders."
- "Create a table of apartment hunting conversations."

You are NOT limited to predefined schemas. Research can cover ANY topic found in emails.

────────────────────────────
CORE OPERATING PRINCIPLES
────────────────────────────

1. SEMANTIC SEARCH FIRST
Do not rely only on keyword matching. Understand intent, synonyms, context, thread progression, implied meaning, temporal references.

2. DYNAMIC SCHEMA GENERATION
Output schema is NOT fixed. Determine best columns dynamically based on the user's request.

For subscriptions: | Vendor | Amount | Billing Cycle | Last Charge |
For interviews: | Company | Stage | Recruiter | Status |
For travel: | Airline | Destination | Date | Cost |
For networking: | Person | Company | Context | Last Interaction |
For visa/immigration: | Document | Status | Authority | Date | Notes |

3. EMAIL THREAD UNDERSTANDING
Treat related email threads as connected workflows. Merge replies, forwarded chains, scheduling emails, follow-ups, reminders into unified entities/events.

4. STRUCTURED EXTRACTION
Extract: people, organizations, events, transactions, timelines, topics, statuses, dates, locations, action items, monetary values, sentiment, intent. Normalize inconsistent formats.

5. TEMPORAL REASONING
Understand "last year", "before I moved", "during interviews", "after layoffs", "recently", "Q1 2025". Infer date ranges intelligently.

6. HANDLE UNCERTAINTY
Never hallucinate. If uncertain: leave fields blank, mark values as inferred, provide confidence indicators.
Example: Stage = "Final Round" (inferred)

7. DEDUPLICATION
Avoid duplicate rows unless explicitly requested.

8. DATA SOURCE PRIORITY
- For job/application questions → use STRUCTURED DATA (more complete)
- For receipts/expenses → use STRUCTURED DATA (more complete)
- For any other email topic (visa, travel, legal, medical, etc.) → use REAL-TIME GMAIL SEARCH RESULTS
- When both are relevant, combine them

────────────────────────────
OUTPUT FORMAT
────────────────────────────

Always provide:
1. Brief summary (1–2 sentences)
2. Structured table in markdown
3. Key assumptions (if any)
4. Optional insights

Prefer concise outputs. Use markdown tables. Tables should use normalized rows, deterministic columns, readable labels, and avoid redundant data.

────────────────────────────
ADVANCED ANALYSIS
────────────────────────────

Support: grouping, filtering, trend analysis, timelines, funnel analysis, topic extraction, sentiment analysis, communication frequency, relationship mapping, response latency, anomaly detection, workflow extraction.

────────────────────────────
EMAIL FILTERING
────────────────────────────

Prioritize: human conversations, decisions, workflows, receipts, scheduling, contracts, confirmations, action-oriented emails.
Deprioritize: spam, newsletters, promotions, automated digests — unless directly relevant.

────────────────────────────
PRIVACY & SECURITY
────────────────────────────

Never expose irrelevant sensitive information. Redact credentials, secrets, tokens, SSNs. Prefer summarized structured outputs.

────────────────────────────
USER EXPERIENCE
────────────────────────────

Be concise. Prefer tables over prose. Make reasonable assumptions. Do not ask unnecessary follow-up questions. Allow iterative refinement.

The user may refine with: "group by company", "only show unresolved", "sort by amount", "add sentiment", "show timeline", "remove duplicates", "include email frequency".

Your goal is NOT to answer like a chatbot. Behave like an intelligent email analyst, semantic research engine, and structured data generator.`

// ── Gmail real-time search ────────────────────────────────────────────────────

// Common words that add noise to a Gmail search query
const STOP_WORDS = new Set([
  'can', 'you', 'fetch', 'all', 'the', 'emails', 'email', 'which', 'are', 'related',
  'to', 'my', 'and', 'has', 'an', 'with', 'i', 'a', 'is', 'it', 'in', 'on', 'at',
  'for', 'of', 'from', 'that', 'this', 'these', 'those', 'show', 'find', 'get',
  'list', 'give', 'me', 'please', 'about', 'any', 'some', 'have', 'been', 'was',
  'were', 'be', 'do', 'did', 'will', 'would', 'could', 'should', 'what', 'where',
  'when', 'how', 'create', 'make', 'table', 'tell', 'inbox', 'sent', 'recent',
  'latest', 'old', 'new', 'every', 'each', 'also', 'just', 'only', 'very',
  'attachment', 'attachments', 'attached',
])

/** Convert a natural-language question into a Gmail search query string */
function buildGmailQuery(userMessage) {
  const parts = []

  // Gmail modifier detection
  if (/has\s+attach|with\s+attach|\battach(ment|ed)?s?\b/i.test(userMessage)) {
    parts.push('has:attachment')
  }
  if (/\bunread\b/i.test(userMessage))  parts.push('is:unread')
  if (/\bstarred\b/i.test(userMessage)) parts.push('is:starred')

  // "from X" extraction
  const fromMatch = userMessage.match(/\bfrom\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i)
  if (fromMatch) parts.push(`from:${fromMatch[1]}`)

  // Year range — "in 2024", "during 2023", "last year"
  const yearMatch = userMessage.match(/\b(20\d{2})\b/)
  if (yearMatch) parts.push(`after:${yearMatch[1]}/01/01 before:${Number(yearMatch[1]) + 1}/01/01`)

  // Extract meaningful content keywords (remove stop words)
  const keywords = userMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .slice(0, 8)                               // cap at 8 keywords

  parts.push(...keywords)
  return parts.join(' ').trim() || userMessage.slice(0, 200)
}

/** Search Gmail and return up to maxResults message IDs */
async function searchGmail(gmailToken, query, maxResults = 40) {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${gmailToken}` } })
    if (!res.ok) return []
    const { messages = [] } = await res.json()
    return messages
  } catch {
    return []
  }
}

/** Fetch metadata for a single message (subject, from, date, snippet, has attachment) */
async function fetchEmailMeta(gmailToken, messageId) {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata` +
      `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${gmailToken}` } })
    if (!res.ok) return null
    const data = await res.json()
    const headers = data.payload?.headers ?? []
    const getH   = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '—'
    const parts  = data.payload?.parts ?? []
    const hasAttachment = parts.some(p => p.filename && p.filename.length > 0) ||
                          (data.payload?.mimeType === 'multipart/mixed')
    return {
      subject:       getH('Subject'),
      from:          getH('From'),
      to:            getH('To'),
      date:          getH('Date'),
      snippet:       (data.snippet ?? '').replace(/\s+/g, ' ').slice(0, 200),
      hasAttachment,
    }
  } catch {
    return null
  }
}

// ── Context builder ───────────────────────────────────────────────────────────

// ~4 chars per token; leave ~30K tokens headroom for system prompt + user msg + response
const MAX_CONTEXT_CHARS = 580_000   // ≈ 145K tokens — safe under 200K model limit
const MAX_EMAILS_PER_APP = 5        // most recent N email subjects per company

function buildContext(applications, receipts, searchedEmails = [], gmailQuery = '') {
  const apps = Array.isArray(applications) ? applications : []
  const rcts = Array.isArray(receipts)     ? receipts     : []

  const lines = []
  let charBudget = MAX_CONTEXT_CHARS

  const push = (...strs) => {
    for (const s of strs) {
      lines.push(s)
      charBudget -= s.length + 1
    }
  }

  // ── Real-time Gmail search results (highest priority — directly answers the query) ──
  if (searchedEmails.length > 0) {
    push(
      '== REAL-TIME GMAIL SEARCH RESULTS ==',
      `Gmail query used: "${gmailQuery}"`,
      `Emails found: ${searchedEmails.length}`,
      'Note: these are live results from the user\'s full Gmail inbox.',
      '',
    )
    for (const e of searchedEmails) {
      if (charBudget <= 0) { push('[... more search results omitted ...]'); break }
      push(
        'EMAIL:',
        `  Subject:        ${e.subject}`,
        `  From:           ${e.from}`,
        `  To:             ${e.to}`,
        `  Date:           ${e.date}`,
        `  Has Attachment: ${e.hasAttachment ? 'Yes' : 'No'}`,
        `  Preview:        ${e.snippet}`,
        '',
      )
    }
  } else if (gmailQuery) {
    push(
      '== REAL-TIME GMAIL SEARCH RESULTS ==',
      `Gmail query used: "${gmailQuery}"`,
      'No emails found matching this query (token may be expired, or no matching emails exist).',
      '',
    )
  }

  // ── Structured job application corpus ────────────────────────────────────────
  push('== JOB APPLICATION EMAIL CORPUS ==', `Total companies: ${apps.length}`, '')

  let appsIncluded = 0
  for (const app of apps) {
    if (charBudget <= 0) {
      push(`[... ${apps.length - appsIncluded} more companies omitted — token budget reached ...]`)
      break
    }
    const emails = Array.isArray(app.raw_emails) ? app.raw_emails : []
    const recent = emails.slice(-MAX_EMAILS_PER_APP)
    push(
      `COMPANY: ${app.company ?? '(unknown)'}`,
      `  Domain: ${app.company_domain ?? '—'}`,
      `  Role: ${app.role ?? '—'}`,
      `  Stage: ${app.stage ?? 'Applied'}`,
      `  Recruiter: ${app.recruiter_name ?? '—'} <${app.recruiter_email ?? '—'}>`,
      `  Industry: ${app.industry ?? '—'}`,
      `  Size: ${app.company_size ?? '—'}`,
      `  Applied: ${app.applied_date ?? '—'}`,
      `  Last Email: ${app.last_email_date ?? '—'}`,
      `  Interview Count: ${app.interview_count ?? 0}`,
      `  Email Count: ${app.email_count ?? 0}`,
      ...(recent.length > 0 ? [
        `  Emails (${recent.length < emails.length ? `${recent.length} of ${emails.length} most recent` : recent.length}):`,
        ...recent.map(e => `    - [${e.date ?? '?'}] From: ${e.from ?? '?'} | Subject: ${e.subject ?? '(no subject)'}`),
      ] : []),
      '',
    )
    appsIncluded++
  }

  // ── Structured receipts corpus ────────────────────────────────────────────────
  push('== RECEIPT / EXPENSE EMAIL CORPUS ==', `Total receipts: ${rcts.length}`, '')

  for (const r of rcts) {
    if (charBudget <= 0) { push('[... more receipts omitted — token budget reached ...]'); break }
    push(
      `RECEIPT: ${r.company ?? '(unknown)'}`,
      `  Amount: ${r.amount != null ? `$${Number(r.amount).toFixed(2)}` : '—'}`,
      `  Date: ${r.date ?? '—'}`,
      `  Category: ${r.category ?? '—'}`,
      `  Description: ${r.description ?? '—'}`,
      '',
    )
  }

  return lines.join('\n')
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { message, history = [], userId, gmailToken } = req.body
  if (!message?.trim() || !userId) {
    return res.status(400).json({ error: 'message and userId required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Build Gmail search query from user's message
    const gmailQuery = gmailToken ? buildGmailQuery(message) : null

    // Run structured DB fetch + live Gmail search in parallel
    const [
      [{ data: applications }, { data: receipts }],
      messageIds,
    ] = await Promise.all([
      Promise.all([
        supabase.from('applications')
          .select('company, company_domain, role, stage, recruiter_name, recruiter_email, industry, company_size, applied_date, last_email_date, email_count, interview_count, raw_emails')
          .eq('user_id', userId),
        supabase.from('receipts')
          .select('company, amount, date, category, description')
          .eq('user_id', userId)
          .not('company', 'is', null)
          .neq('company', '__none__'),
      ]),
      gmailToken ? searchGmail(gmailToken, gmailQuery, 40) : Promise.resolve([]),
    ])

    // Fetch metadata for top 25 Gmail results (concurrently, capped for speed)
    const searchedEmails = gmailToken && messageIds.length > 0
      ? (await Promise.all(messageIds.slice(0, 25).map(m => fetchEmailMeta(gmailToken, m.id)))).filter(Boolean)
      : []

    const context = buildContext(applications, receipts, searchedEmails, gmailQuery)

    const systemPrompt = `${SYSTEM_PROMPT}

────────────────────────────
USER'S EMAIL CORPUS
────────────────────────────

${context}`

    const messages = [
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: message },
    ]

    const stream = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 4096,
      system:     systemPrompt,
      messages,
      stream:     true,
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        send({ type: 'delta', text: chunk.delta.text })
      }
    }

    send({ type: 'done' })
  } catch (err) {
    send({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
})

export default router
