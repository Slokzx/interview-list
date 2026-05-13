import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { fetchJobEmails, groupByDomain } from '../services/gmailSync.js'
import { classifyCompany } from '../services/claudeClassifier.js'

const router = Router()

// Simple in-process lock — prevents a user from running two syncs concurrently.
// In a multi-instance deployment swap this for a short-lived DB flag.
const syncInFlight = new Set()

// Pull the first email address found in any From header across the group's emails
function extractEmail(emails) {
  for (const email of emails) {
    const match = (email.from ?? '').match(/<([^>]+)>/) || (email.from ?? '').match(/([^\s]+@[^\s]+)/)
    if (match) return match[1].trim().toLowerCase()
  }
  return null
}

router.post('/', async (req, res) => {
  const { gmailToken, gmailRefreshToken, userId } = req.body
  if (!gmailToken || !userId) {
    return res.status(400).json({ error: 'gmailToken and userId required' })
  }

  if (syncInFlight.has(userId)) {
    return res.status(409).json({ error: 'Sync already in progress for this account.' })
  }
  syncInFlight.add(userId)

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
    // ── Load existing records ──────────────────────────────────────────────
    send({ step: 'fetching', message: 'Loading existing records…' })
    const { data: existing = [] } = await supabase
      .from('applications')
      .select('id, company_domain, last_email_date')
      .eq('user_id', userId)

    const existingMap = new Map(existing.map((r) => [r.company_domain, r]))

    // ── Compute afterDate for incremental sync ─────────────────────────────
    // Find the newest email date across all existing records.
    // Back off 7 days to catch edge-cases (timezone drift, late-arriving emails).
    // New users: cap to last 24 months so first sync doesn't drown in old mail.
    const MONTHS_FOR_NEW_USER = 24
    const SAFETY_BUFFER_DAYS  = 7

    let afterDate
    if (existing.length === 0) {
      // Brand-new user — scan only the last 24 months
      afterDate = new Date(Date.now() - MONTHS_FOR_NEW_USER * 30 * 86_400_000)
      send({ step: 'fetching', message: `New account — scanning last ${MONTHS_FOR_NEW_USER} months of email…` })
    } else {
      // Returning user — find newest stored email date, back off 7 days
      const maxTs = existing.reduce((max, r) => {
        if (!r.last_email_date) return max
        const t = new Date(r.last_email_date).getTime()
        return t > max ? t : max
      }, 0)
      afterDate = maxTs > 0
        ? new Date(maxTs - SAFETY_BUFFER_DAYS * 86_400_000)
        : new Date(Date.now() - MONTHS_FOR_NEW_USER * 30 * 86_400_000)
      send({ step: 'fetching', message: `Incremental sync — checking emails since ${afterDate.toLocaleDateString()}…` })
    }

    // ── Fetch only new emails from Gmail ──────────────────────────────────
    send({ step: 'fetching', message: 'Connecting to Gmail…' })
    const emails = await fetchJobEmails(
      gmailToken,
      (msg) => send({ step: 'fetching', message: msg }),
      gmailRefreshToken,
      afterDate,
    )
    send({ step: 'fetching', message: `Found ${emails.length} job-related emails in window.` })

    if (emails.length === 0) {
      send({ step: 'done', message: 'Already up to date — no new emails since last sync.', saved: 0, skipped: 0 })
      return
    }

    const groups = groupByDomain(emails)
    send({ step: 'analyzing', message: `Grouped into ${groups.length} companies. Analyzing with Claude…` })

    let saved = 0
    let unchanged = 0
    let skipped = 0
    let firstError = null

    for (const group of groups) {
      try {
        const existingRecord = existingMap.get(group.domain)

        // ── Skip Claude if no new emails since last stored date ────────────
        if (existingRecord?.last_email_date) {
          const storedTs  = new Date(existingRecord.last_email_date).getTime()
          const newestTs  = new Date(group.emails[group.emails.length - 1].date).getTime()
          if (newestTs <= storedTs) {
            unchanged++
            send({ step: 'saving', message: `Unchanged: ${group.domain}`, saved, total: groups.length })
            continue
          }
        }

        const data = await classifyCompany(group)

        const lastEmail     = group.emails[group.emails.length - 1]
        const lastEmailDate = lastEmail?.date ? new Date(lastEmail.date).toISOString() : null
        const recruiterEmail = extractEmail(group.emails)

        const record = {
          company:                   data.company_name,
          role:                      data.role ?? 'Unknown Role',
          stage:                     data.stage ?? 'Applied',
          recruiter_name:            data.recruiter_name ?? null,
          recruiter_email:           recruiterEmail,
          company_domain:            group.domain,
          applied_date:              data.applied_date ?? null,
          first_recruiter_call_date: data.first_recruiter_call_date ?? null,
          interview_count:           data.interview_count ?? 0,
          email_count:               group.emails.length,
          raw_emails:                group.emails.slice(0, 50),
          last_email_date:           lastEmailDate,
          last_synced_at:            new Date().toISOString(),
        }

        const existingId = existingRecord?.id

        const { error: saveError } = existingId
          ? await supabase.from('applications').update(record).eq('id', existingId)
          : await supabase.from('applications').insert({ ...record, user_id: userId })

        if (saveError) {
          firstError = saveError.message
          throw new Error(saveError.message)
        }

        saved++
        send({
          step: 'saving',
          message: `Saved ${saved}/${groups.length}: ${data.company_name}`,
          saved,
          total: groups.length,
        })
      } catch (err) {
        skipped++
        send({ step: 'warning', message: `Skipped ${group.domain}: ${err.message}` })
      }
    }

    if (saved === 0 && skipped > 0 && firstError) {
      send({ step: 'error', message: `Nothing was saved. DB error: ${firstError}. Have you run migration_001.sql in Supabase?` })
    } else {
      const unchangedNote = unchanged > 0 ? `, ${unchanged} already up to date` : ''
      send({ step: 'done', message: `Sync complete — ${saved} companies updated${unchangedNote}.`, saved, skipped })
    }
  } catch (err) {
    send({ step: 'error', message: err.message })
  } finally {
    syncInFlight.delete(userId)
    res.end()
  }
})

export default router
