import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import {
  searchGmailIds,
  fetchEmailMetaBatch,
  emailsToRows,
  GMAIL_TABLE_COLUMNS,
} from '../services/gmailEmails.js'

const router = Router()

// POST /api/gmail-stream
// Streams email batches for a table that was just created with a small initial dataset.
// Skips IDs already saved (existingIds), fetches the rest in batches of 10,
// appends to the table in Supabase incrementally.
router.post('/', async (req, res) => {
  const { query, gmailToken, tableId, userId, existingIds = [] } = req.body
  if (!query || !gmailToken || !tableId || !userId) {
    return res.status(400).json({ error: 'query, gmailToken, tableId, userId required' })
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

    // Get up to 500 IDs for this query
    const allIds = await searchGmailIds(gmailToken, query, 500)

    // Skip IDs we already have
    const skipSet = new Set(existingIds)
    const newIds  = allIds.filter(m => !skipSet.has(m.id))

    send({ type: 'total', count: newIds.length })

    if (newIds.length === 0) {
      send({ type: 'done', total: 0 })
      return res.end()
    }

    // Fetch and stream in batches of 10
    const BATCH = 10
    const allNewRows = []

    for (let i = 0; i < newIds.length; i += BATCH) {
      const batchIds = newIds.slice(i, i + BATCH)
      const emails   = await fetchEmailMetaBatch(gmailToken, batchIds, BATCH)
      const rows     = emailsToRows(emails)

      allNewRows.push(...rows)

      send({
        type:    'batch',
        rows,
        fetched: allNewRows.length,
        total:   newIds.length,
      })

      // Append to Supabase every 50 new rows (and on the final batch)
      const isLast = i + BATCH >= newIds.length
      if (allNewRows.length % 50 === 0 || isLast) {
        // Fetch current rows, merge, write back
        const { data: current } = await supabase
          .from('custom_tables')
          .select('rows')
          .eq('id', tableId)
          .eq('user_id', userId)
          .single()

        const existing = Array.isArray(current?.rows) ? current.rows : []

        // Deduplicate by _gmailId
        const merged = [...existing]
        const seenIds = new Set(existing.map(r => r._gmailId).filter(Boolean))
        for (const r of allNewRows) {
          if (!seenIds.has(r._gmailId)) {
            merged.push(r)
            seenIds.add(r._gmailId)
          }
        }

        await supabase
          .from('custom_tables')
          .update({
            rows:       merged,
            columns:    GMAIL_TABLE_COLUMNS,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tableId)
          .eq('user_id', userId)
      }
    }

    send({ type: 'done', total: allNewRows.length })
  } catch (err) {
    send({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
})

export default router
