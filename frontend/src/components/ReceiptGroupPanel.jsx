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
  if (!raw) return ''
  const d = new Date(raw)
  return isNaN(d) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(n) {
  if (n == null || n === '' || isNaN(Number(n))) return null
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function CategoryBadge({ category }) {
  const color = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.Other
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-widest border shrink-0"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 25%, transparent)` }}>
      {category}
    </span>
  )
}

function dedupeReceipts(raw) {
  // Step 1: drop zero / no-amount entries
  const withAmount = raw.filter(r => {
    const n = Number(r.amount)
    return !isNaN(n) && n > 0
  })

  // Step 2: deduplicate by (amount + date).
  // When two receipts share the same amount+date, prefer the one with a gmail link.
  const seen = new Map()
  for (const r of withAmount) {
    const amtKey  = Number(r.amount).toFixed(2)
    const dateKey = r.date ? r.date.slice(0, 10) : 'nodate'
    const key     = `${amtKey}_${dateKey}`

    if (!seen.has(key)) {
      seen.set(key, r)
    } else {
      // Prefer the entry that has a Gmail link
      if (!seen.get(key).gmail_message_id && r.gmail_message_id) {
        seen.set(key, r)
      }
    }
  }

  // Step 3: sort newest first
  return [...seen.values()].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date) - new Date(a.date)
  })
}

export default function ReceiptGroupPanel({ group, onClose }) {
  const allReceipts = group.receipts
  const receipts    = dedupeReceipts(allReceipts)

  const hiddenCount = allReceipts.length - receipts.length

  // All Gmail-linked emails sorted newest first (for the emails section)
  const emailLinks = [...allReceipts]
    .filter(r => r.gmail_message_id)
    .sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date) - new Date(a.date)
    })

  const amounts = receipts.map(r => Number(r.amount)).filter(n => !isNaN(n) && n > 0)
  const total   = amounts.reduce((s, n) => s + n, 0)
  const avg     = amounts.length > 0 ? total / amounts.length : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-outline-variant/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-container/20 border border-primary-container/30 flex items-center justify-center font-display font-bold text-primary-container text-sm">
            {(group.company ?? '??').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display font-semibold text-base text-on-surface leading-tight">{group.company}</h2>
            <p className="text-xs text-on-surface-variant font-sans">
              {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
              {hiddenCount > 0 && <span className="text-outline"> · {hiddenCount} hidden</span>}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="material-symbols-outlined text-outline hover:text-on-surface transition-colors text-xl">close</button>
      </div>

      {/* Summary stats */}
      <div className="px-5 py-3 border-b border-outline-variant/40 shrink-0 grid grid-cols-2 gap-3">
        <div>
          <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Total Spent</p>
          <p className="font-display font-semibold text-xl text-on-surface">{total > 0 ? formatAmount(total) : '—'}</p>
        </div>
        <div>
          <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">Avg per Purchase</p>
          <p className="font-display font-semibold text-xl text-on-surface">{avg ? formatAmount(avg) : '—'}</p>
        </div>
      </div>

      {/* Receipt list */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2">
        <p className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant mb-1">
          Receipts ({receipts.length}{hiddenCount > 0 ? ` · ${hiddenCount} no-amount/duplicate hidden` : ''})
        </p>
        {receipts.map((r, i) => {
          const gmailUrl = r.gmail_message_id
            ? `https://mail.google.com/mail/u/0/#all/${r.gmail_message_id}`
            : null
          const amount = formatAmount(r.amount)
          const desc = r.description && !r.description.startsWith('Gmail:') ? r.description : null

          const content = (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-on-surface tabular-nums">
                  {amount}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CategoryBadge category={r.category ?? 'Other'} />
                  {gmailUrl && (
                    <span className="material-symbols-outlined text-outline opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: 13 }}>open_in_new</span>
                  )}
                </div>
              </div>
              {desc && <p className="text-xs text-on-surface-variant font-sans truncate">{desc}</p>}
              {r.date && <p className="text-[11px] text-outline font-sans mt-0.5">{formatDate(r.date)}</p>}
            </>
          )

          return gmailUrl ? (
            <a key={r.id ?? i} href={gmailUrl} target="_blank" rel="noopener noreferrer"
              className="glass-l1 rounded-lg p-3 block hover:bg-white/5 transition-colors group">
              {content}
            </a>
          ) : (
            <div key={r.id ?? i} className="glass-l1 rounded-lg p-3">
              {content}
            </div>
          )
        })}

        {/* All email links — includes no-amount and duplicates */}
        {emailLinks.length > 0 && (
          <>
            <div className="border-t border-outline-variant/30 mt-1 pt-3">
              <p className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant mb-2">
                Emails ({emailLinks.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {emailLinks.map((r, i) => {
                  const amt    = Number(r.amount)
                  const hasAmt = !isNaN(amt) && amt > 0
                  const desc   = r.description && !r.description.startsWith('Gmail:') ? r.description : null
                  return (
                    <a key={r.id ?? i}
                      href={`https://mail.google.com/mail/u/0/#all/${r.gmail_message_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-outline group-hover:text-primary-container transition-colors shrink-0" style={{ fontSize: 14 }}>mail</span>
                        <span className="text-xs text-on-surface-variant font-sans truncate">
                          {desc ?? formatDate(r.date) ?? '(no description)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasAmt && (
                          <span className="text-xs font-semibold text-on-surface tabular-nums">{formatAmount(amt)}</span>
                        )}
                        <span className="text-[11px] text-outline font-sans">{formatDate(r.date)}</span>
                        <span className="material-symbols-outlined text-outline opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: 12 }}>open_in_new</span>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
