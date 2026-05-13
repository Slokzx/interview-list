import { DataTable, Chip } from '../ui'

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
  {
    key: 'company', label: 'Company', sortable: true,
    sortValue: co => (co.company ?? '').toLowerCase(),
    render: co => (
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-md bg-primary-container/20 border border-primary-container/20 flex items-center justify-center font-display font-bold text-[10px] text-primary-container shrink-0">
          {(co.company ?? '?').slice(0, 2).toUpperCase()}
        </div>
        <span className="font-medium text-on-surface truncate max-w-[100px]">{co.company}</span>
        {co.referred && (
          <span className="material-symbols-outlined text-emerald-400 shrink-0" style={{ fontSize: 13 }} title="Referred">volunteer_activism</span>
        )}
      </div>
    ),
  },
  { key: 'role', label: 'Role', sortable: true, className: 'text-on-surface max-w-[120px] truncate' },
  { key: 'recruiter_name', label: 'Recruiter', sortable: true, className: 'text-on-surface whitespace-nowrap',
    render: co => co.recruiter_name ?? '—' },
  {
    key: 'recruiter_email', label: 'Recruiter Email', sortable: true,
    className: 'text-on-surface max-w-[160px] truncate',
    render: co => co.recruiter_email
      ? <a href={`mailto:${co.recruiter_email}`} onClick={e => e.stopPropagation()} className="hover:text-primary transition-colors">{co.recruiter_email}</a>
      : '—',
  },
  {
    key: 'stage', label: 'Stage', sortable: true,
    sortValue: co => STAGES.indexOf(co.stage),
    render: co => <Chip color={STAGE_COLOR[co.stage] ?? 'outline'}>{co.stage}</Chip>,
  },
  {
    key: 'last_email_date', label: 'Last Email', sortable: true,
    sortValue: co => co.last_email_date ? new Date(co.last_email_date).getTime() : -Infinity,
    render: co => <span className="text-on-surface whitespace-nowrap">{formatDate(co.last_email_date)}</span>,
  },
  {
    key: 'applied_date', label: 'Applied', sortable: true,
    sortValue: co => co.applied_date ? new Date(co.applied_date).getTime() : -Infinity,
    render: co => <span className="text-on-surface whitespace-nowrap">{formatDate(co.applied_date)}</span>,
  },
  { key: 'interview_count', label: 'Interviews', sortable: true,
    sortValue: co => co.interview_count ?? 0,
    className: 'text-center text-on-surface',
    render: co => co.interview_count ?? 0 },
  { key: 'email_count', label: 'Emails', sortable: true,
    sortValue: co => co.email_count ?? 0,
    className: 'text-center text-on-surface',
    render: co => co.email_count ?? 0 },
  { key: 'industry', label: 'Industry', sortable: true, className: 'text-on-surface max-w-[120px] truncate' },
  {
    key: 'company_size', label: 'Size', sortable: true,
    className: 'text-on-surface max-w-[140px] truncate',
    render: co => co.company_size
      ? co.company_size.replace(/\bemployees\b/gi, '').replace(/\s{2,}/g, ' ').trim()
      : '—',
  },
]

export default function CompanyTable({ companies, selectedId, onSelect, onSelectionChange, editMode = false }) {
  return (
    <DataTable
      columns={COLS}
      rows={companies}
      editMode={editMode}
      selectedId={selectedId}
      onRowClick={co => onSelect(co.id === selectedId ? null : co)}
      onSelectionChange={onSelectionChange}
      defaultSortKey="last_email_date"
      defaultSortDir="desc"
      emptyMessage="No companies match your filters."
      emptyIcon="inbox"
    />
  )
}
