import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getReceipts, createReceipt, deleteReceipt, syncReceiptEmails } from '../lib/api'
import { DataTable } from '../ui'
import ReceiptGroupPanel from '../components/ReceiptGroupPanel'

const CATEGORIES = ['Travel', 'Food', 'Software', 'Shopping', 'Subscription', 'Entertainment', 'Accommodation', 'Equipment', 'Other']

const CATEGORY_COLOR = {
  Travel:        '#3b82f6',
  Food:          '#f4a261',
  Software:      '#06d6a0',
  Shopping:      '#f472b6',
  Subscription:  '#a78bfa',
  Entertainment: '#fb923c',
  Accommodation: '#9b5de5',
  Equipment:     '#34d399',
  Other:         '#94a3b8',
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(n) {
  if (n == null || n === '') return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function CategoryBadge({ category }) {
  const color = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.Other
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-widest border"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 25%, transparent)` }}>
      {category}
    </span>
  )
}

function groupByCompany(receipts) {
  const map = new Map()
  for (const r of receipts) {
    const key     = (r.company ?? '').trim().toLowerCase() || '(unknown)'
    const display = (r.company ?? '').trim() || '(Unknown)'
    if (!map.has(key)) map.set(key, { id: key, company: display, receipts: [] })
    map.get(key).receipts.push(r)
  }
  return [...map.values()].map(g => {
    const amounts = g.receipts.map(r => Number(r.amount)).filter(n => !isNaN(n) && n > 0)
    const total   = amounts.reduce((s, n) => s + n, 0)
    const avg     = amounts.length > 0 ? total / amounts.length : null
    const catCounts = {}
    for (const r of g.receipts) catCounts[r.category ?? 'Other'] = (catCounts[r.category ?? 'Other'] ?? 0) + 1
    const topCat  = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Other'
    const dates   = g.receipts.map(r => r.date).filter(Boolean).sort()
    return { ...g, total, avg, count: g.receipts.length, category: topCat, latestDate: dates[dates.length - 1] ?? null }
  })
}

const COLS = [
  {
    key: 'company', label: 'Company', sortable: true,
    sortValue: g => (g.company ?? '').toLowerCase(),
    render: g => (
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-md bg-primary-container/20 border border-primary-container/20 flex items-center justify-center font-display font-bold text-[10px] text-primary-container shrink-0">
          {(g.company ?? '?').slice(0, 2).toUpperCase()}
        </div>
        <span className="font-medium text-on-surface truncate max-w-[110px]">{g.company}</span>
      </div>
    ),
  },
  {
    key: 'category', label: 'Category', sortable: true,
    render: g => <CategoryBadge category={g.category} />,
  },
  {
    key: 'latestDate', label: 'Latest Purchase', sortable: true,
    sortValue: g => g.latestDate ? new Date(g.latestDate).getTime() : -Infinity,
    render: g => <span className="text-on-surface whitespace-nowrap">{formatDate(g.latestDate)}</span>,
  },
  {
    key: 'total', label: 'Total Spent', sortable: true,
    sortValue: g => g.total ?? 0,
    className: 'text-on-surface font-semibold tabular-nums whitespace-nowrap',
    render: g => formatAmount(g.total),
  },
  {
    key: 'avg', label: 'Avg per Purchase', sortable: true,
    sortValue: g => g.avg ?? 0,
    className: 'text-on-surface tabular-nums whitespace-nowrap',
    render: g => formatAmount(g.avg),
  },
  {
    key: 'count', label: 'Purchases', sortable: true,
    sortValue: g => g.count,
    className: 'text-center text-on-surface',
    render: g => g.count,
  },
]

const EMPTY_FORM = { company: '', description: '', amount: '', category: 'Shopping', date: '', notes: '' }

export default function Receipts() {
  const [receipts, setReceipts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState(new Set())
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [selected, setSelected]     = useState(null) // selected group
  const [editMode, setEditMode]     = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [addModal, setAddModal]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    getReceipts()
      .then(r => setReceipts(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const emailsScanned = receipts.length  // includes __none__ and null entries

  const filtered = useMemo(() => {
    let rows = receipts.filter(r => r.company !== '__none__' && r.company !== null)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        (r.company ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
      )
    }
    if (catFilter.size > 0) rows = rows.filter(r => catFilter.has(r.category))
    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      rows = rows.filter(r => r.date && new Date(r.date).getTime() >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000 - 1
      rows = rows.filter(r => r.date && new Date(r.date).getTime() <= to)
    }
    return rows
  }, [receipts, search, catFilter, dateFrom, dateTo])

  const groups = useMemo(() => groupByCompany(filtered), [filtered])

  const totalSpend = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const hasFilter  = search || catFilter.size > 0 || dateFrom || dateTo

  // Keep selected group in sync when receipts change
  const selectedGroup = selected ? groups.find(g => g.id === selected.id) ?? null : null

  async function handleSave() {
    setSaving(true)
    try {
      const res = await createReceipt(form)
      setReceipts(prev => [res.data, ...prev])
      setAddModal(false)
      setForm(EMPTY_FORM)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function handleDeleteSelected() {
    // selectedIds are group ids (company keys); delete all receipts in those groups
    const toDelete = groups
      .filter(g => selectedIds.has(g.id))
      .flatMap(g => g.receipts.map(r => r.id))
    if (!window.confirm(`Delete ${toDelete.length} receipt${toDelete.length === 1 ? '' : 's'} from ${selectedIds.size} company group${selectedIds.size === 1 ? '' : 's'}?`)) return
    await Promise.all(toDelete.map(id => deleteReceipt(id)))
    const toDeleteSet = new Set(toDelete)
    setReceipts(prev => prev.filter(r => !toDeleteSet.has(r.id)))
    if (selectedIds.has(selected?.id)) setSelected(null)
    setSelectedIds(new Set())
  }

  async function handleSync() {
    setSyncing(true)
    setSyncStatus({ type: 'info', message: 'Starting…' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const gmailToken        = session?.provider_token
      const gmailRefreshToken = session?.provider_refresh_token
      const accessToken       = session?.access_token
      const userId            = session?.user?.id
      if (!gmailToken) { setSyncStatus({ type: 'error', message: 'Gmail token missing — sign out and sign back in.' }); return }
      await syncReceiptEmails({
        gmailToken, gmailRefreshToken, userId, accessToken,
        onEvent(event) {
          if (event.step === 'error') setSyncStatus({ type: 'error', message: event.message })
          else if (event.step === 'done') { setSyncStatus({ type: 'done', message: event.message }); getReceipts().then(res => setReceipts(res.data ?? [])) }
          else setSyncStatus({ type: 'info', message: event.message })
        },
      })
    } catch (err) { setSyncStatus({ type: 'error', message: err.message }) }
    finally { setSyncing(false) }
  }

  return (
    <main className="px-6 md:px-10 py-5 max-w-screen-2xl mx-auto flex flex-col gap-4">

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: 15 }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search company or description…"
            className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm pl-8 pr-3 py-1.5 rounded-lg transition-all placeholder:text-outline/50 w-60" />
          {search && <button onClick={() => setSearch('')} className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface" style={{ fontSize: 13 }}>close</button>}
        </div>

        {CATEGORIES.map(c => (
          <button key={c}
            onClick={() => setCatFilter(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })}
            className={`px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all ${catFilter.has(c) ? 'bg-primary-container/20 text-primary-container border-primary-container/30' : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'}`}>
            {c}
          </button>
        ))}

        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-2 py-1.5 rounded-lg w-32 [color-scheme:dark]" />
          <span className="text-outline text-xs">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-2 py-1.5 rounded-lg w-32 [color-scheme:dark]" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="material-symbols-outlined text-outline hover:text-on-surface" style={{ fontSize: 14 }}>close</button>}
        </div>

        {hasFilter && (
          <button onClick={() => { setSearch(''); setCatFilter(new Set()); setDateFrom(''); setDateTo('') }}
            className="flex items-center gap-1 text-xs text-outline hover:text-on-surface font-sans transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>filter_list_off</span>Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {editMode && selectedIds.size > 0 && (
            <button onClick={handleDeleteSelected}
              className="font-display font-bold uppercase tracking-widest text-[10px] text-error border border-error/30 px-3 py-1.5 rounded-lg hover:bg-error/10 transition-all flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
              Delete {selectedIds.size}
            </button>
          )}
          <button onClick={handleSync} disabled={syncing}
            className="w-8 h-8 rounded-lg glass-l1 border border-outline-variant/40 flex items-center justify-center text-outline hover:text-primary-container hover:border-primary-container/40 transition-all active:scale-95 disabled:opacity-40" title="Sync Gmail receipts">
            <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`} style={{ fontSize: 16, animationDuration: '1s' }}>sync</span>
          </button>
          <button onClick={() => { setEditMode(e => !e); setSelectedIds(new Set()) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all active:scale-95 ${editMode ? 'bg-primary-container/20 text-primary-container border-primary-container/30' : 'glass-l1 border-outline-variant/40 text-on-surface-variant hover:border-primary-container/40'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{editMode ? 'check' : 'edit'}</span>
            {editMode ? 'Done' : 'Edit'}
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all active:scale-95">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            Add Receipt
          </button>
        </div>
      </div>

      {/* Summary + sync status */}
      {!loading && (
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-on-surface-variant font-sans">
            <span className="text-on-surface font-semibold">{groups.length}</span> {groups.length === 1 ? 'company' : 'companies'} &nbsp;·&nbsp;
            <span className="text-on-surface font-semibold">{filtered.length}</span> receipt{filtered.length !== 1 ? 's' : ''}
            {totalSpend > 0 && <> &nbsp;·&nbsp; <span className="text-on-surface font-semibold">{formatAmount(totalSpend)}</span> total</>}
            {emailsScanned > filtered.length && (
              <span className="text-outline"> &nbsp;·&nbsp; {emailsScanned.toLocaleString()} emails scanned</span>
            )}
          </p>
          <p className="text-[11px] text-outline font-sans">
            Your Gmail is scanned for receipts and invoices — amounts, dates, and categories extracted by AI and grouped by merchant.
          </p>
        </div>
      )}

      {syncStatus && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-sans border ${syncStatus.type === 'error' ? 'bg-error/10 border-error/30 text-error' : syncStatus.type === 'done' ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' : 'glass-l1 border-outline-variant/40 text-on-surface-variant'}`}>
          {syncing && <div className="w-3 h-3 rounded-full liquid-neon animate-spin shrink-0" style={{ animationDuration: '1s' }} />}
          {syncStatus.type === 'error' && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>error</span>}
          {syncStatus.type === 'done'  && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>check_circle</span>}
          {syncStatus.message}
        </div>
      )}

      {/* Empty state info card */}
      {!loading && receipts.length === 0 && !syncing && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-highest/10 p-6 flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-container/15 border border-primary-container/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 20 }}>receipt_long</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface mb-1">Automatically track your spending from Gmail</p>
              <p className="text-xs text-on-surface-variant font-sans leading-relaxed">
                Receipts, invoices, and purchase confirmations are pulled from your inbox, parsed by AI, and grouped by merchant — so you always know where your money went.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: 'mail', step: '1', title: 'Connect your Gmail', body: 'Sign in with Google — the app gets read-only access to scan your inbox for receipts and invoices.' },
              { icon: 'auto_awesome', step: '2', title: 'AI does the work', body: 'Purchase amounts, dates, and categories are extracted automatically and grouped by merchant.' },
              { icon: 'sync', step: '3', title: 'Hit Sync', body: 'Click Sync above to start. Re-sync anytime — only new emails since the last run are processed.' },
            ].map(({ icon, step, title, body }) => (
              <div key={step} className="flex gap-3 p-3.5 rounded-lg bg-surface-container-highest/20 border border-outline-variant/20">
                <div className="w-7 h-7 rounded-lg bg-primary-container/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 15 }}>{icon}</span>
                </div>
                <div>
                  <p className="text-[10px] font-display font-bold uppercase tracking-widest text-outline mb-0.5">Step {step}</p>
                  <p className="text-xs font-semibold text-on-surface mb-0.5">{title}</p>
                  <p className="text-[11px] text-on-surface-variant font-sans leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 py-10 text-on-surface-variant text-sm">
          <div className="w-4 h-4 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />Loading…
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          <div className={`min-w-0 flex flex-col gap-4 transition-all duration-300 ${selectedGroup ? 'flex-[3]' : 'flex-1'}`}>
            <DataTable
              columns={COLS}
              rows={groups}
              editMode={editMode}
              selectedId={selectedGroup?.id}
              onRowClick={g => setSelected(g.id === selectedGroup?.id ? null : g)}
              onSelectionChange={setSelectedIds}
              defaultSortKey="total"
              defaultSortDir="desc"
              emptyMessage={receipts.length === 0 ? 'No receipts yet. Sync from Gmail or add one manually.' : 'No receipts match your filters.'}
              emptyIcon="receipt_long"
            />
          </div>

          {selectedGroup && (
            <div className="flex-[2] glass-l1 rounded-xl sticky top-20 h-[calc(100vh-6rem)] overflow-hidden flex flex-col min-h-0">
              <ReceiptGroupPanel
                key={selectedGroup.id}
                group={selectedGroup}
                onClose={() => setSelected(null)}
                onReceiptUpdate={updated => setReceipts(p => p.map(r => r.id === updated.id ? updated : r))}
                onReceiptDelete={id => {
                  setReceipts(p => p.filter(r => r.id !== id))
                  // Close panel if group becomes empty
                  const remaining = selectedGroup.receipts.filter(r => r.id !== id)
                  if (remaining.length === 0) setSelected(null)
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Add modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAddModal(false)} />
          <div className="relative glass-l1 rounded-2xl p-6 w-full max-w-lg flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base text-on-surface">Add Receipt</h2>
              <button onClick={() => setAddModal(false)} className="material-symbols-outlined text-outline hover:text-on-surface" style={{ fontSize: 18 }}>close</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[{ key: 'company', label: 'Company' }, { key: 'description', label: 'Description' }].map(({ key, label }) => (
                <div key={key}>
                  <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">{label}</label>
                  <input value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all" />
                </div>
              ))}
              <div>
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Amount ($)</label>
                <input type="number" step="0.01" min="0" value={form.amount ?? ''} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all" />
              </div>
              <div>
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Date</label>
                <input type="date" value={form.date ?? ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all [color-scheme:dark]" />
              </div>
              <div>
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Notes</label>
                <input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAddModal(false)}
                className="px-4 py-2 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] text-outline border border-outline-variant/40 hover:bg-primary-container/5 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] bg-primary-container text-on-primary-container hover:opacity-90 transition-all disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
