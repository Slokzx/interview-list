import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()
const client = new Anthropic()

const SYSTEM_PROMPT = `You are an Email Research and Intelligence Agent.

Your job is to analyze a user's email corpus and transform unstructured email conversations into structured research outputs.

The user may ask arbitrary research questions such as:
- "Show all companies I interviewed with in the last 2 years."
- "Create a table of every subscription I pay for."
- "List all flights I booked in 2025."
- "Show all investors I spoke with."
- "Find every conversation related to AI agents."
- "Track all unresolved customer complaints."
- "Show all receipts above $500."
- "Create a timeline of immigration-related emails."
- "List all recruiters who ghosted me."
- "Find all emails mentioning layoffs."
- "Show all networking contacts from conferences."
- "Summarize all discussions about compensation."
- "Create a table of apartment hunting conversations."

You are NOT limited to predefined schemas.

Your responsibility is to:
1. Understand the research intent
2. Search relevant emails from the corpus provided
3. Extract structured entities/events
4. Infer the best possible schema
5. Generate accurate tables and summaries

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

// Build a rich data context from the user's stored email data
// ~4 chars per token; leave ~25K tokens for system prompt + user message + response
const MAX_CONTEXT_CHARS = 600_000   // ≈ 150K tokens — safe under 200K model limit
const MAX_EMAILS_PER_APP = 5        // most recent N email subjects per company

function buildContext(applications, receipts) {
  const apps = Array.isArray(applications) ? applications : []
  const rcts = Array.isArray(receipts)     ? receipts     : []

  const lines = []
  let charBudget = MAX_CONTEXT_CHARS

  const push = (...strs) => {
    for (const s of strs) {
      lines.push(s)
      charBudget -= s.length + 1  // +1 for newline
    }
  }

  // ── Applications / job emails ─────────────────────────────────────────
  push('== JOB APPLICATION EMAIL CORPUS ==', `Total companies: ${apps.length}`, '')

  let appsIncluded = 0
  for (const app of apps) {
    if (charBudget <= 0) {
      push(`[... ${apps.length - appsIncluded} more companies omitted — token budget reached ...]`)
      break
    }

    const emails = Array.isArray(app.raw_emails) ? app.raw_emails : []
    const recent = emails.slice(-MAX_EMAILS_PER_APP) // newest N

    const chunk = [
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
    ]

    push(...chunk)
    appsIncluded++
  }

  // ── Receipts / financial emails ───────────────────────────────────────
  push('== RECEIPT / EXPENSE EMAIL CORPUS ==', `Total receipts: ${rcts.length}`, '')

  for (const r of rcts) {
    if (charBudget <= 0) {
      push('[... more receipts omitted — token budget reached ...]')
      break
    }
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

router.post('/', async (req, res) => {
  const { message, history = [], userId } = req.body
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

    // Fetch full email data — agent needs subjects, senders, and dates to research
    const [{ data: applications = [] }, { data: receipts = [] }] = await Promise.all([
      supabase.from('applications')
        .select('company, company_domain, role, stage, recruiter_name, recruiter_email, industry, company_size, applied_date, last_email_date, email_count, interview_count, raw_emails')
        .eq('user_id', userId),
      supabase.from('receipts')
        .select('company, amount, date, category, description')
        .eq('user_id', userId)
        .not('company', 'is', null)
        .neq('company', '__none__'),
    ])

    const context = buildContext(applications, receipts)

    const systemPrompt = `${SYSTEM_PROMPT}

────────────────────────────
USER'S EMAIL CORPUS
────────────────────────────

${context}`

    const messages = [
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: message },
    ]

    // Use Sonnet for complex analysis tasks
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
