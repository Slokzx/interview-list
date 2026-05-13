import axios from 'axios'
import { supabase } from './supabase'

// In dev, Vite proxies /api → localhost:3001 (no env var needed).
// In production, set VITE_API_URL=https://your-backend.railway.app
const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'

const api = axios.create({ baseURL: BASE })

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

export const getResearch = () => api.get('/research')
export const createResearch = (data) => api.post('/research', data)
export const updateResearch = (id, data) => api.patch(`/research/${id}`, data)
export const deleteResearch = (id) => api.delete(`/research/${id}`)

export const getReceipts = () => api.get('/receipts')
export const createReceipt = (data) => api.post('/receipts', data)
export const updateReceipt = (id, data) => api.patch(`/receipts/${id}`, data)
export const deleteReceipt = (id) => api.delete(`/receipts/${id}`)

export async function syncReceiptEmails({ gmailToken, gmailRefreshToken, userId, accessToken, onEvent }) {
  const res = await fetch(`${BASE}/sync-receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ gmailToken, gmailRefreshToken, userId }),
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

export async function backfillRecruiterEmails({ userId, accessToken }) {
  const res = await fetch(`${BASE}/enrich/backfill-recruiter`, {
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
  const res = await fetch(`${BASE}/enrich`, {
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

export async function syncEmails({ gmailToken, gmailRefreshToken, userId, accessToken, onEvent }) {
  const res = await fetch(`${BASE}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ gmailToken, gmailRefreshToken, userId }),
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

export async function sendChatMessage({ message, history, userId, accessToken, gmailToken, onDelta }) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message, history, userId, gmailToken }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`)

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
      if (event.type === 'delta') onDelta(event.text)
      if (event.type === 'error') throw new Error(event.message)
    }
  }
}
