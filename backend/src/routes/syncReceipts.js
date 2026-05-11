import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { fetchAndParseReceiptEmails } from '../services/receiptEmailParser.js'

const router = Router()

router.post('/', async (req, res) => {
  const { gmailToken, gmailRefreshToken, userId } = req.body
  if (!gmailToken || !userId) {
    return res.status(400).json({ error: 'gmailToken and userId required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    send({ step: 'fetching', message: 'Connecting to Gmail…' })

    // Load ALL already-processed message IDs (paginated past the 1000-row cap).
    // Skip emails where company IS SET (real company or '__none__' = intentionally skipped).
    // Re-process any email where company IS NULL (failed parse from a previous broken run).
    const PAGE = 1000
    let existingRaw = []
    let from = 0
    while (true) {
      const { data = [], error: qErr } = await supabase
        .from('receipts')
        .select('gmail_message_id')
        .eq('user_id', userId)
        .not('gmail_message_id', 'is', null)
        .not('company', 'is', null)
        .range(from, from + PAGE - 1)
      if (qErr) throw new Error(qErr.message)
      existingRaw.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }
    const existingIds = new Set(existingRaw.map(r => r.gmail_message_id))
    send({ step: 'fetching', message: `${existingIds.size} emails already processed, checking for new ones…` })

    let totalSaved = 0

    const saved = await fetchAndParseReceiptEmails(
      gmailToken,
      existingIds,
      (msg) => send({ step: 'fetching', message: msg }),
      async (batch) => {
        // Upsert without ignoreDuplicates so re-processed emails overwrite null data
        const { error } = await supabase
          .from('receipts')
          .upsert(batch.map(r => ({ ...r, user_id: userId })), {
            onConflict: 'gmail_message_id',
          })
        if (error) throw new Error(error.message)
        totalSaved += batch.length
        send({ step: 'saving', message: `Saved ${totalSaved} receipts so far…` })
      },
      gmailRefreshToken,
    )

    const totalScanned = existingIds.size + (typeof saved === 'number' ? saved : 0)
    if (saved === 0 && existingIds.size === 0) {
      send({ step: 'done', message: 'No receipts found to sync.', saved: 0 })
    } else if (saved === 0) {
      send({ step: 'done', message: `Already up to date — ${existingIds.size.toLocaleString()} emails already scanned.`, saved: 0 })
    } else {
      send({ step: 'done', message: `Synced ${saved.toLocaleString()} emails (${totalScanned.toLocaleString()} total scanned).`, saved })
    }
  } catch (err) {
    send({ step: 'error', message: err.message })
  } finally {
    res.end()
  }
})

export default router
