// Keyword-based email classifier. Swap the body for a Claude API call when ready.

const STAGE_KEYWORDS = {
  Offer: ['offer letter', 'pleased to offer', 'job offer', 'compensation package'],
  Rejected: ['not moving forward', 'not selected', 'position has been filled', 'other candidates'],
  Onsite: ['on-site', 'onsite', 'final round', 'in-person interview'],
  Technical: ['technical interview', 'coding challenge', 'take-home', 'technical screen'],
  'Phone Screen': ['phone screen', 'introductory call', 'recruiter call', 'quick chat'],
}

/**
 * Infers stage and company from raw email text.
 * @param {string} subject
 * @param {string} body
 * @param {string} senderDomain  e.g. "google.com"
 * @returns {{ company: string|null, stage: string }}
 */
export function parseEmail({ subject = '', body = '', senderDomain = '' }) {
  const text = `${subject} ${body}`.toLowerCase()

  let stage = 'Applied'
  for (const [stageName, keywords] of Object.entries(STAGE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      stage = stageName
      break
    }
  }

  const company = senderDomain
    ? senderDomain.split('.')[0].replace(/^(mail|jobs|careers|noreply)/i, '').trim() || null
    : null

  return { company, stage }
}
