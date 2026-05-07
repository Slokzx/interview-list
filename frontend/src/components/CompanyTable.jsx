import { useState, useMemo } from 'react'
import { Chip } from '../ui'

const STAGE_COLOR = {
  'Applied':      'primary',
  'Phone Screen': 'warning',
  'Technical':    'secondary',
  'Onsite':       'tertiary',
  'Offer':        'success',
  'Rejected':     'error',
}

const STAGES = ['Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected']

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const COLS = [
  { key: 'company',                    label: 'Company',         sortable: true },
  { key: 'role',                       label: 'Role',            sortable: true },
  { key: 'recruiter_name',             label: 'Recruiter',       sortable: true },
  { key: 'recruiter_email',            label: 'Recruiter Email', sortable: true },
  { key: 'stage',                      label: 'Stage',           sortable: true },
  { key: 'last_email_date',            label: 'Last Email',      sortable: true },
  { key: 'applied_date',               label: 'Applied',         sortable: true },
  { key: 'interview_count',            label: 'Interviews',      sortable: true },
  { key: 'email_count',                label: 'Emails',          sortable: true },
  { key: 'industry',                   label: 'Industry',        sortable: true },
  { key: 'company_size',               label: 'Size',            sortable: true },
]

function sortValue(co, key) {
  switch (key) {
    case 'stage':                     return STAGES.indexOf(co.stage)
    case 'last_email_date':
    case 'applied_date':
    case 'first_recruiter_call_date': return co[key] ? new Date(co[key]).getTime() : -Infinity
    case 'interview_count':
    case 'email_count':               return co[key] ?? 0
    default:                          return (co[key] ?? '').toString().toLowerCase()
  }
}

function SortIcon({ dir }) {
  if (!dir) return <span className="material-symbols-outlined text-outline/50" style={{ fontSize: 12 }}>unfold_more</span>
  return <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 12 }}>
    {dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
  </span>
}

// companies = already filtered by parent; total = unfiltered count for "X of Y"
export default function CompanyTable({ companies, total, selectedId, onSelect, onSelectionChange }) {
  const [sortKey, setSortKey] = useState('last_email_date')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(new Set())

  function handleSort(key) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key); setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return companies
    return [...companies].sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [companies, sortKey, sortDir])

  function toggleRow(e, id) {
    e.stopPropagation()
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next); onSelectionChange?.(next)
  }

  function toggleAll(e) {
    e.stopPropagation()
    if (selected.size === sorted.length) {
      setSelected(new Set()); onSelectionChange?.(new Set())
    } else {
      const next = new Set(sorted.map((c) => c.id))
      setSelected(next); onSelectionChange?.(next)
    }
  }

  const allChecked  = sorted.length > 0 && selected.size === sorted.length
  const someChecked = selected.size > 0 && selected.size < sorted.length

  if (!companies.length) {
    return (
      <div className="glass-l1 rounded-xl p-12 text-center">
        <span className="material-symbols-outlined text-4xl text-outline mb-3 block">inbox</span>
        <p className="text-on-surface text-sm font-sans">No companies match your filters.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="glass-l2 rounded-lg px-3 py-1.5 flex items-center gap-3 border border-primary-container/20">
          <span className="text-xs font-display font-bold uppercase tracking-widest text-primary-container">
            {selected.size} selected
          </span>
          <button
            onClick={() => { setSelected(new Set()); onSelectionChange?.(new Set()) }}
            className="text-xs text-outline hover:text-on-surface font-sans transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="glass-l1 rounded-xl overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
          <table className="w-full text-sm font-sans min-w-max">
            <thead>
              <tr className="border-b-2 border-outline-variant sticky top-0 z-10 bg-table-header backdrop-blur-sm">
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => el && (el.indeterminate = someChecked)}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded accent-cyan-400 cursor-pointer"
                  />
                </th>
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`text-left px-2 py-2 font-display font-bold uppercase tracking-widest text-[10px] text-on-surface whitespace-nowrap select-none ${col.sortable ? 'cursor-pointer hover:text-on-surface' : ''}`}
                  >
                    <div className="flex items-center gap-0.5">
                      {col.label}
                      {col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : null} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((co, i) => {
                const isPanelOpen = co.id === selectedId
                const isChecked   = selected.has(co.id)
                return (
                  <tr
                    key={co.id}
                    onClick={() => onSelect(isPanelOpen ? null : co)}
                    className={`cursor-pointer transition-colors text-xs ${
                      i < sorted.length - 1 ? 'border-b border-outline-variant' : ''
                    } ${isPanelOpen ? 'bg-primary-container/10' : isChecked ? 'bg-primary-container/5' : 'hover:bg-primary-container/5'}`}
                  >
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isChecked} onChange={(e) => toggleRow(e, co.id)}
                        className="w-3.5 h-3.5 rounded accent-cyan-400 cursor-pointer" />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-md bg-primary-container/20 border border-primary-container/20 flex items-center justify-center font-display font-bold text-[10px] text-primary-container shrink-0">
                          {(co.company ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-on-surface truncate max-w-[100px]">{co.company}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-on-surface max-w-[120px] truncate">{co.role ?? '—'}</td>
                    <td className="px-2 py-2 text-on-surface whitespace-nowrap">{co.recruiter_name ?? '—'}</td>
                    <td className="px-2 py-2 text-on-surface whitespace-nowrap max-w-[160px] truncate">
                      {co.recruiter_email
                        ? <a href={`mailto:${co.recruiter_email}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary transition-colors">{co.recruiter_email}</a>
                        : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <Chip color={STAGE_COLOR[co.stage] ?? 'outline'}>{co.stage}</Chip>
                    </td>
                    <td className="px-2 py-2 text-on-surface whitespace-nowrap">{formatDate(co.last_email_date)}</td>
                    <td className="px-2 py-2 text-on-surface whitespace-nowrap">{formatDate(co.applied_date)}</td>
                    <td className="px-2 py-2 text-center text-on-surface">{co.interview_count ?? 0}</td>
                    <td className="px-2 py-2 text-center text-on-surface">{co.email_count ?? 0}</td>
                    <td className="px-2 py-2 text-on-surface whitespace-nowrap max-w-[120px] truncate">{co.industry ?? '—'}</td>
                    <td className="px-2 py-2 text-on-surface whitespace-nowrap max-w-[140px] truncate">
                      {co.company_size ? co.company_size.replace(/\bemployees\b/gi, '').replace(/\s{2,}/g, ' ').trim() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
