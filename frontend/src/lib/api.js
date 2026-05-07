import axios from 'axios'
import { supabase } from './supabase'

const api = axios.create({ baseURL: '/api' })

// Attach Supabase JWT to every request automatically
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

export const getApplications = () => api.get('/applications')
export const createApplication = (data) => api.post('/applications', data)
export const updateApplication = (id, data) => api.patch(`/applications/${id}`, data)
export const deleteApplication = (id) => api.delete(`/applications/${id}`)
export const parseEmail = (emailText) => api.post('/parse-email', { emailText })

export async function backfillRecruiterEmails({ userId, accessToken }) {
  const res = await fetch('/api/enrich/backfill-recruiter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) return
  return res.json()
}

export async function enrichCompanies({ userId, accessToken, onEvent }) {
  const res = await fetch('/api/enrich', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ userId }),
  })

  if (!res.ok) throw new Error(`Enrich failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const event = JSON.parse(line.slice(6))
      onEvent(event)
      if (event.step === 'error') throw new Error(event.message)
    }
  }
}

export async function syncEmails({ gmailToken, userId, accessToken, onEvent }) {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ gmailToken, userId }),
  })

  if (!res.ok) throw new Error(`Sync failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const event = JSON.parse(line.slice(6))
      onEvent(event)
      if (event.step === 'error') throw new Error(event.message)
    }
  }
}
