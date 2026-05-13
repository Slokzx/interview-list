import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendChatMessage } from '../lib/api'
import { useCustomTables } from '../contexts/CustomTablesContext'

const TABLE_READY_MARKER = '[TABLE_READY]'

// ── Markdown renderer ─────────────────────────────────────────────────────────

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

// ── Quick-reply suggestion chips ─────────────────────────────────────────────
// Shown after Phase 1/2 responses so users can answer clarifying questions fast.

const DATE_CHIPS = [
  { label: 'All time',       value: 'All time — show everything' },
  { label: 'Last 2 years',   value: 'Last 2 years (2024–2025)' },
  { label: '2024',           value: '2024 only' },
  { label: '2023',           value: '2023 only' },
  { label: 'Last 6 months',  value: 'Last 6 months' },
]
const CONFIRM_CHIP = { label: '✓ Finalize & create table', value: 'That looks good — please finalize and create the table.' }

function SuggestedReplies({ onSelect }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {DATE_CHIPS.map(c => (
        <button
          key={c.label}
          onClick={() => onSelect(c.value)}
          className="px-3 py-1.5 rounded-full border border-outline-variant/30 bg-surface-container-highest/20 text-[11px] font-sans text-on-surface-variant hover:bg-primary-container/10 hover:border-primary-container/30 hover:text-on-surface transition-all"
        >
          {c.label}
        </button>
      ))}
      <button
        onClick={() => onSelect(CONFIRM_CHIP.value)}
        className="px-3 py-1.5 rounded-full border border-primary-container/40 bg-primary-container/10 text-[11px] font-sans text-primary-container font-semibold hover:bg-primary-container/20 transition-all"
      >
        {CONFIRM_CHIP.label}
      </button>
    </div>
  )
}

// ── Create Research Table CTA ─────────────────────────────────────────────────
// Only shown after Claude emits [TABLE_READY] — i.e. after user has confirmed all details.

function CreateTableCTA({ content, sourceQuery, emailPayload, onSaved }) {
  const navigate  = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [savedId, setSavedId] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Data source: raw Gmail emails (preferred) → markdown table fallback
  const hasEmailData = (emailPayload?.rows?.length ?? 0) > 0
  const rowCount     = emailPayload?.rows?.length ?? 0

  if (savedId) {
    return (
      <div className="flex items-center gap-2 mt-4 text-sm text-emerald-400 font-sans">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
        <span>Table created!</span>
        <Link
          to={`/research/${savedId}`}
          className="underline underline-offset-2 hover:text-emerald-300 transition-colors font-semibold"
        >
          Open in Research tab →
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

      let columns, rows, gmailQuery

      if (hasEmailData) {
        columns    = emailPayload.columns
        rows       = emailPayload.rows
        gmailQuery = emailPayload.query ?? null
      } else {
        // Markdown table fallback
        const tableLines = []
        let started = false
        for (const line of content.split('\n')) {
          const t = line.trim()
          if (t.startsWith('|') && t.endsWith('|')) { started = true; tableLines.push(t) }
          else if (started) break
        }
        if (tableLines.length < 3) { setSaving(false); return }

        columns = tableLines[0].split('|').slice(1, -1).map(h => h.trim()).filter(Boolean)
        rows = tableLines.slice(2)
          .filter(line => !/^\|[-:\s|]+\|$/.test(line))
          .map(line => {
            const cells = line.split('|').slice(1, -1).map(c => c.trim())
            const obj = {}
            columns.forEach((h, i) => { obj[h] = cells[i] ?? '' })
            return obj
          })
          .filter(row => Object.values(row).some(v => v))
      }

      const { data, error } = await supabase.from('custom_tables').insert({
        user_id:      session.user.id,
        name:         trimmed,
        columns,
        rows,
        source_query: sourceQuery ?? null,
        gmail_query:  gmailQuery ?? null,
      }).select('id').single()

      if (error) throw error
      setSavedId(data.id)
      onSaved()
      // Auto-navigate to the new table
      setTimeout(() => navigate(`/research/${data.id}`), 800)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // Collapsed state — prominent CTA card
  if (!open) {
    return (
      <div className="mt-4 rounded-xl border border-primary-container/30 bg-primary-container/5 p-4 flex items-center gap-4">
        <div className="w-9 h-9 rounded-lg bg-primary-container/15 border border-primary-container/20 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 18 }}>table_chart</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface">Ready to create your Research Table</p>
          <p className="text-xs text-outline/70 font-sans mt-0.5">
            {hasEmailData
              ? `${rowCount} emails · will be saved under the Research tab`
              : 'Results finalized · will be saved under the Research tab'}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          Create Table
        </button>
      </div>
    )
  }

  // Expanded — name input
  return (
    <div className="mt-4 rounded-xl border border-primary-container/30 bg-primary-container/5 p-4 flex flex-col gap-3">
      <p className="text-xs font-display font-bold uppercase tracking-widest text-primary-container">
        Name your Research Table
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setOpen(false) }}
          placeholder="e.g. Visa Emails 2024"
          className="flex-1 bg-surface-container-highest/30 border border-primary-container/40 focus:border-primary-container focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg placeholder:text-outline/50 transition-all"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || saving}
          className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="material-symbols-outlined text-outline hover:text-on-surface transition-colors"
          style={{ fontSize: 18 }}
        >
          close
        </button>
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

function AssistantBubble({ msg, streaming, sourceQuery, onTableSaved, onQuickReply, isLast }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-primary-container/20 border border-primary-container/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 14 }}>auto_awesome</span>
      </div>
      <div className="flex-1 min-w-0 text-sm font-sans leading-relaxed text-on-surface pt-0.5">
        {msg.content
          ? (
            <>
              {renderContent(msg.content)}

              {/* TABLE_READY: show create CTA */}
              {!streaming && msg.tableReady && (
                <CreateTableCTA
                  content={msg.content}
                  sourceQuery={sourceQuery}
                  emailPayload={msg.emailPayload ?? null}
                  onSaved={onTableSaved}
                />
              )}

              {/* Phase 1/2: show quick-reply chips on the last assistant message */}
              {!streaming && !msg.tableReady && isLast && (
                <SuggestedReplies onSelect={onQuickReply} />
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

// ── Main Chat component ───────────────────────────────────────────────────────

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
        userId:      session.user.id,
        accessToken: session.access_token,
        gmailToken:  session.provider_token ?? null,
        onDelta(chunk) {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + chunk }
            }
            return next
          })
        },
        onEmails(payload) {
          // payload: { data, rows, columns, query, total }
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, emailPayload: payload }
            }
            return next
          })
        },
      })

      // After streaming completes: detect [TABLE_READY] marker in final content
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.content.includes(TABLE_READY_MARKER)) {
          next[next.length - 1] = {
            ...last,
            // Strip the marker from visible content
            content:    last.content.replaceAll(TABLE_READY_MARKER, '').trimEnd(),
            tableReady: true,
          }
        }
        return next
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
              <h1 className="text-2xl font-display font-bold text-on-surface mb-2">Research your entire email history</h1>
              <p className="text-sm text-outline/60 font-sans">
                Ask about anything in your inbox. I'll ask a few questions to understand exactly what you need, then create a structured Research Table once everything is confirmed.
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
                  msg={msg}
                  streaming={loading && i === messages.length - 1 && !msg.content}
                  sourceQuery={getSourceQuery(i)}
                  onTableSaved={refetchTables}
                  onQuickReply={send}
                  isLast={i === messages.length - 1}
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
              placeholder="Ask about anything in your inbox… (⌘↵ to send)"
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
            ⌘↵ to send · searches your live Gmail inbox
          </p>
        </div>
      </div>
    </div>
  )
}
