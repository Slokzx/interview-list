import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()
const claude = new Anthropic()

async function enrichCompany(name, domain) {
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `You are a company data enrichment service. Based on your training knowledge, return structured data for this company.

Company name: ${name}
Domain: ${domain}

Return ONLY valid JSON, no markdown:
{
  "industry": "primary industry or sector (e.g. 'Fintech', 'Healthcare', 'Enterprise SaaS', 'E-commerce', 'AI/ML', 'Gaming', 'Cybersecurity') or null if unknown",
  "company_size": "headcount range and/or stage (e.g. '10,000+ employees', '500–2,000 employees, Series C', 'Startup <50 employees') or null if unknown"
}`,
    }],
  })

  const raw = response.content[0].text.trim()
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(text)
}

router.post('/', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

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
    const { data: companies, error } = await supabase
      .from('applications')
      .select('id, company, company_domain')
      .eq('user_id', userId)

    if (error) throw new Error(error.message)

    send({ step: 'start', message: `Enriching ${companies.length} companies…`, total: companies.length })

    let done = 0
    let failed = 0

    for (const co of companies) {
      try {
        const enriched = await enrichCompany(co.company, co.company_domain)

        const update = {}
        if (enriched.industry)    update.industry     = enriched.industry
        if (enriched.company_size) update.company_size = enriched.company_size

        if (Object.keys(update).length > 0) {
          const { error: saveError } = await supabase
            .from('applications')
            .update(update)
            .eq('id', co.id)
          if (saveError) throw new Error(saveError.message)
        }

        done++
        send({
          step: 'progress',
          message: `${done}/${companies.length}: ${co.company}`,
          done,
          total: companies.length,
          id: co.id,
          industry: enriched.industry,
          company_size: enriched.company_size,
        })
      } catch (err) {
        failed++
        send({ step: 'warning', message: `Skipped ${co.company}: ${err.message}` })
      }
    }

    send({ step: 'done', message: `Enriched ${done} companies.${failed ? ` ${failed} skipped.` : ''}`, done, failed })
  } catch (err) {
    send({ step: 'error', message: err.message })
  } finally {
    res.end()
  }
})

// Backfill recruiter_email from already-stored raw_emails — no re-sync needed
router.post('/backfill-recruiter', async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: rows, error } = await supabase
    .from('applications')
    .select('id, raw_emails')
    .eq('user_id', userId)
    .is('recruiter_email', null)

  if (error) return res.status(500).json({ error: error.message })

  let updated = 0
  for (const row of rows) {
    const emails = Array.isArray(row.raw_emails) ? row.raw_emails : []
    const email = extractRecruiterEmail(emails)
    if (!email) continue

    await supabase
      .from('applications')
      .update({ recruiter_email: email })
      .eq('id', row.id)

    updated++
  }

  res.json({ updated, total: rows.length })
})

function extractRecruiterEmail(emails) {
  for (const email of emails) {
    const from = email.from ?? ''
    const angleMatch = from.match(/<([^>]+@[^>]+)>/)
    if (angleMatch) return angleMatch[1].trim().toLowerCase()
    const bareMatch = from.match(/([^\s]+@[^\s]+)/)
    if (bareMatch) return bareMatch[1].trim().toLowerCase()
  }
  return null
}

export default router
