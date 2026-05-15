import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { gmailSearch, gmailStream } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useCustomTables } from '../contexts/CustomTablesContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(raw) {
  if (!raw || raw === '—') return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function formatDate(raw) {
  const d = parseDate(raw)
  if (!d) return raw ?? '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Columns beginning with _ are internal (e.g. _gmailId) — hide from UI
const isVisible = col => !col.startsWith('_')

// Gmail deep link from a raw message ID
const gmailLink = id => `https://mail.google.com/mail/u/0/#all/${id}`

// ── Row detail side panel ─────────────────────────────────────────────────────

function RowPanel({ row, cols, onClose }) {
  const gmailId     = row._gmailId
  const visibleCols = cols.filter(isVisible)
  const title       = row.Subject ?? row[visibleCols[0]] ?? 'Row Details'

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary-container/20 border border-primary-container/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 14 }}>mail</span>
          </div>
          <p className="text-xs font-display font-bold text-on-surface truncate">Details</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {gmailId && (
            <a
              href={gmailLink(gmailId)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Gmail"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-primary-container hover:border-primary-container/40 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>
              <span className="font-display font-bold uppercase tracking-widest text-[9px]">Gmail</span>
            </a>
          )}
          <button
            onClick={onClose}
            className="material-symbols-outlined text-outline hover:text-on-surface transition-colors ml-1"
            style={{ fontSize: 18 }}
          >
            close
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

        {/* Subject as a card — link if Gmail available */}
        {title && (
          <div className="glass-l1 rounded-xl p-3">
            <p className="font-display font-bold uppercase tracking-widest text-[9px] text-outline mb-1">Subject</p>
            {gmailId ? (
              <a
                href={gmailLink(gmailId)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-1"
              >
                <p className="text-xs font-sans text-on-surface group-hover:text-primary-container leading-relaxed transition-colors">{title}</p>
                <span className="material-symbols-outlined text-outline/40 group-hover:text-primary-container shrink-0 transition-colors" style={{ fontSize: 12 }}>open_in_new</span>
              </a>
            ) : (
              <p className="text-xs font-sans text-on-surface leading-relaxed">{title}</p>
            )}
          </div>
        )}

        {/* Remaining fields */}
        <div className="glass-l1 rounded-xl p-3 flex flex-col gap-2.5">
          {visibleCols.map(col => {
            if (col === 'Subject') return null  // shown above
            if (col === 'Preview') return null  // shown below
            const val = col === 'Date' ? formatDate(row[col]) : (row[col] ?? '—')
            return (
              <div key={col}>
                <p className="font-display font-bold uppercase tracking-widest text-[9px] text-outline mb-0.5">{col}</p>
                <p className="text-xs text-on-surface font-sans leading-relaxed break-words">{val || '—'}</p>
              </div>
            )
          })}
        </div>

        {/* Preview snippet */}
        {(row.Preview || row['Has Attachment']) && (
          <div className="glass-l1 rounded-xl p-3 flex flex-col gap-2">
            {row['Has Attachment'] === 'Yes' && (
              <span className="inline-flex items-center gap-1 text-[9px] font-display font-bold uppercase tracking-widest text-primary-container">
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>attach_file</span>
                Has attachment
              </span>
            )}
            {row.Preview && (
              <p className="text-[11px] text-outline font-sans leading-relaxed">{row.Preview}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ResearchTable() {
  const { tableId }  = useParams()
  const { user }     = useAuth()
  const navigate     = useNavigate()
  const { state: navState } = useLocation()
  const { refetch: refetchSidebar } = useCustomTables()
  const autoSyncRan  = useRef(false)

  const [table,     setTable]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [sortKey,   setSortKey]   = useState(null)
  const [sortDir,   setSortDir]   = useState('asc')
  const [senderFilter, setSenderFilter] = useState(null)
  const [syncing,   setSyncing]   = useState(false)
  const [syncMsg,   setSyncMsg]   = useState(null)
  const [deleting,  setDeleting]  = useState(false)
  const [viewRow,   setViewRow]   = useState(null)   // row object for detail panel
  // Progressive loading progress: { fetched, total, running }
  const [streamProgress, setStreamProgress] = useState(null)

  // Load table from Supabase
  useEffect(() => {
    if (!user || !tableId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    supabase
      .from('custom_tables')
      .select('*')
      .eq('id', tableId)
      .eq('user_id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { navigate('/chat'); return }
        setTable(data)
        setLoading(false)
      })
  }, [tableId, user, navigate])

  // Auto-sync: when navigated here from Chat after table creation, progressively
  // fetch remaining emails and append them to the table row-by-row.
  // gmail_query may be missing if the DB migration hasn't been applied yet;
  // fall back to the value passed via navigation state.
  useEffect(() => {
    const gmailQuery = table?.gmail_query ?? navState?.gmailQuery ?? null
    if (!navState?.autoSync || !table || !gmailQuery) return
    if (autoSyncRan.current) return
    autoSyncRan.current = true

    async function runStream() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.provider_token) return

        const existingIds = (table.rows ?? []).map(r => r._gmailId).filter(Boolean)
        setStreamProgress({ fetched: 0, total: null, running: true })

        await gmailStream({
          query:       gmailQuery,
          gmailToken:  session.provider_token,
          accessToken: session.access_token,
          tableId:     table.id,
          userId:      session.user.id,
          existingIds,
          onTotal: (count) => setStreamProgress(p => ({ ...p, total: count })),
          onBatch: ({ rows: newRows, fetched, total }) => {
            // Append new rows to local state immediately
            setTable(prev => {
              if (!prev) return prev
              const seenIds = new Set((prev.rows ?? []).map(r => r._gmailId).filter(Boolean))
              const dedupedNew = newRows.filter(r => !seenIds.has(r._gmailId))
              return { ...prev, rows: [...(prev.rows ?? []), ...dedupedNew] }
            })
            setStreamProgress({ fetched, total, running: true })
          },
          onDone: (total) => {
            setStreamProgress({ fetched: total, total, running: false })
          },
        })
      } catch {
        setStreamProgress(null)
      }
    }

    runStream()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.id, navState?.autoSync])

  const cols    = useMemo(() => (table?.columns ?? []).filter(isVisible), [table])
  const allRows = useMemo(() => table?.rows ?? [], [table])

  // Does this table have Gmail data?
  const isGmailTable = allRows.length > 0 && '_gmailId' in (allRows[0] ?? {})
  const hasDateCol   = cols.includes('Date')

  // ── Summary stats + top senders ──────────────────────────────────────────
  const summary = useMemo(() => {
    if (allRows.length === 0) return null

    // Date range
    const dates = allRows.map(r => parseDate(r.Date)).filter(Boolean).map(d => d.getTime())
    const earliest = dates.length ? new Date(Math.min(...dates)) : null
    const latest   = dates.length ? new Date(Math.max(...dates)) : null

    // Sender breakdown
    const counts = {}
    for (const row of allRows) {
      const raw    = row.From ?? ''
      const name   = (raw.match(/^([^<]+)/)?.[1] ?? raw).trim().replace(/^["']|["']$/g, '').trim()
      const sender = name || raw
      if (sender) counts[sender] = (counts[sender] ?? 0) + 1
    }
    const sortedSenders = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const topSenders    = sortedSenders.slice(0, 4).map(([name, count]) => ({ name, count }))
    const uniqueSenders = sortedSenders.length

    // Natural-language summary text
    const fmt      = d => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const monthSpan = earliest && latest ? Math.round((latest - earliest) / (1000 * 60 * 60 * 24 * 30)) : null
    const parts    = []

    if (earliest && latest && monthSpan != null) {
      parts.push(monthSpan <= 1
        ? `${allRows.length} emails from ${uniqueSenders} sender${uniqueSenders !== 1 ? 's' : ''} within ${fmt(earliest)}.`
        : `${allRows.length} emails from ${uniqueSenders} sender${uniqueSenders !== 1 ? 's' : ''} between ${fmt(earliest)} and ${fmt(latest)} — a span of ${monthSpan} month${monthSpan !== 1 ? 's' : ''}.`
      )
    } else {
      parts.push(`${allRows.length} emails from ${uniqueSenders} sender${uniqueSenders !== 1 ? 's' : ''}.`)
    }

    if (sortedSenders.length > 1) {
      const top3   = sortedSenders.slice(0, 3)
      const listed = top3.map(([n, c]) => `${n} (${c})`).join(', ')
      const rest   = uniqueSenders - top3.length
      parts.push(`Most frequent: ${listed}${rest > 0 ? `, and ${rest} more` : ''}.`)
    } else if (sortedSenders.length === 1) {
      parts.push(`All emails are from ${sortedSenders[0][0]}.`)
    }

    const subjects = [...new Set(allRows.map(r => r.Subject).filter(Boolean))]
    if (subjects.length > 0 && subjects.length < allRows.length) {
      parts.push(`${subjects.length} unique subject${subjects.length !== 1 ? 's' : ''}.`)
    }

    return { earliest, latest, topSenders, summaryText: parts.join(' ') }
  }, [allRows])

  // Filtered + sorted rows
  const rows = useMemo(() => {
    let r = allRows

    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row => Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q)))
    }

    if (senderFilter) {
      const sf = senderFilter.toLowerCase()
      r = r.filter(row => (row.From ?? '').toLowerCase().includes(sf))
    }

    if (hasDateCol && dateFrom) {
      const from = new Date(dateFrom).getTime()
      r = r.filter(row => {
        const d = parseDate(row.Date)
        return d && d.getTime() >= from
      })
    }
    if (hasDateCol && dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000 - 1
      r = r.filter(row => {
        const d = parseDate(row.Date)
        return d && d.getTime() <= to
      })
    }

    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortKey] ?? '').toLowerCase()
        const bv = String(b[sortKey] ?? '').toLowerCase()
        const da = parseDate(av)
        const db = parseDate(bv)
        let cmp
        if (da && db) cmp = da.getTime() - db.getTime()
        else if (!isNaN(Number(av)) && !isNaN(Number(bv))) cmp = Number(av) - Number(bv)
        else cmp = av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return r
  }, [allRows, search, senderFilter, dateFrom, dateTo, sortKey, sortDir, hasDateCol])

  function handleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('asc') }
  }

  // Sync: re-run Gmail search and update the table
  const handleSync = useCallback(async () => {
    if (!table?.gmail_query) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.provider_token) {
        setSyncMsg({ type: 'error', text: 'Gmail token expired — sign out and sign back in.' })
        return
      }

      setSyncMsg({ type: 'info', text: 'Searching Gmail…' })
      const result = await gmailSearch({
        query:      table.gmail_query,
        gmailToken: session.provider_token,
        accessToken: session.access_token,
        maxResults: 200,
      })

      // Update Supabase with fresh rows
      await supabase.from('custom_tables')
        .update({ rows: result.rows, columns: result.columns, updated_at: new Date().toISOString() })
        .eq('id', tableId)

      setTable(prev => ({ ...prev, rows: result.rows, columns: result.columns }))
      setSyncMsg({ type: 'done', text: `Synced — ${result.fetched} emails (${result.total} total matches)` })
    } catch (err) {
      setSyncMsg({ type: 'error', text: err.message })
    } finally {
      setSyncing(false)
    }
  }, [table, tableId])

  // Delete table
  async function handleDelete() {
    if (!window.confirm(`Delete "${table.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await supabase.from('custom_tables').delete().eq('id', tableId)
    await refetchSidebar()
    navigate('/chat')
  }

  function formatDate_(raw) { return formatDate(raw) }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-on-surface-variant text-sm">
        <div className="w-4 h-4 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />
        Loading…
      </div>
    )
  }

  const hasFilter = search || dateFrom || dateTo || senderFilter

  return (
    <div className="flex flex-col min-h-screen">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md shrink-0 h-14 px-8 border-b border-outline-variant/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 16 }}>table_chart</span>
        </div>
        <p className="flex-1 text-sm font-display font-bold text-on-surface truncate">{table.name}</p>
        <Link to="/chat" className="flex items-center gap-1 text-xs text-outline hover:text-on-surface font-sans transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chat</span>
          Research Emails
        </Link>
      </div>

      <div className="px-8 py-5 flex flex-col gap-4">

        {/* Filter + action bar */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: 15 }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search rows…"
              className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm pl-8 pr-3 py-1.5 rounded-lg transition-all placeholder:text-outline/50 w-48"
            />
            {search && (
              <button onClick={() => setSearch('')} className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface" style={{ fontSize: 13 }}>close</button>
            )}
          </div>

          {/* Date range filter (only shown if Date column exists) */}
          {hasDateCol && (
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-2 py-1.5 rounded-lg w-32 [color-scheme:dark]" />
              <span className="text-outline text-xs">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-2 py-1.5 rounded-lg w-32 [color-scheme:dark]" />
            </div>
          )}

          {hasFilter && (
            <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setSenderFilter(null) }}
              className="flex items-center gap-1 text-xs text-outline hover:text-on-surface font-sans transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>filter_list_off</span>Clear
            </button>
          )}

          {/* Row count */}
          <p className="text-xs text-outline/60 font-sans flex items-center gap-1.5">
            <span className="text-on-surface font-semibold">{rows.length}</span>
            {rows.length !== allRows.length && <span> of {allRows.length}</span>}
            <span>rows</span>
            {streamProgress?.running && (
              <span className="text-primary-container animate-pulse">· loading more…</span>
            )}
          </p>

          {/* Right-side actions */}
          <div className="ml-auto flex items-center gap-2 shrink-0">

            {/* Sync (Gmail tables only) */}
            {isGmailTable && table.gmail_query && (
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Re-sync from Gmail"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-l1 border border-outline-variant/40 font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant hover:text-primary-container hover:border-primary-container/40 transition-all active:scale-95 disabled:opacity-40"
              >
                <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`} style={{ fontSize: 14, animationDuration: '1s' }}>sync</span>
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            )}

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] text-error border border-error/30 hover:bg-error/10 transition-all active:scale-95 disabled:opacity-40"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
              Delete
            </button>
          </div>
        </div>

        {/* Summary card */}
        {summary && (
          <div className="glass-l1 border border-outline-variant/30 rounded-xl px-5 py-4 flex flex-col gap-4">

            <div className="flex flex-wrap gap-5 border-outline-variant/20 pt-4">
              {/* Total */}
              <div className="flex flex-col gap-0.5 min-w-[60px]">
                <p className="font-display font-bold uppercase tracking-widest text-[9px] text-outline">Total</p>
                <p className="text-2xl font-display font-bold text-on-surface leading-none">{allRows.length}</p>
                <p className="text-[10px] text-outline/60 font-sans">emails</p>
              </div>

              {summary.earliest && summary.latest && (
                <>
                  <div className="w-px bg-outline-variant/30 self-stretch" />
                  <div className="flex flex-col gap-0.5">
                    <p className="font-display font-bold uppercase tracking-widest text-[9px] text-outline">Date range</p>
                    <p className="text-sm font-sans text-on-surface font-semibold leading-snug">
                      {summary.earliest.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      {' – '}
                      {summary.latest.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </>
              )}

              {summary.topSenders.length > 0 && (
                <>
                  <div className="w-px bg-outline-variant/30 self-stretch" />
                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <p className="font-display font-bold uppercase tracking-widest text-[9px] text-outline">Top senders</p>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.topSenders.map(({ name, count }) => {
                        const isActive = senderFilter === name
                        return (
                          <button
                            key={name}
                            onClick={() => setSenderFilter(isActive ? null : name)}
                            title={isActive ? `Remove filter: ${name}` : `Filter by: ${name}`}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-sans transition-all active:scale-95 max-w-[200px] ${
                              isActive
                                ? 'bg-primary-container text-on-primary-container border-primary-container font-semibold'
                                : 'bg-primary-container/10 border-primary-container/20 text-on-surface-variant hover:bg-primary-container/20 hover:border-primary-container/40'
                            }`}
                          >
                            <span className="truncate">{name}</span>
                            <span className={`shrink-0 text-[9px] px-1 py-px rounded-full ${isActive ? 'bg-on-primary-container/20' : 'bg-primary-container/20'}`}>
                              {count}
                            </span>
                            {isActive && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 10 }}>close</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Progressive email fetch progress bar */}
        {streamProgress && (
          <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl glass-l1 border border-outline-variant/30">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-on-surface-variant font-sans">
                {streamProgress.running
                  ? <><span className="w-2 h-2 rounded-full bg-primary-container animate-pulse shrink-0" /> Fetching emails…</>
                  : <><span className="material-symbols-outlined text-emerald-400 shrink-0" style={{ fontSize: 14 }}>check_circle</span> All emails loaded</>
                }
              </span>
              <span className="text-[11px] text-outline/60 font-sans tabular-nums">
                {streamProgress.fetched}
                {streamProgress.total != null ? ` / ${streamProgress.total}` : ''}
              </span>
            </div>
            {streamProgress.total > 0 && (
              <div className="h-1 bg-outline/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-container rounded-full transition-all duration-300"
                  style={{ width: `${Math.min((streamProgress.fetched / streamProgress.total) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Sync status message */}
        {syncMsg && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-sans border ${
            syncMsg.type === 'error' ? 'bg-error/10 border-error/30 text-error' :
            syncMsg.type === 'done'  ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' :
            'glass-l1 border-outline-variant/40 text-on-surface-variant'
          }`}>
            {syncing && <div className="w-3 h-3 rounded-full liquid-neon animate-spin shrink-0" style={{ animationDuration: '1s' }} />}
            {syncMsg.type === 'done'  && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>check_circle</span>}
            {syncMsg.type === 'error' && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>error</span>}
            {syncMsg.text}
          </div>
        )}

        {/* Table + side panel */}
        <div className="flex gap-5 items-start">

          {/* Table */}
          <div className={`min-w-0 flex flex-col gap-4 transition-all duration-300 ${viewRow ? 'flex-[3]' : 'flex-1'}`}>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-outline/50 text-sm">
                <span className="material-symbols-outlined" style={{ fontSize: 28 }}>search_off</span>
                No rows match your filters.
              </div>
            ) : (
              <div className="overflow-auto rounded-xl border border-outline-variant/30 max-h-[60vh]">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-primary-container/10">
                      {cols.map(col => (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className="px-4 py-2.5 text-left text-on-surface font-semibold whitespace-nowrap border-b border-outline-variant/30 font-sans cursor-pointer select-none hover:bg-primary-container/10 transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            {col}
                            {sortKey === col && (
                              <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 11 }}>
                                {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                              </span>
                            )}
                          </span>
                        </th>
                      ))}
                      {/* Gmail link column header */}
                      <th className="px-3 py-2.5 border-b border-outline-variant/30 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const isSelected = viewRow === row
                      return (
                        <tr
                          key={i}
                          onClick={() => setViewRow(isSelected ? null : row)}
                          className={`border-b border-outline-variant/15 transition-colors cursor-pointer group ${
                            isSelected
                              ? 'bg-primary-container/10'
                              : i % 2 === 1
                                ? 'bg-surface-container-highest/5 hover:bg-primary-container/5'
                                : 'hover:bg-primary-container/5'
                          }`}
                        >
                          {cols.map(col => (
                            <td key={col} className="px-4 py-2.5 text-on-surface-variant font-sans max-w-[280px] truncate">
                              {col === 'Date' ? formatDate_(row[col]) : (row[col] ?? '—')}
                            </td>
                          ))}
                          {/* Gmail deep-link icon */}
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            {row._gmailId ? (
                              <a
                                href={gmailLink(row._gmailId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in Gmail"
                                className="material-symbols-outlined text-outline/30 hover:text-primary-container opacity-0 group-hover:opacity-100 transition-all"
                                style={{ fontSize: 14 }}
                              >open_in_new</a>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Source info */}
            {table.source_query && (
              <p className="text-[11px] text-outline/40 font-sans">
                From "{table.source_query.slice(0, 80)}{table.source_query.length > 80 ? '…' : ''}"
                {table.gmail_query && <span className="ml-2 font-mono text-outline/30">({table.gmail_query})</span>}
              </p>
            )}
          </div>

          {/* Side panel — slides in when a row is selected */}
          {viewRow && (
            <div className="flex-[2] glass-l1 rounded-xl sticky top-20 max-h-[480px] overflow-hidden flex flex-col min-h-0">
              <RowPanel
                key={JSON.stringify(viewRow)}
                row={viewRow}
                cols={table.columns ?? []}
                onClose={() => setViewRow(null)}
              />
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
