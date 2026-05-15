import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendChatMessage } from '../lib/api'
import { useCustomTables } from '../contexts/CustomTablesContext'

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderContent(text) {
  // Strip [TABLE_READY] marker before rendering
  const cleaned = text.replaceAll('[TABLE_READY]', '').trimEnd()
  const blocks  = []
  const lines   = cleaned.split('\n')
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // Markdown table block
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines = []
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t.startsWith('|') && t.endsWith('|')) { tableLines.push(t); i++ }
        else break
      }
      if (tableLines.length >= 3) {
        const headers = tableLines[0].split('|').slice(1, -1).map(h => h.trim()).filter(Boolean)
        const dataRows = tableLines
          .slice(2)
          .filter(line => !/^\|[-:\s|]+\|$/.test(line))
          .map(line => line.split('|').slice(1, -1).map(c => c.trim()))
          .filter(row => row.some(c => c))
        blocks.push(
          <div key={`tbl-${blocks.length}`} className="overflow-x-auto my-3 rounded-lg border border-outline-variant/30">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr className="bg-primary-container/10">
                  {headers.map((h, j) => (
                    <th key={j} className="px-3 py-2 text-left text-on-surface font-semibold whitespace-nowrap border-b border-outline-variant/30 font-sans">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, j) => (
                  <tr key={j} className={`border-b border-outline-variant/10 hover:bg-primary-container/5 transition-colors ${j % 2 === 1 ? 'bg-surface-container-highest/5' : ''}`}>
                    {headers.map((_, k) => (
                      <td key={k} className="px-3 py-1.5 text-on-surface-variant font-sans">{row[k] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
      tableLines.forEach(tl => { blocks.push(<span key={`tl-${blocks.length}`}>{tl}<br /></span>) })
      continue
    }

    // Regular line with **bold** support
    const parts = lines[i].split(/(\*\*[^*]+\*\*)/)
    blocks.push(
      <span key={`ln-${blocks.length}`}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : p
        )}
        {i < lines.length - 1 && <br />}
      </span>
    )
    i++
  }

  return blocks
}

// ── Save-table prompt ─────────────────────────────────────────────────────────

function SaveTablePrompt({ defaultName, onSave, saving }) {
  const [name, setName] = useState(defaultName)

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(name) }
  }

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="glass-l1 border border-primary-container/30 rounded-2xl px-4 py-3.5 flex flex-col gap-3">
          <p className="text-xs font-sans text-outline/70 font-medium tracking-wide uppercase">Name your table</p>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Table name…"
            className="bg-transparent border-0 outline-none text-sm font-sans text-on-surface placeholder:text-outline/40 w-full"
          />
          <div className="flex justify-end">
            <button
              onClick={() => onSave(name)}
              disabled={!name.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container text-on-primary-container text-xs font-sans font-semibold hover:opacity-90 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {saving
                ? <span className="w-3 h-3 border-2 border-on-primary-container/30 border-t-on-primary-container rounded-full animate-spin" />
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>
              }
              Save Table
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Bubbles ───────────────────────────────────────────────────────────────────

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary-container text-on-primary-container text-sm font-sans leading-relaxed">
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ msg, isLast, streaming }) {
  const showDots     = isLast && streaming && !msg.content
  const showFetching = isLast && msg.fetching

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-primary-container/20 border border-primary-container/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 14 }}>auto_awesome</span>
      </div>
      <div className="flex-1 min-w-0 text-sm font-sans leading-relaxed text-on-surface pt-0.5">
        {msg.content && renderContent(msg.content)}

        {showDots && (
          <span className="flex gap-1 items-center h-5">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-1.5 h-1.5 rounded-full bg-outline/60 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}

        {showFetching && (
          <span className="flex items-center gap-2 mt-2 text-xs text-outline/60">
            <span className="w-3 h-3 border-2 border-outline/30 border-t-outline/70 rounded-full animate-spin shrink-0" />
            Fetching your emails…
          </span>
        )}
      </div>
    </div>
  )
}

// ── Suggestion chips shown on empty state ────────────────────────────────────

const SUGGESTIONS = [
  { icon: 'flight',         label: 'Flight bookings',       prompt: 'Find all my flight booking and boarding pass emails' },
  { icon: 'receipt_long',   label: 'Amazon orders',         prompt: 'Show me all my Amazon order confirmation emails' },
  { icon: 'work',           label: 'Recruiter emails',      prompt: 'Find emails from recruiters and hiring managers' },
  { icon: 'subscriptions',  label: 'Subscriptions',         prompt: 'Get all my subscription and renewal billing emails' },
  { icon: 'hotel',          label: 'Hotel bookings',        prompt: 'Find hotel reservation and booking confirmation emails' },
  { icon: 'local_shipping', label: 'Deliveries',            prompt: 'Show me shipping and delivery tracking emails' },
]

const SESSION_KEY = 'chat-messages'

// ── Main Chat component ───────────────────────────────────────────────────────

export default function Chat() {
  const [messages,     setMessages]     = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [streaming,    setStreaming]    = useState(false)
  const [error,        setError]        = useState(null)
  const [pendingTable, setPendingTable] = useState(null)
  const [saving,       setSaving]       = useState(false)
  const bottomRef                       = useRef(null)
  const textareaRef                     = useRef(null)
  const abortRef                        = useRef(null)

  const navigate                   = useNavigate()
  const { refetch: refetchTables } = useCustomTables()

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages)) } catch (_) { /* storage unavailable */ }
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async (text) => {
    const msg = (typeof text === 'string' ? text : input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    setPendingTable(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const snapshot = [...messages]
    setMessages(prev => [...prev,
      { role: 'user',      content: msg },
      { role: 'assistant', content: '' },
    ])
    setLoading(true)
    setStreaming(true)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const { data: { session } } = await supabase.auth.getSession()
      await sendChatMessage({
        message:     msg,
        history:     snapshot,
        userId:      session.user.id,
        accessToken: session.access_token,
        gmailToken:  session.provider_token ?? null,
        signal:      abort.signal,

        onDelta(chunk) {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              // Also clear fetching spinner when Phase 2 text starts arriving
              next[next.length - 1] = { ...last, content: last.content + chunk, fetching: false }
            }
            return next
          })
        },

        // Backend says it's now fetching emails — show spinner in bubble
        onFetching() {
          setStreaming(false)
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, fetching: true }
            }
            return next
          })
        },

        // Emails fetched — clear spinner, show save prompt
        onTableReady(payload) {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, fetching: false }
            }
            return next
          })
          setPendingTable(payload)
        },

        // Legacy redirect path (unused now but kept for safety)
        onRedirect(tableId) {
          refetchTables()
          navigate(`/research/${tableId}`, { state: { autoSync: true } })
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled — keep whatever text streamed so far, just stop
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1)
          return next
        })
      } else {
        setError(err.message)
        setMessages(prev => prev.slice(0, -1))
      }
    } finally {
      abortRef.current = null
      setStreaming(false)
      setLoading(false)
      textareaRef.current?.focus()
    }
  }, [loading, messages, input, navigate, refetchTables])

  const handleSaveTable = useCallback(async (name) => {
    if (!name?.trim() || saving || !pendingTable) return
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const payload = {
        user_id:      session.user.id,
        name:         name.trim(),
        columns:      pendingTable.columns,
        rows:         pendingTable.rows,
        source_query: pendingTable.query,
        gmail_query:  pendingTable.gmailQuery ?? null,
      }
      let { data, error: dbErr } = await supabase
        .from('custom_tables').insert(payload).select('id').single()

      // Fallback if gmail_query column doesn't exist yet
      if (dbErr?.message?.includes('gmail_query')) {
        // eslint-disable-next-line no-unused-vars
        const { gmail_query: _drop, ...rest } = payload
        ;({ data, error: dbErr } = await supabase.from('custom_tables').insert(rest).select('id').single())
      }
      if (dbErr) throw new Error(dbErr.message)

      setPendingTable(null)
      refetchTables()
      // Don't auto-sync — table already contains exactly what Claude confirmed.
      // User can manually sync from the table page if they want more.
      navigate(`/research/${data.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [saving, pendingTable, navigate, refetchTables])

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter inserts a new line
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleInput(e) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col min-h-screen">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md shrink-0 h-14 px-8 border-b border-outline-variant/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 16 }}>auto_awesome</span>
        </div>
        <p className="text-sm font-display font-bold text-on-surface leading-tight">Research Emails</p>
      </div>

      {/* Content area */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
          <div className="w-full max-w-2xl flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-container/15 border border-primary-container/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 30 }}>auto_awesome</span>
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface mb-2">Research your entire email history</h1>
              <p className="text-sm text-outline/60 font-sans">
                Describe what you're looking for. I'll ask a couple of quick questions to narrow it down, then build you a structured table.
              </p>
            </div>
            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              {SUGGESTIONS.map(({ icon, label, prompt }) => (
                <button
                  key={label}
                  onClick={() => send(prompt)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-l1 border border-outline-variant/30 text-sm font-sans text-on-surface-variant hover:text-on-surface hover:border-primary-container/40 hover:bg-primary-container/5 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-primary-container/70" style={{ fontSize: 15 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
          {messages.map((msg, i) =>
            msg.role === 'user'
              ? <UserBubble key={i} content={msg.content} />
              : <AssistantBubble
                  key={i}
                  msg={msg}
                  isLast={i === messages.length - 1}
                  streaming={streaming}
                />
          )}

          {pendingTable && (
            <SaveTablePrompt
              defaultName={pendingTable.defaultName}
              onSave={handleSaveTable}
              saving={saving}
            />
          )}

          {error && (
            <p className="text-xs text-error font-sans flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Sticky input bar */}
      <div className="sticky bottom-0 z-20 bg-background/80 backdrop-blur-md px-8 pb-6 pt-4">
        <div className="w-full max-w-2xl mx-auto">
          <div className="glass-l1 border border-outline-variant/40 rounded-2xl px-4 py-3 flex items-end gap-3 focus-within:border-primary-container/50 transition-colors shadow-lg">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Describe the emails you're looking for…"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent border-0 outline-none resize-none text-sm font-sans text-on-surface placeholder:text-outline/50 leading-relaxed py-0.5"
              style={{ overflowY: 'hidden', minHeight: '24px', maxHeight: '160px' }}
            />
            {loading ? (
              <button
                onClick={() => abortRef.current?.abort()}
                title="Stop"
                className="w-9 h-9 rounded-xl bg-error/15 border border-error/30 flex items-center justify-center hover:bg-error/25 transition-all active:scale-95 shrink-0"
              >
                <span className="material-symbols-outlined text-error" style={{ fontSize: 16 }}>stop</span>
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                <span className="material-symbols-outlined text-on-primary-container" style={{ fontSize: 16 }}>arrow_upward</span>
              </button>
            )}
          </div>
          <p className="text-center text-[10px] text-outline/40 font-sans mt-2">
            Enter to send · Shift+Enter for new line · searches your live Gmail inbox
          </p>
        </div>
      </div>
    </div>
  )
}
