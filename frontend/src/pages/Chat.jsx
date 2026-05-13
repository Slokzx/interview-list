import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendChatMessage } from '../lib/api'
import { useCustomTables } from '../contexts/CustomTablesContext'

// ── Markdown table helpers ───────────────────────────────────────────────────

/** Extract the first markdown table found in text. Returns { columns, rows } or null. */
function extractMarkdownTable(text) {
  const lines = text.split('\n')
  const tableLines = []
  let started = false

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('|') && t.endsWith('|')) {
      started = true
      tableLines.push(t)
    } else if (started) {
      break
    }
  }

  if (tableLines.length < 3) return null

  const headers = tableLines[0]
    .split('|').slice(1, -1).map(h => h.trim()).filter(Boolean)
  if (!headers.length) return null

  const rows = tableLines
    .slice(2) // skip separator row
    .filter(line => !/^\|[-:\s|]+\|$/.test(line))
    .map(line => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim())
      const obj = {}
      headers.forEach((h, i) => { obj[h] = cells[i] ?? '' })
      return obj
    })
    .filter(row => Object.values(row).some(v => v))

  return headers.length && rows.length ? { columns: headers, rows } : null
}

// ── Content renderer ─────────────────────────────────────────────────────────

function renderContent(text) {
  const blocks = []
  const lines  = text.split('\n')
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
                    <th key={j} className="px-3 py-2 text-left text-on-surface font-semibold whitespace-nowrap border-b border-outline-variant/30 font-sans">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, j) => (
                  <tr key={j} className={`border-b border-outline-variant/10 hover:bg-primary-container/5 transition-colors ${j % 2 === 1 ? 'bg-surface-container-highest/5' : ''}`}>
                    {headers.map((_, k) => (
                      <td key={k} className="px-3 py-1.5 text-on-surface-variant font-sans">
                        {row[k] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }

      // Not enough lines — render as plain text
      tableLines.forEach(tl => {
        blocks.push(<span key={`tl-${blocks.length}`}>{tl}<br /></span>)
      })
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

// ── Save as Research Table card ──────────────────────────────────────────────

function SaveTableCard({ content, sourceQuery, onSaved }) {
  const tableData = extractMarkdownTable(content)
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [savedId, setSavedId] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  if (!tableData) return null
  if (savedId) {
    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400 font-sans">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
        Table saved —{' '}
        <Link to={`/research/${savedId}`} className="underline underline-offset-2 hover:text-emerald-300 transition-colors">
          View table
        </Link>
      </div>
    )
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.from('custom_tables').insert({
        user_id:      session.user.id,
        name:         trimmed,
        columns:      tableData.columns,
        rows:         tableData.rows,
        source_query: sourceQuery ?? null,
      }).select('id').single()
      if (error) throw error
      setSavedId(data.id)
      onSaved()   // re-fetch sidebar
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg border border-primary-container/30 text-primary-container bg-primary-container/5 hover:bg-primary-container/10 transition-all text-[11px] font-display font-bold uppercase tracking-widest active:scale-95"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>table_chart</span>
        Save as Research Table
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setOpen(false) }}
        placeholder="Table name…"
        className="flex-1 bg-surface-container-highest/30 border border-primary-container/40 focus:border-primary-container focus:outline-none text-on-surface font-sans text-xs px-3 py-1.5 rounded-lg placeholder:text-outline/50 transition-all"
      />
      <button
        onClick={handleCreate}
        disabled={!name.trim() || saving}
        className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
      >
        {saving ? 'Creating…' : 'Create'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="material-symbols-outlined text-outline hover:text-on-surface transition-colors"
        style={{ fontSize: 16 }}
      >
        close
      </button>
    </div>
  )
}

// ── Bubbles ──────────────────────────────────────────────────────────────────

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary-container text-on-primary-container text-sm font-sans leading-relaxed">
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ content, streaming, sourceQuery, onTableSaved }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-primary-container/20 border border-primary-container/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 14 }}>auto_awesome</span>
      </div>
      <div className="flex-1 min-w-0 text-sm font-sans leading-relaxed text-on-surface pt-0.5">
        {content
          ? (
            <>
              {renderContent(content)}
              {!streaming && (
                <SaveTableCard
                  content={content}
                  sourceQuery={sourceQuery}
                  onSaved={onTableSaved}
                />
              )}
            </>
          )
          : streaming && (
            <span className="flex gap-1 items-center h-5">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-outline/60 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )
        }
      </div>
    </div>
  )
}

// ── Main Chat component ──────────────────────────────────────────────────────

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const bottomRef               = useRef(null)
  const textareaRef             = useRef(null)

  const { refetch: refetchTables } = useCustomTables()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async (text) => {
    const msg = (typeof text === 'string' ? text : input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }

    const snapshot = [...messages]
    setMessages(prev => [...prev, { role: 'user', content: msg }, { role: 'assistant', content: '' }])
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      await sendChatMessage({
        message: msg, history: snapshot,
        userId: session.user.id, accessToken: session.access_token,
        onDelta(chunk) {
          setMessages(prev => {
            const next = [...prev]
            next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + chunk }
            return next
          })
        },
      })
    } catch (err) {
      setError(err.message)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }, [loading, messages, input])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
  }

  function handleInput(e) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  // Find the user message that prompted each assistant message
  function getSourceQuery(msgIndex) {
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return messages[i].content
    }
    return null
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col min-h-screen">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md shrink-0 h-14 px-8 border-b border-outline-variant/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 16 }}>auto_awesome</span>
        </div>
        <div>
          <p className="text-sm font-display font-bold text-on-surface leading-tight">Research Emails</p>
        </div>
      </div>

      {/* Content area */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
          <div className="w-full flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-container/15 border border-primary-container/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 30 }}>auto_awesome</span>
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface mb-2">What can I help with your email research?</h1>
              <p className="text-sm text-outline/60 font-sans max-w-md">
                Ask anything about your emails — interviews, subscriptions, receipts, contacts, timelines. When the results look right, save them as a searchable table.
              </p>
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
                  content={msg.content}
                  streaming={loading && i === messages.length - 1 && !msg.content}
                  sourceQuery={getSourceQuery(i)}
                  onTableSaved={refetchTables}
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
              placeholder="Ask anything… (⌘↵ to send)"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent border-0 outline-none resize-none text-sm font-sans text-on-surface placeholder:text-outline/50 leading-relaxed py-0.5"
              style={{ overflowY: 'hidden', minHeight: '24px', maxHeight: '160px' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center hover:opacity-90 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              {loading
                ? <span className="w-3 h-3 border-2 border-on-primary-container/30 border-t-on-primary-container rounded-full animate-spin" />
                : <span className="material-symbols-outlined text-on-primary-container" style={{ fontSize: 16 }}>arrow_upward</span>
              }
            </button>
          </div>
          <p className="text-center text-[10px] text-outline/40 font-sans mt-2">
            ⌘↵ to send · responses use your live application and receipt data
          </p>
        </div>
      </div>
    </div>
  )
}
