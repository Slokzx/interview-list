import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { parse as parseEnv } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  buildGmailQuery,
  searchGmailIds,
  fetchEmailMeta,
  fetchEmailMetaBatch,
  emailsToRows,
  GMAIL_TABLE_COLUMNS,
} from '../services/gmailEmails.js'

const router = Router()

// Read API key directly from .env to bypass IDE-injected empty env vars.
// dotenv's config() skips keys that already exist in process.env (even if empty),
// so we parse the file manually and pass the key explicitly.
function resolveApiKey() {
  const fromEnv = process.env.ANTHROPIC_API_KEY
  if (fromEnv) return fromEnv
  try {
    const __dir = dirname(fileURLToPath(import.meta.url))
    const raw   = readFileSync(resolve(__dir, '../../.env'), 'utf8')
    return parseEnv(raw).ANTHROPIC_API_KEY ?? ''
  } catch {
    return ''
  }
}

const client = new Anthropic({ apiKey: resolveApiKey() })

const SYSTEM_PROMPT = `You are an Email Research and Intelligence Agent.

You have access to TWO live data sources for every user message:
1. STRUCTURED EMAIL DATA — pre-parsed job applications and financial receipts.
2. REAL-TIME GMAIL SEARCH RESULTS — a live search of the user's entire Gmail inbox. Covers ALL email types: visa, immigration, travel, banking, legal, medical, subscriptions, government, utilities, personal — anything the user has ever received.

────────────────────────────
CONVERSATION FLOW  ← READ CAREFULLY
────────────────────────────

You work in THREE phases. Do NOT skip phases.

PHASE 1 — EXPLORE (first message on a topic)
- Briefly describe what you found: "I found 47 visa-related emails."
- Ask EXACTLY ONE clarifying question to narrow the scope. Good examples:
  · "What date range are you interested in? (e.g. 2024, last 6 months, since you moved)"
  · "Should I include all visa emails or only those with attachments?"
  · "How many results would you like in the final table?"
  · "Are you looking for emails from a specific authority or consulate?"
- Do NOT generate a table yet. Do NOT show all results yet. Just explore.

PHASE 2 — REFINE (follow-up messages)
- Answer the user's reply, incorporate their constraints.
- If another clarification would meaningfully improve the result, ask ONE more question.
- If you have enough information, move to Phase 3.
- You may show a small preview (3–5 rows max) to confirm you're on the right track.

PHASE 3 — FINALIZE (user has confirmed all details)
- Present a clear summary of what the final table will contain:
  · How many rows
  · What columns
  · What filters were applied
- Show the complete table in markdown.
- End your response with EXACTLY this marker on its own line: [TABLE_READY]

CRITICAL RULES:
- NEVER output [TABLE_READY] before the user has confirmed the scope, date range, and filters.
- NEVER output [TABLE_READY] in Phase 1 or Phase 2.
- Only ONE [TABLE_READY] per conversation thread.
- Ask only ONE question per turn, never multiple.

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

You are NOT limited to predefined schemas.

────────────────────────────
CORE PRINCIPLES
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

- Job/application queries → STRUCTURED DATA (more complete)
- Receipt/expense queries → STRUCTURED DATA (more complete)
- Everything else → REAL-TIME GMAIL SEARCH RESULTS
- Combine when both are relevant

────────────────────────────
OUTPUT FORMAT (Phase 3 only)
────────────────────────────

1. One-sentence summary of what was found and what filters were applied
2. Complete structured table in markdown
3. Key assumptions (if any)
4. [TABLE_READY]  ← must be the very last line

────────────────────────────
EMAIL FILTERING
────────────────────────────

Prioritize: human conversations, decisions, workflows, receipts, scheduling, contracts, confirmations, action-oriented emails.
Deprioritize: spam, newsletters, promotions, automated digests — unless directly relevant.

────────────────────────────
PRIVACY & SECURITY
────────────────────────────

Never expose irrelevant sensitive information. Redact credentials, secrets, tokens, SSNs.`

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

  // Immediately show a status message so the UI isn't blank while we work
  send({ type: 'status', message: gmailToken ? 'Searching your inbox…' : 'Thinking…' })

  try {
    // ── API key guard — fail fast before any slow work ──────────────────────
    const apiKey = resolveApiKey()
    if (!apiKey?.trim()) {
      send({ type: 'error', message: 'Anthropic API key not configured. Check your .env file.' })
      return
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const gmailQuery = gmailToken ? buildGmailQuery(message) : null

    // ── Phase 1: parallel — DB fetch + Gmail preview (with AbortController) ─
    // We use an AbortController so Gmail fetch calls are actually cancelled when
    // the 6s deadline fires, rather than silently continuing in the background.
    const gmailAbort  = new AbortController()
    const gmailTimer  = setTimeout(() => gmailAbort.abort(), 6_000)

    const [[{ data: applications }, { data: receipts }], previewEmails] = await Promise.all([
      // DB queries (always fast)
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
      // Gmail fetch — aborts after 6s so Claude starts within ~7s total
      gmailToken
        ? (async () => {
            try {
              const ids    = await searchGmailIds(gmailToken, gmailQuery, 30, gmailAbort.signal)
              const emails = await Promise.all(
                ids.map(m => fetchEmailMeta(gmailToken, m.id, gmailAbort.signal))
              )
              return emails.filter(Boolean)
            } catch {
              return []   // aborted or network error — proceed without Gmail data
            } finally {
              clearTimeout(gmailTimer)
            }
          })()
        : Promise.resolve([]),
    ])

    clearTimeout(gmailTimer)   // no-op if already cleared, safe to call twice

    // ── Build context and stream Claude response ─────────────────────────────
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

    // 45-second hard timeout on the Anthropic call — surfaces errors fast
    const stream = await client.messages.create(
      {
        model:      'claude-sonnet-4-5',
        max_tokens: 4096,
        system:     systemPrompt,
        messages,
        stream:     true,
      },
      { timeout: 45_000 },
    )

    // Buffer full text so we can detect [TABLE_READY] after streaming
    let fullText = ''
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        fullText += chunk.delta.text
        send({ type: 'delta', text: chunk.delta.text })
      }
    }

    // ── Send already-fetched emails when table is finalised ─────────────────
    if (fullText.includes('[TABLE_READY]') && previewEmails.length > 0) {
      send({
        type:    'emails',
        data:    previewEmails,
        query:   gmailQuery,
        total:   previewEmails.length,
        columns: GMAIL_TABLE_COLUMNS,
        rows:    emailsToRows(previewEmails),
      })
    }

    send({ type: 'done' })
  } catch (err) {
    console.error('[chat] error:', err.message)
    send({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
})

export default router
