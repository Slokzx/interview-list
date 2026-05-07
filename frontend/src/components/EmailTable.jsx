import { useState } from 'react'
import { useGmailEmails } from '../hooks/useGmailEmails'

function formatFrom(from = '') {
  if (!from) return '—'
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</)
  if (nameMatch) return nameMatch[1].trim()
  const emailMatch = from.match(/([^@<\s]+)@/)
  if (emailMatch) return emailMatch[1]
  return from
}

function formatDate(raw = '') {
  if (!raw) return '—'
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '')
  const d = new Date(cleaned)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const SYSTEM_LABELS = [
  { id: 'ALL',   name: 'All Mail', icon: 'all_inbox' },
  { id: 'INBOX', name: 'Inbox',    icon: 'inbox' },
  { id: 'SENT',  name: 'Sent',     icon: 'send' },
  { id: 'TRASH', name: 'Trash',    icon: 'delete' },
]

export default function EmailTable() {
  const [activeLabel, setActiveLabel] = useState('ALL')
  const { emails, loading, loadingMore, error, hasMore, loadMore, userLabels, changeLabel } =
    useGmailEmails('ALL')

  function handleLabelClick(id) {
    setActiveLabel(id)
    changeLabel(id)
  }

  const allTabs = [
    ...SYSTEM_LABELS,
    ...userLabels.map((l) => ({ id: l.id, name: l.name, icon: 'label' })),
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* Label tabs */}
      <div className="flex gap-1 flex-wrap">
        {allTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleLabelClick(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[11px] transition-all duration-200 border ${
              activeLabel === tab.id
                ? 'bg-primary-container/20 text-primary-container border-primary-container/30'
                : 'text-on-surface-variant border-outline-variant/40 hover:text-on-surface hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{tab.icon}</span>
            {tab.name}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-l1 rounded-xl p-4 border border-error/30 text-error text-sm font-sans flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-3 py-10 text-on-surface-variant text-sm font-sans">
          <div className="w-4 h-4 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />
          Fetching emails…
        </div>
      ) : emails.length === 0 ? (
        <p className="text-on-surface-variant text-sm font-sans py-8">No emails found.</p>
      ) : (
        <>
          <div className="glass-l1 rounded-xl overflow-hidden">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b border-outline-variant">
                  {['From', 'Subject', 'Preview', 'Date'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emails.map((email, i) => (
                  <tr
                    key={email.id}
                    className={`hover:bg-white/5 transition-colors ${
                      i < emails.length - 1 ? 'border-b border-outline-variant/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-on-surface font-medium whitespace-nowrap max-w-[160px] truncate">
                      {formatFrom(email.from)}
                    </td>
                    <td className="px-4 py-3 text-on-surface max-w-[220px] truncate">
                      {email.subject}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant max-w-[280px] truncate">
                      {email.snippet}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                      {formatDate(email.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant font-sans">
              Showing {emails.length} email{emails.length !== 1 ? 's' : ''}
            </span>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 glass-l1 rounded-lg font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant hover:text-primary-container border border-outline-variant/40 hover:border-primary-container/30 transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <div className="w-3 h-3 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />
                    Loading…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
                    Load 50 More
                  </>
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
