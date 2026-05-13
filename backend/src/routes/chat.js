import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildGmailQuery,
  searchGmailIds,
  fetchEmailMeta,
  fetchEmailMetaBatch,
  emailsToRows,
  GMAIL_TABLE_COLUMNS,
} from '../services/gmailEmails.js'

const router = Router()
const client = new Anthropic()

const SYSTEM_PROMPT = `You are an Email Research and Intelligence Agent.

You have access to TWO live data sources for every user message:

1. STRUCTURED EMAIL DATA — pre-parsed job applications and financial receipts (company names, stages, recruiters, amounts, dates, etc.)

2. REAL-TIME GMAIL SEARCH RESULTS — a live search of the user's entire Gmail inbox performed for this specific query. This covers ALL email types: visa, immigration, travel, banking, legal, medical, subscriptions, government, utilities, personal — anything the user has ever received.

────────────────────────────
CONVERSATIONAL BEHAVIOR
────────────────────────────

You operate as a conversation partner, not a one-shot query engine.

When the user sends a broad or ambiguous query:
1. Briefly describe what you found (e.g., "I found 312 visa-related emails")
2. Ask ONE focused clarifying question to narrow it down before generating the full table
   Good clarifying questions:
   - "What date range are you interested in? (e.g. last 6 months, 2024, since you moved)"
   - "How many results would you like in the table?"
   - "Should I filter to emails with attachments only?"
   - "Are you looking for emails from a specific sender or organization?"
   - "Do you want to include all email types, or focus on [specific type]?"
3. Wait for the user's answer, then generate the refined final table

When the query IS specific enough (clear topic + date range or count), go directly to the structured table output.

IMPORTANT: Ask only ONE clarifying question per turn. Do not ask multiple questions at once.

────────────────────────────
RESEARCH SCOPE
────────────────────────────

The user may ask about ANYTHING in their email history:
- Job applications, interviews, recruiters, offers, rejections
- Subscriptions, billing, receipts, invoices
- Visa, immigration, travel bookings, flights, hotels
- Banking, investments, insurance, tax documents
- Medical appointments, lab results, prescriptions
- Legal documents, contracts, agreements
- Government correspondence, utilities, rent
- Networking contacts, conferences, events
- Personal communications, family, friends

You are NOT limited to predefined schemas. Research can cover any email topic.

────────────────────────────
CORE OPERATING PRINCIPLES
────────────────────────────

1. SEMANTIC SEARCH — understand intent, synonyms, implied meaning, thread context
2. DYNAMIC SCHEMA — infer best columns from the data and the user's request
3. THREAD UNDERSTANDING — merge replies, forwards, follow-ups into unified events
4. STRUCTURED EXTRACTION — extract people, orgs, dates, amounts, statuses, locations
5. TEMPORAL REASONING — understand "last year", "before I moved", "Q1 2025"
6. HANDLE UNCERTAINTY — never hallucinate; mark inferred values; leave blanks when unsure
7. DEDUPLICATION — avoid duplicate rows unless explicitly requested

────────────────────────────
DATA SOURCE PRIORITY
────────────────────────────

- Job/application queries → STRUCTURED DATA (more complete, pre-parsed)
- Receipt/expense queries → STRUCTURED DATA (more complete, pre-parsed)
- Everything else (visa, travel, legal, medical, etc.) → REAL-TIME GMAIL SEARCH RESULTS
- When both are relevant, combine them

────────────────────────────
OUTPUT FORMAT
────────────────────────────

Always provide:
1. Brief summary (1–2 sentences describing what was found)
2. Structured table in markdown (when data is ready / query is specific)
3. Key assumptions (if any)
4. Optional: refinement suggestions ("You can also ask me to filter by sender, add a Status column, etc.")

Prefer concise outputs. Use markdown tables with normalized rows, deterministic columns, readable labels.

────────────────────────────
EMAIL FILTERING
────────────────────────────

Prioritize: human conversations, decisions, workflows, receipts, scheduling, contracts, confirmations, action-oriented emails.
Deprioritize: spam, newsletters, promotions, automated digests — unless directly relevant.

────────────────────────────
PRIVACY & SECURITY
────────────────────────────

Never expose irrelevant sensitive information. Redact credentials, secrets, tokens, SSNs. Prefer summarized structured outputs.`

// ── Context builder ────────────────────────────────────────────────────────────

const MAX_CONTEXT_CHARS = 560_000   // ≈ 140K tokens — safe under 200K model limit
const MAX_EMAILS_PER_APP = 5        // most recent N email subjects per company

function buildContext(applications, receipts, previewEmails = [], gmailQuery = '') {
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

  // ── Real-time Gmail search (highest priority — directly answers the query) ─
  if (previewEmails.length > 0) {
    push(
      '== REAL-TIME GMAIL SEARCH RESULTS ==',
      `Gmail query: "${gmailQuery}"`,
      `Showing ${previewEmails.length} email previews (full dataset sent separately for table creation).`,
      'These emails cover any topic in the user\'s inbox — not limited to jobs or receipts.',
      '',
    )
    for (const e of previewEmails) {
      if (charBudget <= 0) { push('[... more previews omitted ...]'); break }
      push(
        'EMAIL:',
        `  Subject:        ${e.subject}`,
        `  From:           ${e.from}`,
        `  Date:           ${e.date}`,
        `  Has Attachment: ${e.hasAttachment ? 'Yes' : 'No'}`,
        `  Preview:        ${e.snippet}`,
        '',
      )
    }
  } else if (gmailQuery) {
    push(
      '== REAL-TIME GMAIL SEARCH RESULTS ==',
      `Gmail query: "${gmailQuery}"`,
      'No results found (Gmail token may have expired, or no matching emails exist).',
      '',
    )
  }

  // ── Structured job application corpus ──────────────────────────────────────
  push('== JOB APPLICATION EMAIL CORPUS ==', `Total companies: ${apps.length}`, '')

  let appsIncluded = 0
  for (const app of apps) {
    if (charBudget <= 0) {
      push(`[... ${apps.length - appsIncluded} more companies omitted — budget reached ...]`)
      break
    }
    const emails = Array.isArray(app.raw_emails) ? app.raw_emails : []
    const recent = emails.slice(-MAX_EMAILS_PER_APP)
    push(
      `COMPANY: ${app.company ?? '(unknown)'}`,
      `  Role: ${app.role ?? '—'}  |  Stage: ${app.stage ?? 'Applied'}  |  Applied: ${app.applied_date ?? '—'}`,
      `  Recruiter: ${app.recruiter_name ?? '—'} <${app.recruiter_email ?? '—'}>`,
      `  Industry: ${app.industry ?? '—'}  |  Size: ${app.company_size ?? '—'}`,
      `  Last Email: ${app.last_email_date ?? '—'}  |  Email Count: ${app.email_count ?? 0}  |  Interviews: ${app.interview_count ?? 0}`,
      ...(recent.length > 0 ? [
        `  Recent emails (${recent.length < emails.length ? `${recent.length} of ${emails.length}` : recent.length}):`,
        ...recent.map(e => `    [${e.date ?? '?'}] ${e.from ?? '?'} — ${e.subject ?? '(no subject)'}`),
      ] : []),
      '',
    )
    appsIncluded++
  }

  // ── Structured receipts corpus ─────────────────────────────────────────────
  push('== RECEIPT / EXPENSE EMAIL CORPUS ==', `Total receipts: ${rcts.length}`, '')

  for (const r of rcts) {
    if (charBudget <= 0) { push('[... more receipts omitted — budget reached ...]'); break }
    push(
      `RECEIPT: ${r.company ?? '(unknown)'}  |  Amount: ${r.amount != null ? `$${Number(r.amount).toFixed(2)}` : '—'}  |  Date: ${r.date ?? '—'}  |  Category: ${r.category ?? '—'}`,
      `  Description: ${r.description ?? '—'}`,
      '',
    )
  }

  return lines.join('\n')
}

// ── Route ──────────────────────────────────────────────────────────────────────

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

    const gmailQuery = gmailToken ? buildGmailQuery(message) : null

    // ── Phase 1: parallel — DB fetch + Gmail ID search ──────────────────────
    const [
      [{ data: applications }, { data: receipts }],
      allMessageIds,
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
      gmailToken ? searchGmailIds(gmailToken, gmailQuery, 500) : Promise.resolve([]),
    ])

    // ── Phase 2: fetch metadata for first 30 emails (fast — for Claude context) ─
    const previewIds    = allMessageIds.slice(0, 30)
    const remainingIds  = allMessageIds.slice(30)

    const previewEmails = previewIds.length > 0
      ? (await Promise.all(previewIds.map(m => fetchEmailMeta(gmailToken, m.id)))).filter(Boolean)
      : []

    // Start fetching remaining emails in background (runs while Claude streams)
    const remainingPromise = remainingIds.length > 0
      ? fetchEmailMetaBatch(gmailToken, remainingIds, 20)
      : Promise.resolve([])

    // ── Phase 3: build context and stream Claude response ───────────────────
    const context = buildContext(applications, receipts, previewEmails, gmailQuery)

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

    // ── Phase 4: send full email dataset (background fetch should be done by now) ─
    if (allMessageIds.length > 0 && gmailToken) {
      const remainingEmails = await remainingPromise
      const allEmails       = [...previewEmails, ...remainingEmails]

      send({
        type:    'emails',
        data:    allEmails,
        query:   gmailQuery,
        total:   allMessageIds.length,   // total IDs found (may be > allEmails.length)
        columns: GMAIL_TABLE_COLUMNS,
        rows:    emailsToRows(allEmails),
      })
    }

    send({ type: 'done' })
  } catch (err) {
    send({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
})

export default router
