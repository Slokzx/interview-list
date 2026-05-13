import Anthropic from '@anthropic-ai/sdk'
import { makeGmailFetcher } from '../lib/gmailAuth.js'

const client = new Anthropic()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Broad set — false negative (missed receipt) is worse than false positive (extra Claude call).
// Checked against BOTH subject AND the snippet (first ~100 chars of body) from the metadata response.
const RECEIPT_RE = /receipt|invoice|order|payment|purchase|charg|transaction|refund|billing|subscri|renew|statement|confirm(?:ation)?|booking|reservation|deliver|ship(?:ment|ped|ping)|tracking|your\s+bill|amount\s+due|total\s+(due|paid|charged)|thank\s+you\s+for\s+(your\s+)?(order|purchase)|we\s+received|account\s+statement|credit|debit|\$[\d,]+\.?\d*|paid\s+[\$€£]|charged\s+[\$€£]|billed|auto.?pay|due\s+date|minimum\s+payment|balance\s+due|payment\s+received|payment\s+processed|your\s+.*\s+has\s+shipped|order\s+has\s+been|funds\s+transfer/i

function looksLikeReceipt(subject, snippet = '') {
  return RECEIPT_RE.test(subject) || RECEIPT_RE.test(snippet)
}

function decodeBase64url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf-8')
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64url(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64url(part.body.data)
      }
    }
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }
  return ''
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

async function parseReceiptWithClaude(emailData) {
  const prompt = `Extract receipt/purchase information from this email.

From: ${emailData.from}
Subject: ${emailData.subject}
Date: ${emailData.date}
Body:
${emailData.body.slice(0, 2500)}

Return ONLY valid JSON with no markdown or extra text:
{
  "company": "merchant or company name (required)",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "Travel|Food|Software|Shopping|Subscription|Entertainment|Accommodation|Equipment|Other",
  "description": "one-line description of what was purchased"
}

Rules:
- Extract the total amount charged (final amount including tax, not per-item)
- If multiple amounts, use the final/total
- Use the purchase/charge date, not the email date
- If not a receipt or purchase confirmation, still return the JSON with best guesses from context
- amount must be a number or null`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].text.trim()
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(text)
}

function gmailDateStr(date) {
  const d = new Date(date)
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}`
}

export async function fetchAndParseReceiptEmails(token, existingMessageIds = new Set(), onProgress, onBatch, refreshToken, afterDate = null) {
  const { gmailFetch } = makeGmailFetcher(token, refreshToken)

  // Try label first. Fall back to a broad receipt keyword search if not found.
  onProgress?.('Looking up "Receipts" label…')
  const { labels = [] } = await gmailFetch('/labels')
  const receiptsLabel = labels.find(l => l.name.toLowerCase() === 'receipts')

  if (afterDate) {
    onProgress?.(`Incremental sync — fetching receipts after ${gmailDateStr(afterDate)}…`)
  }

  const allMessages = []
  let pageToken = null

  if (receiptsLabel) {
    // ── Label mode ────────────────────────────────────────────────────────
    do {
      const params = new URLSearchParams({ maxResults: 500 })
      params.append('labelIds', receiptsLabel.id)
      if (afterDate) params.set('q', `after:${gmailDateStr(afterDate)}`)
      if (pageToken) params.set('pageToken', pageToken)
      const { messages = [], nextPageToken } = await gmailFetch(`/messages?${params}`)
      allMessages.push(...messages)
      pageToken = nextPageToken
      onProgress?.(`Found ${allMessages.length} emails in "Receipts" label…`)
    } while (pageToken)
  } else {
    // ── Keyword search mode (no label required) ───────────────────────────
    onProgress?.('No "Receipts" label found — scanning all mail for receipts and invoices…')
    const dateFilter = afterDate ? ` after:${gmailDateStr(afterDate)}` : ''
    const q = `(subject:(receipt OR invoice OR order OR payment OR purchase OR "order confirmation" OR "payment confirmation" OR "your receipt" OR "billing statement") OR from:(receipts OR billing OR invoice OR noreply OR orders OR payments OR donotreply))${dateFilter}`
    do {
      const params = new URLSearchParams({ maxResults: 500, q })
      if (pageToken) params.set('pageToken', pageToken)
      const { messages = [], nextPageToken } = await gmailFetch(`/messages?${params}`)
      allMessages.push(...messages)
      pageToken = nextPageToken
      onProgress?.(`Found ${allMessages.length} matching emails…`)
    } while (pageToken)
  }

  if (allMessages.length === 0) throw new Error('No receipt-related emails found.')

  const newMessages = allMessages.filter(m => !existingMessageIds.has(m.id))
  if (newMessages.length === 0) return 0

  onProgress?.(`${newMessages.length} emails to check (${allMessages.length - newMessages.length} already synced)…`)

  // Process in batches: cheap metadata scan first, only Claude for receipt-like subjects
  const META_CONCURRENT = 20   // metadata = 1 quota unit each, can go wide
  const FULL_CONCURRENT  = 5   // full body = 5 quota units each
  const PAUSE_MS         = 200

  let totalSaved   = 0
  let claudeCalls  = 0
  let skippedCount = 0
  let fullParsed   = 0

  for (let i = 0; i < newMessages.length; i += META_CONCURRENT) {
    const metaSlice = newMessages.slice(i, i + META_CONCURRENT)

    // --- Phase 1: metadata fetch (subject + from + date, no body) ---
    const metaMsgs = await Promise.all(
      metaSlice.map(({ id }) =>
        gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)
      )
    )

    const toProcess = []   // will get full body + Claude
    const skipBatch = []   // not receipt-like — save immediately, never retried

    for (const msg of metaMsgs) {
      const headers = msg.payload?.headers ?? []
      const subject = getHeader(headers, 'Subject') || '(no subject)'
      const snippet = (msg.snippet ?? '').replace(/&#\d+;|&\w+;/g, ' ')  // decode HTML entities

      if (looksLikeReceipt(subject, snippet)) {
        toProcess.push({ ...msg, _subject: subject })
      } else {
        skippedCount++
        skipBatch.push({
          gmail_message_id: msg.id,
          company:     '__none__',
          amount:      null,
          date:        null,
          category:    'Other',
          description: subject,
          notes:       `Gmail: ${subject}`,
        })
      }
    }

    // Save non-receipts immediately (no Claude used)
    if (skipBatch.length > 0) {
      await onBatch?.(skipBatch)
      totalSaved += skipBatch.length
    }

    // --- Phase 2: full body + Claude only for receipt-like emails ---
    for (let j = 0; j < toProcess.length; j += FULL_CONCURRENT) {
      const fullSlice = toProcess.slice(j, j + FULL_CONCURRENT)

      const fullMessages = await Promise.all(
        fullSlice.map(({ id }) => gmailFetch(`/messages/${id}?format=full`))
      )

      const batchParsed = []

      for (const msg of fullMessages) {
        fullParsed++
        let receipt = null
        let subject = '(no subject)'

        try {
          const headers = msg.payload?.headers ?? []
          subject = getHeader(headers, 'Subject') || '(no subject)'
          const emailData = {
            id:   msg.id,
            from: getHeader(headers, 'From'),
            subject,
            date: getHeader(headers, 'Date'),
            body: extractBody(msg.payload),
          }

          onProgress?.(
            `AI parsing ${fullParsed} receipt emails (${claudeCalls} done, ${skippedCount} skipped without AI): ${subject.slice(0, 45)}…`
          )

          try {
            receipt = await parseReceiptWithClaude(emailData)
            claudeCalls++
          } catch {
            // Claude failed — null company means retry next sync
          }
        } catch {
          // Gmail body fetch failed — still record ID
        }

        batchParsed.push({
          gmail_message_id: msg.id,
          company:     receipt?.company     ?? null,
          amount:      receipt?.amount      ?? null,
          date:        receipt?.date        ?? null,
          category:    receipt?.category    ?? 'Other',
          description: receipt?.description ?? subject,
          notes:       `Gmail: ${subject}`,
        })
      }

      await onBatch?.(batchParsed)
      totalSaved += batchParsed.length

      if (j + FULL_CONCURRENT < toProcess.length) await sleep(PAUSE_MS)
    }

    const checkedSoFar = Math.min(i + META_CONCURRENT, newMessages.length)
    onProgress?.(`Checked ${checkedSoFar}/${newMessages.length} — ${claudeCalls} AI calls, ${skippedCount} skipped…`)

    if (i + META_CONCURRENT < newMessages.length) await sleep(PAUSE_MS)
  }

  return totalSaved
}
