import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { fetchJobEmails, groupByDomain } from '../services/gmailSync.js'
import { classifyCompany } from '../services/claudeClassifier.js'

const router = Router()

// Pull the first email address found in any From header across the group's emails
function extractEmail(emails) {
  for (const email of emails) {
    const match = (email.from ?? '').match(/<([^>]+)>/) || (email.from ?? '').match(/([^\s]+@[^\s]+)/)
    if (match) return match[1].trim().toLowerCase()
  }
  return null
}

router.post('/', async (req, res) => {
  const { gmailToken, userId } = req.body
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
    const emails = await fetchJobEmails(gmailToken, (msg) =>
      send({ step: 'fetching', message: msg })
    )
    send({ step: 'fetching', message: `Found ${emails.length} job-related emails.` })

    const groups = groupByDomain(emails)
    send({ step: 'analyzing', message: `Grouped into ${groups.length} companies. Analyzing with Claude…` })

    // Load existing domains for this user so we can update instead of insert
    const { data: existing = [] } = await supabase
      .from('applications')
      .select('id, company_domain')
      .eq('user_id', userId)

    const existingMap = new Map(existing.map((r) => [r.company_domain, r.id]))

    let saved = 0
    let skipped = 0
    let firstError = null

    for (const group of groups) {
      try {
        const data = await classifyCompany(group)

        const lastEmail = group.emails[group.emails.length - 1]
        const lastEmailDate = lastEmail?.date ? new Date(lastEmail.date).toISOString() : null

        // Extract recruiter email directly from From header — more reliable than asking Claude
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

        const existingId = existingMap.get(group.domain)

        const { error: saveError } = existingId
          ? await supabase.from('applications').update(record).eq('id', existingId)
          : await supabase.from('applications').insert({ ...record, user_id: userId })

        if (saveError) {
          // Surface the first DB error prominently so it's not hidden
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
      send({ step: 'done', message: `Sync complete — ${saved} companies saved.`, saved, skipped })
    }
  } catch (err) {
    send({ step: 'error', message: err.message })
  } finally {
    res.end()
  }
})

export default router
