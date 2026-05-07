import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function classifyCompany({ domain, isAts, emails }) {
  // Send up to 15 emails — enough context, low token cost
  const sample = emails.slice(0, 15)

  const emailsText = sample
    .map((e) => `Date: ${e.date}\nFrom: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.snippet}`)
    .join('\n---\n')

  const domainContext = isAts
    ? `These emails are sent via an ATS platform (${domain}). Extract the REAL company name from the email content — it will appear in the subject line or body (e.g. "Your application to Stripe", "Google - Application Received").`
    : `Sender domain: ${domain}`

  const prompt = `You are extracting structured job application data from emails.
${domainContext}

Emails (oldest first):
${emailsText}

Return ONLY valid JSON with no markdown or extra text:
{
  "company_name": "string",
  "role": "job title or null",
  "recruiter_name": "first and last name or null",
  "recruiter_email": "recruiter's email address or null",
  "stage": "Applied|Phone Screen|Technical|Onsite|Offer|Rejected",
  "applied_date": "ISO 8601 date of earliest application email",
  "first_recruiter_call_date": "ISO 8601 date of first scheduling/phone screen email or null",
  "interview_count": 0
}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].text.trim()
  // Strip markdown code fences if Claude adds them despite instructions
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim()
  return JSON.parse(text)
}
