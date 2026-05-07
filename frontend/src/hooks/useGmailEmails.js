import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const META_PARAMS = 'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date'
const PAGE_SIZE = 50

function parseHeaders(headers = []) {
  const get = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  return {
    subject: get('Subject') || '(no subject)',
    from:    get('From'),
    date:    get('Date'),
  }
}

function decodeSnippet(str = '') {
  const el = document.createElement('textarea')
  el.innerHTML = str
  return el.value
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.provider_token
  if (!token) throw new Error('No Gmail token — please sign out and sign in again.')
  return token
}

async function fetchMessageMetadata(id, token) {
  const res = await fetch(`${GMAIL}/messages/${id}?${META_PARAMS}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

/**
 * @param {'ALL'|'INBOX'|'SENT'|'TRASH'|string} labelId  — pass a Gmail label ID
 */
export function useGmailEmails(labelId = 'ALL') {
  const [emails, setEmails]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState(null)
  const [nextPageToken, setNextPage]  = useState(null)
  const [userLabels, setUserLabels]   = useState([])
  const activeLabel = useRef(labelId)

  // Build query params for messages.list
  function listParams(pageToken) {
    const params = new URLSearchParams({ maxResults: PAGE_SIZE })
    if (activeLabel.current === 'ALL') {
      params.set('q', '-in:spam -in:draft')
    } else {
      params.append('labelIds', activeLabel.current)
    }
    if (pageToken) params.set('pageToken', pageToken)
    return params.toString()
  }

  async function loadPage(pageToken = null, append = false) {
    append ? setLoadingMore(true) : setLoading(true)
    setError(null)
    try {
      const token = await getToken()

      const listRes = await fetch(`${GMAIL}/messages?${listParams(pageToken)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!listRes.ok) throw new Error(`Gmail list error ${listRes.status}`)
      const { messages = [], nextPageToken: npt } = await listRes.json()

      setNextPage(npt ?? null)

      if (!messages.length) {
        if (!append) setEmails([])
        return
      }

      const details = await Promise.all(messages.map(({ id }) => fetchMessageMetadata(id, token)))
      const parsed = details.map((msg) => ({
        id:      msg.id,
        snippet: decodeSnippet(msg.snippet),
        ...parseHeaders(msg.payload?.headers),
      }))

      setEmails((prev) => append ? [...prev, ...parsed] : parsed)
    } catch (err) {
      setError(err.message)
    } finally {
      append ? setLoadingMore(false) : setLoading(false)
    }
  }

  // Fetch user-defined labels once on mount
  useEffect(() => {
    getToken().then((token) =>
      fetch(`${GMAIL}/labels`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(({ labels = [] }) => {
          // only user-created labels (type === 'user')
          setUserLabels(labels.filter((l) => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name)))
        })
    ).catch(() => {})
  }, [])

  const changeLabel = useCallback((newLabel) => {
    activeLabel.current = newLabel
    setEmails([])
    setNextPage(null)
    loadPage(null, false)
  }, [])

  useEffect(() => {
    loadPage(null, false)
  }, [])

  return {
    emails,
    loading,
    loadingMore,
    error,
    hasMore: !!nextPageToken,
    loadMore: () => loadPage(nextPageToken, true),
    userLabels,
    changeLabel,
  }
}
