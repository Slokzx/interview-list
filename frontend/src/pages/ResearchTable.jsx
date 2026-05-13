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

// ── Row detail modal ──────────────────────────────────────────────────────────

function RowModal({ row, cols, onClose }) {
  const gmailId = row._gmailId
  const visibleCols = cols.filter(isVisible)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass-l1 rounded-2xl w-full max-w-lg flex flex-col gap-4 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5">
          <div className="w-8 h-8 rounded-lg bg-primary-container/20 border border-primary-container/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 16 }}>mail</span>
          </div>
          <p className="flex-1 text-sm font-display font-bold text-on-surface truncate">
            {row.Subject ?? row[visibleCols[0]] ?? 'Email Details'}
          </p>
          <button onClick={onClose} className="material-symbols-outlined text-outline hover:text-on-surface" style={{ fontSize: 18 }}>close</button>
        </div>

        {/* Fields */}
        <div className="px-6 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {visibleCols.map(col => (
            <div key={col} className="flex flex-col gap-0.5">
              <span className="font-display font-bold uppercase tracking-widest text-[9px] text-outline">{col}</span>
              <span className="text-xs text-on-surface font-sans leading-relaxed break-words">
                {col === 'Date' ? formatDate(row[col]) : (row[col] || '—')}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-2">
          {gmailId && (
            <a
              href={gmailLink(gmailId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
              Open in Gmail
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant/40 text-outline hover:text-on-surface font-display font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit cell modal ────────────────────────────────────────────────────────────

function EditModal({ row, rowIndex, cols, onSave, onClose }) {
  const [form, setForm] = useState({ ...row })
  const visibleCols = cols.filter(isVisible)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass-l1 rounded-2xl w-full max-w-lg flex flex-col gap-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <p className="text-sm font-display font-bold text-on-surface">Edit Row {rowIndex + 1}</p>
          <button onClick={onClose} className="material-symbols-outlined text-outline hover:text-on-surface" style={{ fontSize: 18 }}>close</button>
        </div>

        <div className="px-6 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          {visibleCols.map(col => (
            <div key={col}>
              <label className="block font-display font-bold uppercase tracking-widest text-[9px] text-outline mb-1">{col}</label>
              <input
                value={form[col] ?? ''}
                onChange={e => setForm(f => ({ ...f, [col]: e.target.value }))}
                className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-3 py-2 rounded-lg transition-all"
              />
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-outline-variant/40 text-outline font-display font-bold uppercase tracking-widest text-[10px] hover:bg-white/5 transition-all">Cancel</button>
          <button
            onClick={() => onSave(rowIndex, form)}
            className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all"
          >
            Save
          </button>
        </div>
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
  const [syncing,   setSyncing]   = useState(false)
  const [syncMsg,   setSyncMsg]   = useState(null)
  const [deleting,  setDeleting]  = useState(false)
  const [viewRow,   setViewRow]   = useState(null)   // row object for detail modal
  const [editRow,   setEditRow]   = useState(null)   // { row, index }
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
  useEffect(() => {
    if (!navState?.autoSync || !table || !table.gmail_query) return
    if (autoSyncRan.current) return
    autoSyncRan.current = true

    async function runStream() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.provider_token) return

        const existingIds = (table.rows ?? []).map(r => r._gmailId).filter(Boolean)
        setStreamProgress({ fetched: 0, total: null, running: true })

        await gmailStream({
          query:       table.gmail_query,
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

  // Filtered + sorted rows
  const rows = useMemo(() => {
    let r = allRows

    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row => Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q)))
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
  }, [allRows, search, dateFrom, dateTo, sortKey, sortDir, hasDateCol])

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

  // Edit: save updated row to Supabase
  async function handleEditSave(rowIndex, updatedRow) {
    const newRows = allRows.map((r, i) => i === rowIndex ? updatedRow : r)
    await supabase.from('custom_tables').update({ rows: newRows }).eq('id', tableId)
    setTable(prev => ({ ...prev, rows: newRows }))
    setEditRow(null)
  }

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

  const hasFilter = search || dateFrom || dateTo

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
            <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
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

        {/* Table */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-outline/50 text-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>search_off</span>
            No rows match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full text-xs border-collapse">
              <thead>
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
                  {/* Edit action column */}
                  <th className="px-3 py-2.5 border-b border-outline-variant/30 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setViewRow(row)}
                    className={`border-b border-outline-variant/15 hover:bg-primary-container/5 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-surface-container-highest/5' : ''}`}
                  >
                    {cols.map(col => (
                      <td key={col} className="px-4 py-2.5 text-on-surface-variant font-sans max-w-[280px] truncate">
                        {col === 'Date' ? formatDate_(row[col]) : (row[col] ?? '—')}
                      </td>
                    ))}
                    {/* Edit button */}
                    <td className="px-3 py-2.5 text-center" onClick={e => { e.stopPropagation(); setEditRow({ row, index: i }) }}>
                      <button className="material-symbols-outlined text-outline/40 hover:text-primary-container transition-colors" style={{ fontSize: 15 }}>edit</button>
                    </td>
                  </tr>
                ))}
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

      {/* Row detail modal */}
      {viewRow && (
        <RowModal
          row={viewRow}
          cols={table.columns ?? []}
          onClose={() => setViewRow(null)}
        />
      )}

      {/* Edit modal */}
      {editRow && (
        <EditModal
          row={editRow.row}
          rowIndex={editRow.index}
          cols={table.columns ?? []}
          onSave={handleEditSave}
          onClose={() => setEditRow(null)}
        />
      )}
    </div>
  )
}
