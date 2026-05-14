import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { parse as parseEnv } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  searchGmailIds,
  fetchEmailMeta,
  emailsToRows,
  GMAIL_TABLE_COLUMNS,
} from '../services/gmailEmails.js'

const router = Router()

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

// ── Prompts ───────────────────────────────────────────────────────────────────

// Phase 1: clarify then signal readiness with embedded Gmail query
const CLARIFY_PROMPT = `You are an Email Research Agent. Help the user find specific emails by asking one clarifying question at a time.

Rules — follow exactly:
- Keep every response to 1–2 short sentences. No lists, no headers, no markdown.
- If the request is unclear, ask ONE clarifying question (date range, sender, or topic).
- After at most 2 rounds of questions, output ONLY this token on its own line (nothing else):
  [SEARCH_NOW:<gmail_query>]

How to write a TIGHT Gmail query — this is critical:
- Use very specific phrases that appear ONLY in that type of email (not generic words like "confirmation" alone — that matches interviews, payments, etc.)
- For flights: use "boarding pass" OR "flight itinerary" OR "e-ticket" OR from:(airline domains). Do NOT just use "flight" or "confirmation".
- For Amazon: use from:amazon.com — don't use "amazon" as a keyword, it will match too many things.
- For receipts: from:(stripe.com OR paypal.com OR shopify.com) OR "payment receipt" OR "your receipt"
- Use after:/before: for date ranges: after:2024/01/01
- When in doubt, prefer from: filters over subject keyword searches — they are far more precise.
- Always combine terms with AND or OR carefully so the query stays narrow.

Example ready turn (output ONLY this line, nothing else):
[SEARCH_NOW:"boarding pass" OR "flight itinerary" OR "e-ticket" OR from:(aa.com OR delta.com OR united.com OR southwest.com OR lufthansa.com OR emirates.com)]`

// ── Table name helper ─────────────────────────────────────────────────────────

function generateTableName(query) {
  if (!query) return `Research ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  const cleaned = query
    .replace(/^(can you |please |could you |get me |show me |find |fetch |list |give me |pull )/i, '')
    .replace(/^(all |the |my )/i, '')
    .trim()
  const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  return name.length > 60 ? name.slice(0, 60) + '…' : name
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
    const apiKey = resolveApiKey()
    if (!apiKey?.trim()) {
      send({ type: 'error', message: 'Anthropic API key not configured.' })
      return
    }

    // ── Phase 1: clarifying conversation ─────────────────────────────────────
    const claudeMessages = [
      ...history.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: message },
    ]

    const stream1 = await client.messages.create(
      { model: 'claude-haiku-4-5', max_tokens: 150, system: CLARIFY_PROMPT, messages: claudeMessages, stream: true },
      { timeout: 15_000 },
    )

    let phase1Text = ''
    for await (const chunk of stream1) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        phase1Text += chunk.delta.text
        // Stop sending deltas the moment [SEARCH_NOW starts accumulating —
        // the full marker [SEARCH_NOW:query] must never appear in the UI.
        if (!phase1Text.includes('[SEARCH_NOW')) {
          send({ type: 'delta', text: chunk.delta.text })
        }
      }
    }

    // ── Phase 2: if Claude is ready, fetch Gmail then confirm ────────────────
    const searchMatch = phase1Text.match(/\[SEARCH_NOW:([^\]]+)\]/)
    if (!searchMatch) {
      // Still in clarification mode — nothing else to do
      send({ type: 'done' })
      return
    }

    // Claude-generated Gmail query (much better than keyword extraction)
    const gmailQuery = searchMatch[1].trim()

    // If no Gmail token, tell the user — don't attempt a search
    if (!gmailToken) {
      send({ type: 'delta', text: "It looks like your Gmail connection has expired. Please sign out and sign back in with Google to reconnect your inbox." })
      send({ type: 'done' })
      return
    }

    // Signal frontend to show the "Searching your inbox…" spinner
    send({ type: 'fetching' })

    let emails = []
    if (gmailToken && gmailQuery) {
      try {
        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), 15_000)
        const ids   = await searchGmailIds(gmailToken, gmailQuery, 100, abort.signal)
        const raw   = await Promise.all(ids.map(m => fetchEmailMeta(gmailToken, m.id, abort.signal)))
        clearTimeout(timer)
        emails = raw.filter(Boolean)
      } catch (e) {
        console.error('[chat] gmail fetch error:', e.message)
      }
    }

    // ── Phase 2 Claude call: report count, offer table or suggest alternatives ─
    const sampleSubjects = emails.slice(0, 3).map(e => e.subject ?? '').filter(Boolean)

    // Give Claude the real data as the user message — prevents prompt leakage
    const phase2UserMsg = emails.length > 0
      ? `Search "${gmailQuery}" returned ${emails.length} emails. Samples: ${sampleSubjects.join(' | ')}. Write one sentence summarising what was found, then output [TABLE_READY] on its own line. Nothing after [TABLE_READY].`
      : `Search "${gmailQuery}" returned 0 results. Write one sentence saying nothing was found and suggest 1–2 better search terms. Do NOT output [TABLE_READY].`

    const stream2 = await client.messages.create(
      {
        model:      'claude-haiku-4-5',
        max_tokens: 120,
        system:     'You are a helpful email assistant. Follow the instruction in the user message exactly.',
        messages:   [{ role: 'user', content: phase2UserMsg }],
        stream:     true,
      },
      { timeout: 15_000 },
    )

    let phase2Text = ''
    for await (const chunk of stream2) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        phase2Text += chunk.delta.text
        const textToSend = chunk.delta.text.replace('[TABLE_READY]', '')
        if (textToSend) send({ type: 'delta', text: textToSend })
      }
    }

    // ── If TABLE_READY in Phase 2: send table data ────────────────────────────
    if (phase2Text.includes('[TABLE_READY]') && emails.length > 0) {
      const firstUserMsg = history.find(m => m.role === 'user')?.content ?? message
      send({
        type:        'table_ready',
        rows:        emailsToRows(emails),
        columns:     GMAIL_TABLE_COLUMNS,
        defaultName: generateTableName(firstUserMsg),
        query:       firstUserMsg,
        gmailQuery:  gmailQuery ?? null,
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
