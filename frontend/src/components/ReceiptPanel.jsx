import { useState } from 'react'
import { updateReceipt, deleteReceipt } from '../lib/api'

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
  return isNaN(d) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(n) {
  if (n == null || n === '') return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ReceiptPanel({ receipt, onClose, onUpdate, onDelete }) {
  const [form, setForm]     = useState({ ...receipt, date: receipt.date?.slice(0, 10) ?? '' })
  const [saving, setSaving] = useState(false)

  async function handleBlur(field) {
    if (String(form[field] ?? '') === String(receipt[field] ?? '')) return
    setSaving(true)
    try {
      const res = await updateReceipt(receipt.id, { [field]: form[field] })
      onUpdate(res.data)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this receipt?')) return
    await deleteReceipt(receipt.id)
    onDelete(receipt.id)
  }

  const color = CATEGORY_COLOR[receipt.category] ?? CATEGORY_COLOR.Other

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-outline-variant/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-container/20 border border-primary-container/30 flex items-center justify-center font-display font-bold text-primary-container text-sm">
            {(receipt.company ?? '??').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display font-semibold text-base text-on-surface leading-tight">{receipt.company || '(no company)'}</h2>
            <p className="text-xs text-on-surface-variant font-sans">{receipt.description || formatDate(receipt.date)}</p>
          </div>
        </div>
        <button onClick={onClose} className="material-symbols-outlined text-outline hover:text-on-surface transition-colors text-xl">close</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

        {/* Amount + category badge */}
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-2xl text-on-surface">{formatAmount(receipt.amount)}</span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-widest border"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
            }}>
            {receipt.category ?? 'Other'}
          </span>
          {saving && <span className="text-[10px] text-primary font-display ml-auto">saving…</span>}
        </div>

        {/* Editable fields */}
        <div className="glass-l1 rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            { key: 'company',     label: 'Company' },
            { key: 'description', label: 'Description' },
          ].map(({ key, label }) => (
            <div key={key}>
              <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">{label}</p>
              <input value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                onBlur={() => handleBlur(key)}
                className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all" />
            </div>
          ))}

          <div>
            <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Amount ($)</p>
            <input type="number" step="0.01" min="0" value={form.amount ?? ''}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              onBlur={() => handleBlur('amount')}
              className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all" />
          </div>

          <div>
            <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Category</p>
            <select value={form.category ?? 'Other'}
              onChange={e => { setForm(f => ({ ...f, category: e.target.value })); setTimeout(() => handleBlur('category'), 0) }}
              className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Date</p>
            <input type="date" value={form.date ?? ''}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              onBlur={() => handleBlur('date')}
              className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all [color-scheme:dark]" />
          </div>

          <div>
            <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Notes</p>
            <input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              onBlur={() => handleBlur('notes')}
              className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all" />
          </div>

          {receipt.gmail_message_id && (
            <div className="col-span-2">
              <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Source</p>
              <p className="text-xs text-outline font-sans truncate">{receipt.notes || 'Synced from Gmail'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-outline-variant/40 shrink-0">
        <button onClick={handleDelete}
          className="flex items-center gap-1.5 text-xs text-error hover:text-error/80 font-sans transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
          Delete receipt
        </button>
      </div>
    </div>
  )
}
