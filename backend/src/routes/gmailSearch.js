/**
 * POST /api/gmail-search
 * Re-run a Gmail search and return email metadata.
 * Used by the Research Table "Sync" button to refresh table data.
 */
import { Router } from 'express'
import { searchGmailIds, fetchEmailMetaBatch, emailsToRows, GMAIL_TABLE_COLUMNS } from '../services/gmailEmails.js'

const router = Router()

router.post('/', async (req, res) => {
  const { query, gmailToken, maxResults = 200 } = req.body
  if (!query || !gmailToken) {
    return res.status(400).json({ error: 'query and gmailToken required' })
  }

  try {
    const ids    = await searchGmailIds(gmailToken, query, Math.min(maxResults, 500))
    const emails = await fetchEmailMetaBatch(gmailToken, ids.slice(0, maxResults), 20)
    const rows   = emailsToRows(emails)

    res.json({
      total:   ids.length,       // total matching (may be > maxResults)
      fetched: emails.length,
      columns: GMAIL_TABLE_COLUMNS,
      rows,
      query,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
