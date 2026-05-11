import { useState } from 'react'
import { updateApplication } from '../lib/api'
import { Chip } from '../ui'
import CompanyInterviewChart from './CompanyInterviewChart'

const STAGE_COLOR = {
  'Applied':      'primary',
  'Phone Screen': 'warning',
  'Technical':    'secondary',
  'Onsite':       'tertiary',
  'Offer':        'success',
  'Rejected':     'error',
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  return isNaN(d) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatEmailDate(raw) {
  if (!raw) return ''
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '')
  const d = new Date(cleaned)
  return isNaN(d) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFrom(from = '') {
  if (!from) return '—'
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</)
  if (nameMatch) return nameMatch[1].trim()
  const emailMatch = from.match(/([^@<\s]+)@/)
  if (emailMatch) return emailMatch[1]
  return from
}

export default function CompanyPanel({ company, onClose, onUpdate }) {
  const [companySize, setCompanySize] = useState(company.company_size ?? '')
  const [referred, setReferred]       = useState(company.referred ?? false)
  const [saving, setSaving]           = useState(false)
  const [tab, setTab]                 = useState('details') // 'details' | 'timeline'

  const emails = Array.isArray(company.raw_emails) ? company.raw_emails : []

  async function handleSizeBlur() {
    if (companySize === (company.company_size ?? '')) return
    setSaving(true)
    await updateApplication(company.id, { company_size: companySize })
    onUpdate({ ...company, company_size: companySize })
    setSaving(false)
  }

  async function handleToggleReferred() {
    const next = !referred
    setReferred(next)
    await updateApplication(company.id, { referred: next })
    onUpdate({ ...company, referred: next })
  }

  const details = [
    { label: 'Role',             value: company.role ?? '—' },
    { label: 'Recruiter',        value: company.recruiter_name ?? '—' },
    { label: 'Recruiter Email',  value: company.recruiter_email
        ? <a href={`mailto:${company.recruiter_email}`} className="text-primary hover:underline break-all">{company.recruiter_email}</a>
        : '—',
      span: true },
    { label: 'Applied',          value: formatDate(company.applied_date) },
    { label: 'First Call',       value: formatDate(company.first_recruiter_call_date) },
    { label: 'Interviews',       value: company.interview_count ?? 0 },
    { label: 'Emails',           value: company.email_count ?? emails.length },
    { label: 'Industry',         value: company.industry ?? '—' },
    { label: 'Size',             value: companySize || '—', editable: true },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-outline-variant/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-container/20 border border-primary-container/30 flex items-center justify-center font-display font-bold text-primary-container text-sm">
            {(company.company ?? '??').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display font-semibold text-base text-on-surface leading-tight">
              {company.company}
            </h2>
            <p className="text-xs text-on-surface-variant font-sans">{company.company_domain}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="material-symbols-outlined text-outline hover:text-on-surface transition-colors text-xl"
        >
          close
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-outline-variant/40 shrink-0 px-5">
        {[
          { key: 'details',  label: 'Details',  icon: 'info' },
          { key: 'timeline', label: 'Timeline', icon: 'bar_chart' },
        ].map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 font-display font-bold uppercase tracking-widest text-[10px] border-b-2 transition-all -mb-px ${
              tab === key
                ? 'border-primary-container text-primary-container'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

        {tab === 'timeline' && (
          <>
            {/* Stage + Referred — always visible for context */}
            <div className="flex items-center gap-2 flex-wrap">
              <Chip color={STAGE_COLOR[company.stage] ?? 'outline'} icon="circle">
                {company.stage}
              </Chip>
              <button
                onClick={handleToggleReferred}
                title={referred ? 'Remove referral flag' : 'Mark as referred'}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-widest border transition-all ${
                  referred
                    ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30 hover:bg-emerald-400/25'
                    : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                  {referred ? 'volunteer_activism' : 'add'}
                </span>
                {referred ? 'Referred' : 'Referral'}
              </button>
            </div>
            <CompanyInterviewChart company={company} />
          </>
        )}

        {tab === 'details' && <>

        {/* Stage + Referred */}
        <div className="flex items-center gap-2 flex-wrap">
          <Chip color={STAGE_COLOR[company.stage] ?? 'outline'} icon="circle">
            {company.stage}
          </Chip>
          <button
            onClick={handleToggleReferred}
            title={referred ? 'Remove referral flag' : 'Mark as referred'}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-widest border transition-all ${
              referred
                ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30 hover:bg-emerald-400/25'
                : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
              {referred ? 'volunteer_activism' : 'add'}
            </span>
            {referred ? 'Referred' : 'Referral'}
          </button>
          {company.last_synced_at && (
            <span className="text-[10px] text-outline font-display uppercase tracking-widest">
              synced {formatDate(company.last_synced_at)}
            </span>
          )}
        </div>

        {/* Detail grid */}
        <div className="glass-l1 rounded-xl p-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {details.map(({ label, value, span, editable }) => (
            <div key={label} className={span ? 'col-span-2' : ''}>
              <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-0.5">
                {label}{editable && saving && <span className="text-primary ml-1 normal-case tracking-normal font-sans font-normal">saving…</span>}
              </p>
              {editable
                ? <input
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    onBlur={handleSizeBlur}
                    placeholder="e.g. 500–2,000, Series C…"
                    className="w-full bg-surface-container-highest/20 border border-outline-variant/50 focus:border-primary focus:outline-none text-on-surface font-sans text-sm px-2 py-1 rounded-md transition-all placeholder:text-outline/40"
                  />
                : <p className="text-sm text-on-surface font-sans">{value}</p>
              }
            </div>
          ))}
        </div>

        {/* Email thread */}
        <div>
          <p className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant mb-3">
            Emails ({emails.length})
          </p>
          {emails.length === 0 ? (
            <p className="text-xs text-outline font-sans">No emails stored.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {emails.map((email, i) => (
                <a
                  key={email.id ?? i}
                  href={email.id ? `https://mail.google.com/mail/u/0/#all/${email.id}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-l1 rounded-lg p-3 block hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-xs font-medium text-on-surface font-sans truncate">
                      {formatFrom(email.from)}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-outline font-sans">
                        {formatEmailDate(email.date)}
                      </span>
                      <span className="material-symbols-outlined text-outline opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: 13 }}>open_in_new</span>
                    </div>
                  </div>
                  <p className="text-xs font-display font-medium text-on-surface-variant truncate">
                    {email.subject}
                  </p>
                  {email.snippet && (
                    <p className="text-xs text-outline font-sans mt-1">
                      {email.snippet}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        </>}
      </div>
    </div>
  )
}
