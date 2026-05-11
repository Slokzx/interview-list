import { useState } from 'react'
import { updateResearch, deleteResearch } from '../lib/api'
import { Chip } from '../ui'

const STATUSES = ['Not Started', 'In Progress', 'Ready']
const ROUNDS   = ['General', 'Phone Screen', 'Technical', 'Onsite', 'Other']

const STATUS_COLOR = {
  'Not Started': 'outline',
  'In Progress': 'warning',
  'Ready':       'primary',
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ResearchPanel({ entry, onClose, onUpdate, onDelete }) {
  const [form, setForm]     = useState({ ...entry })
  const [saving, setSaving] = useState(false)

  async function handleBlur(field) {
    if (form[field] === entry[field]) return
    setSaving(true)
    try {
      const res = await updateResearch(entry.id, { [field]: form[field] })
      onUpdate(res.data)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this research entry?')) return
    await deleteResearch(entry.id)
    onDelete(entry.id)
  }

  const field = (key, label, opts = {}) => (
    <div className={opts.span ? 'col-span-2' : ''}>
      <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">{label}</p>
      {opts.textarea
        ? <textarea value={form[key] ?? ''} rows={3}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            onBlur={() => handleBlur(key)}
            className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all resize-none" />
        : opts.select
          ? <select value={form[key] ?? ''} onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setTimeout(() => handleBlur(key), 0) }}
              className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all">
              {opts.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          : <input value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              onBlur={() => handleBlur(key)}
              className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all" />
      }
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-outline-variant/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-container/20 border border-primary-container/30 flex items-center justify-center font-display font-bold text-primary-container text-sm">
            {(entry.company ?? '??').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display font-semibold text-base text-on-surface leading-tight">{entry.company || '(no company)'}</h2>
            <p className="text-xs text-on-surface-variant font-sans">{entry.role || 'No role specified'}</p>
          </div>
        </div>
        <button onClick={onClose} className="material-symbols-outlined text-outline hover:text-on-surface transition-colors text-xl">close</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

        {/* Status + added */}
        <div className="flex items-center gap-2">
          <Chip color={STATUS_COLOR[entry.status] ?? 'outline'}>{entry.status}</Chip>
          <span className="text-[10px] text-outline font-display uppercase tracking-widest">added {formatDate(entry.created_at)}</span>
          {saving && <span className="text-[10px] text-primary font-display ml-auto">saving…</span>}
        </div>

        {/* Editable fields */}
        <div className="glass-l1 rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {field('company',         'Company')}
          {field('role',            'Role')}
          {field('interview_round', 'Round',  { select: true, options: ROUNDS })}
          {field('status',          'Status', { select: true, options: STATUSES })}
          {field('topics',          'Topics to Study', { span: true })}
          {field('notes',           'Notes',           { span: true, textarea: true })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-outline-variant/40 shrink-0">
        <button onClick={handleDelete}
          className="flex items-center gap-1.5 text-xs text-error hover:text-error/80 font-sans transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          Delete entry
        </button>
      </div>
    </div>
  )
}
