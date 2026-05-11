const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function refreshGmailToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const { access_token } = await res.json()
  return access_token
}

/**
 * Returns a gmailFetch function bound to a token that auto-refreshes on 401.
 * Mutates `state.token` so callers can read the refreshed token back.
 */
export function makeGmailFetcher(initialToken, refreshToken) {
  const state = { token: initialToken }

  async function gmailFetch(path, attempt = 0) {
    const res = await fetch(`${GMAIL}${path}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    })

    if (res.status === 401 && refreshToken && attempt === 0) {
      state.token = await refreshGmailToken(refreshToken)
      return gmailFetch(path, 1)
    }

    if (res.status === 429) {
      if (attempt >= 5) throw new Error(`Gmail rate limit exceeded after ${attempt} retries`)
      await sleep(Math.min(1000 * 2 ** attempt, 30000))
      return gmailFetch(path, attempt + 1)
    }

    if (!res.ok) throw new Error(`Gmail API ${res.status} on ${path}`)
    return res.json()
  }

  return { gmailFetch, state }
}
