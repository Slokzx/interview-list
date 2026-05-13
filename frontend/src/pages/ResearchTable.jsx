import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useCustomTables } from '../contexts/CustomTablesContext'

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ResearchTable() {
  const { tableId } = useParams()
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const { refetch: refetchSidebar } = useCustomTables()

  const [table,   setTable]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user || !tableId) return
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

  const cols    = table?.columns ?? []
  const allRows = useMemo(() => table?.rows ?? [], [table])

  const rows = useMemo(() => {
    let r = allRows
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row => Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q)))
    }
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortKey] ?? '').toLowerCase()
        const bv = String(b[sortKey] ?? '').toLowerCase()
        const n  = isNaN(Number(av)) || isNaN(Number(bv))
        const cmp = n ? av.localeCompare(bv) : Number(av) - Number(bv)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return r
  }, [allRows, search, sortKey, sortDir])

  function handleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('asc') }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${table.name}"? This cannot be undone.`)) return
    setDeleting(true)
    await supabase.from('custom_tables').delete().eq('id', tableId)
    await refetchSidebar()
    navigate('/chat')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-on-surface-variant text-sm">
        <div className="w-4 h-4 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />
        Loading…
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md shrink-0 h-14 px-8 border-b border-outline-variant/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary-container/20 border border-primary-container/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 16 }}>table_chart</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-bold text-on-surface leading-tight truncate">{table.name}</p>
        </div>
        <Link
          to="/chat"
          className="flex items-center gap-1.5 text-xs text-outline hover:text-on-surface font-sans transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chat</span>
          Research Emails
        </Link>
      </div>

      <div className="px-8 py-6 flex flex-col gap-4">

        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: 15 }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search rows…"
              className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm pl-8 pr-3 py-1.5 rounded-lg transition-all placeholder:text-outline/50 w-52"
            />
            {search && (
              <button onClick={() => setSearch('')} className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface" style={{ fontSize: 13 }}>close</button>
            )}
          </div>

          <p className="text-xs text-outline/60 font-sans">
            <span className="text-on-surface font-semibold">{rows.length}</span>
            {rows.length !== allRows.length && <span> of {allRows.length}</span>} rows
            {table.source_query && (
              <span className="text-outline/40"> · from "{table.source_query.slice(0, 60)}{table.source_query.length > 60 ? '…' : ''}"</span>
            )}
          </p>
          <p className="text-[11px] text-outline/50 font-sans hidden sm:block">
            Created {formatDate(table.created_at)} via Research Emails
          </p>

          <div className="ml-auto">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] text-error border border-error/30 hover:bg-error/10 transition-all active:scale-95 disabled:opacity-40"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
              Delete Table
            </button>
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-outline/50 text-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>search_off</span>
            No rows match your search.
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
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-outline-variant/15 hover:bg-primary-container/5 transition-colors ${i % 2 === 1 ? 'bg-surface-container-highest/5' : ''}`}
                  >
                    {cols.map(col => (
                      <td key={col} className="px-4 py-2.5 text-on-surface-variant font-sans max-w-[260px] truncate">
                        {row[col] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
