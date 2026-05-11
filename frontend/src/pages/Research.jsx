import { useState, useEffect, useMemo } from 'react'
import { getResearch, createResearch, deleteResearch } from '../lib/api'
import { DataTable, Chip } from '../ui'
import ResearchPanel from '../components/ResearchPanel'

const STATUSES = ['Not Started', 'In Progress', 'Ready']
const ROUNDS   = ['General', 'Phone Screen', 'Technical', 'Onsite', 'Other']

const STATUS_COLOR = {
  'Not Started': 'outline',
  'In Progress': 'warning',
  'Ready':       'primary',
}

const COLS = [
  {
    key: 'company', label: 'Company', sortable: true,
    sortValue: e => (e.company ?? '').toLowerCase(),
    render: e => (
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-md bg-primary-container/20 border border-primary-container/20 flex items-center justify-center font-display font-bold text-[10px] text-primary-container shrink-0">
          {(e.company ?? '?').slice(0, 2).toUpperCase()}
        </div>
        <span className="font-medium text-on-surface truncate max-w-[100px]">{e.company || '—'}</span>
      </div>
    ),
  },
  { key: 'role',            label: 'Role',   sortable: true,  className: 'text-on-surface max-w-[120px] truncate' },
  { key: 'interview_round', label: 'Round',  sortable: true,  className: 'text-on-surface whitespace-nowrap' },
  { key: 'topics',          label: 'Topics', sortable: false, className: 'text-on-surface max-w-[200px] truncate' },
  {
    key: 'status', label: 'Status', sortable: true,
    sortValue: e => ['Not Started', 'In Progress', 'Ready'].indexOf(e.status),
    render: e => <Chip color={STATUS_COLOR[e.status] ?? 'outline'}>{e.status}</Chip>,
  },
  {
    key: 'created_at', label: 'Added', sortable: true,
    sortValue: e => e.created_at ? new Date(e.created_at).getTime() : -Infinity,
    render: e => {
      if (!e.created_at) return '—'
      const d = new Date(e.created_at)
      return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    },
  },
]

const EMPTY_FORM = { company: '', role: '', interview_round: 'General', topics: '', notes: '', status: 'Not Started' }

export default function Research() {
  const [entries, setEntries]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState(new Set())
  const [selected, setSelected]   = useState(null)
  const [editMode, setEditMode]   = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [addModal, setAddModal]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    getResearch()
      .then(r => setEntries(r.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let rows = entries
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        (r.company ?? '').toLowerCase().includes(q) ||
        (r.role ?? '').toLowerCase().includes(q) ||
        (r.topics ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter.size > 0) rows = rows.filter(r => statusFilter.has(r.status))
    return rows
  }, [entries, search, statusFilter])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await createResearch(form)
      setEntries(prev => [res.data, ...prev])
      setAddModal(false)
      setForm(EMPTY_FORM)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function handleDeleteSelected() {
    if (!window.confirm(`Delete ${selectedIds.size} entr${selectedIds.size === 1 ? 'y' : 'ies'}?`)) return
    await Promise.all([...selectedIds].map(id => deleteResearch(id)))
    setEntries(prev => prev.filter(e => !selectedIds.has(e.id)))
    if (selectedIds.has(selected?.id)) setSelected(null)
    setSelectedIds(new Set())
  }

  return (
    <main className="px-6 md:px-10 py-5 max-w-screen-2xl mx-auto flex flex-col gap-4">

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: 15 }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search company, role, topics…"
            className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm pl-8 pr-3 py-1.5 rounded-lg transition-all placeholder:text-outline/50 w-60" />
          {search && <button onClick={() => setSearch('')} className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface" style={{ fontSize: 13 }}>close</button>}
        </div>
        {STATUSES.map(s => (
          <button key={s}
            onClick={() => setStatusFilter(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })}
            className={`px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all ${statusFilter.has(s) ? 'bg-primary-container/20 text-primary-container border-primary-container/30' : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'}`}>
            {s}
          </button>
        ))}
        {(search || statusFilter.size > 0) && (
          <button onClick={() => { setSearch(''); setStatusFilter(new Set()) }}
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
          <button onClick={() => { setEditMode(e => !e); setSelectedIds(new Set()) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all active:scale-95 ${editMode ? 'bg-primary-container/20 text-primary-container border-primary-container/30' : 'glass-l1 border-outline-variant/40 text-on-surface-variant hover:border-primary-container/40'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{editMode ? 'check' : 'edit'}</span>
            {editMode ? 'Done' : 'Edit'}
          </button>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-display font-bold uppercase tracking-widest text-[10px] hover:opacity-90 transition-all active:scale-95">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            Add Entry
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && (
        <p className="text-sm text-on-surface-variant font-sans">
          <span className="text-on-surface font-semibold">{filtered.length}</span>
          {filtered.length !== entries.length && <span className="text-outline"> of {entries.length}</span>}
          {' '}{entries.length === 1 ? 'entry' : 'entries'}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-3 py-10 text-on-surface-variant text-sm">
          <div className="w-4 h-4 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />Loading…
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          <div className={`min-w-0 flex flex-col gap-4 transition-all duration-300 ${selected ? 'flex-[3]' : 'flex-1'}`}>
            <DataTable
              columns={COLS}
              rows={filtered}
              editMode={editMode}
              selectedId={selected?.id}
              onRowClick={e => setSelected(e.id === selected?.id ? null : e)}
              onSelectionChange={setSelectedIds}
              defaultSortKey="created_at"
              defaultSortDir="desc"
              emptyMessage="No research entries yet. Add one to get started."
              emptyIcon="science"
            />
          </div>

          {selected && (
            <div className="flex-[2] glass-l1 rounded-xl sticky top-20 h-[calc(100vh-6rem)] overflow-hidden flex flex-col min-h-0">
              <ResearchPanel
                entry={selected}
                onClose={() => setSelected(null)}
                onUpdate={updated => { setEntries(p => p.map(e => e.id === updated.id ? updated : e)); setSelected(updated) }}
                onDelete={id => { setEntries(p => p.filter(e => e.id !== id)); setSelected(null) }}
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
              <h2 className="font-display font-bold text-base text-on-surface">Add Research Entry</h2>
              <button onClick={() => setAddModal(false)} className="material-symbols-outlined text-outline hover:text-on-surface" style={{ fontSize: 18 }}>close</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[{ key: 'company', label: 'Company' }, { key: 'role', label: 'Role' }].map(({ key, label }) => (
                <div key={key}>
                  <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">{label}</label>
                  <input value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Topics to Study</label>
                <input value={form.topics ?? ''} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all" />
              </div>
              <div>
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Round</label>
                <select value={form.interview_round} onChange={e => setForm(f => ({ ...f, interview_round: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all">
                  {ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-3 py-2 rounded-lg transition-all">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
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
