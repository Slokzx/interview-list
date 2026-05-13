import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { sendChatMessage } from '../lib/api'


function renderContent(text) {
  return text.split('\n').map((line, i, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/)
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : p
        )}
        {i < arr.length - 1 && <br />}
      </span>
    )
  })
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary-container text-on-primary-container text-sm font-sans leading-relaxed">
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ content, streaming }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-primary-container/20 border border-primary-container/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 14 }}>auto_awesome</span>
      </div>
      <div className="flex-1 min-w-0 text-sm font-sans leading-relaxed text-on-surface pt-0.5">
        {content
          ? renderContent(content)
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

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const bottomRef               = useRef(null)
  const textareaRef             = useRef(null)

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

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md shrink-0 h-14 px-8 border-b border-outline-variant/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 16 }}>auto_awesome</span>
        </div>
        <div>
          <p className="text-sm font-display font-bold text-on-surface leading-tight">Research Emails</p>
        </div>
      </div>

      {/* ── Content area ── */}
      {isEmpty ? (
        /* Welcome state — fills the gap between header and input */
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">

          <div className="w-full flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-container/15 border border-primary-container/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 30 }}>auto_awesome</span>
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-on-surface mb-2">What can I help with your email research?</h1>
            </div>
          </div>

        </div>
      ) : (
        /* Message thread */
        <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
          {messages.map((msg, i) =>
            msg.role === 'user'
              ? <UserBubble key={i} content={msg.content} />
              : <AssistantBubble
                  key={i}
                  content={msg.content}
                  streaming={loading && i === messages.length - 1 && !msg.content}
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

      {/* ── Sticky input bar ── */}
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
