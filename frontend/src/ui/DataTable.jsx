import { useState, useEffect, useMemo } from 'react'

function SortIcon({ dir }) {
  if (!dir) return <span className="material-symbols-outlined text-outline/50" style={{ fontSize: 12 }}>unfold_more</span>
  return <span className="material-symbols-outlined text-primary-container" style={{ fontSize: 12 }}>{dir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
}

/**
 * Generic sortable, selectable table.
 *
 * columns: Array<{
 *   key: string,
 *   label: string,
 *   sortable?: boolean,
 *   className?: string,
 *   render?: (row) => ReactNode,
 *   sortValue?: (row) => any,   // custom sort key extractor
 * }>
 *
 * rows: objects with unique `id` field
 * editMode: when true, checkbox column is shown
 * selectedId: id of the currently open panel row (highlighted differently)
 * onRowClick(row): called on row click
 * onSelectionChange(Set<id>): called whenever checkbox selection changes
 * defaultSortKey / defaultSortDir: initial sort state
 */
export default function DataTable({
  columns,
  rows,
  editMode = false,
  selectedId,
  onRowClick,
  onSelectionChange,
  defaultSortKey,
  defaultSortDir = 'asc',
  emptyMessage = 'No items found.',
  emptyIcon = 'inbox',
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey ?? null)
  const [sortDir, setSortDir] = useState(defaultSortDir)
  const [selected, setSelected] = useState(new Set())

  // Clear selection when edit mode is turned off
  useEffect(() => {
    if (!editMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(new Set())
      onSelectionChange?.(new Set())
    }
  // onSelectionChange is a stable callback prop — intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode])

  function handleSort(key) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find(c => c.key === sortKey)
    return [...rows].sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : (a[sortKey] ?? '')
      const bv = col?.sortValue ? col.sortValue(b) : (b[sortKey] ?? '')
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, columns, sortKey, sortDir])

  const allChecked  = sorted.length > 0 && sorted.every(r => selected.has(r.id))
  const someChecked = selected.size > 0 && !allChecked

  function toggle(id) {
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
    onSelectionChange?.(n)
  }

  function toggleAll() {
    const n = allChecked ? new Set() : new Set(sorted.map(r => r.id))
    setSelected(n)
    onSelectionChange?.(n)
  }

  if (!rows.length) {
    return (
      <div className="glass-l1 rounded-xl p-12 text-center">
        <span className="material-symbols-outlined text-4xl text-outline mb-3 block">{emptyIcon}</span>
        <p className="text-on-surface text-sm font-sans">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="glass-l1 rounded-xl overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
        <table className="w-full text-sm font-sans min-w-max">
          <thead>
            <tr className="border-b-2 border-outline-variant sticky top-0 z-10 bg-table-header backdrop-blur-sm">
              {editMode && (
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" checked={allChecked}
                    ref={el => el && (el.indeterminate = someChecked)}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded accent-cyan-400 cursor-pointer" />
                </th>
              )}
              {columns.map(col => (
                <th key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`text-left px-2 py-2 font-display font-bold uppercase tracking-widest text-[10px] text-on-surface whitespace-nowrap select-none ${col.sortable ? 'cursor-pointer hover:text-on-surface' : ''} ${col.headerClassName ?? ''}`}>
                  <div className="flex items-center gap-0.5">
                    {col.label}
                    {col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : null} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const isPanelOpen = row.id === selectedId
              const isChecked   = selected.has(row.id)
              return (
                <tr key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={`cursor-pointer transition-colors text-xs ${i < sorted.length - 1 ? 'border-b border-outline-variant' : ''} ${isPanelOpen ? 'bg-primary-container/10' : isChecked ? 'bg-primary-container/5' : 'hover:bg-primary-container/5'}`}>
                  {editMode && (
                    <td className="px-2 py-2" onClick={e => { e.stopPropagation(); toggle(row.id) }}>
                      <input type="checkbox" checked={isChecked} onChange={() => {}}
                        className="w-3.5 h-3.5 rounded accent-cyan-400 cursor-pointer" />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={`px-2 py-2 ${col.className ?? ''}`}>
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
