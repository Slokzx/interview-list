import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getApplications, syncEmails, deleteApplication, enrichCompanies, backfillRecruiterEmails } from '../lib/api'
import CompanyTable from '../components/CompanyTable'
import CompanyPanel from '../components/CompanyPanel'
import StageChart from '../components/StageChart'

const STAGES = ['Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected']
const SIZE_TIERS = ['Startup', 'Small', 'Mid-size', 'Large', 'Enterprise']

// Scheduling proxies that send emails on behalf of recruiters
const PROXY_RE = /jobhire/i

function isViaProxy(company) {
  const emails = Array.isArray(company.raw_emails) ? company.raw_emails : []
  return emails.some(e => PROXY_RE.test(e.from ?? '')) ||
    PROXY_RE.test(company.company_domain ?? '') ||
    PROXY_RE.test(company.recruiter_email ?? '')
}

function bucketSize(raw) {
  if (!raw) return null
  const n = parseInt(raw.replace(/,/g, '').match(/(\d+)/)?.[1] ?? '', 10)
  if (isNaN(n)) return null
  if (n < 100)   return 'Startup'
  if (n < 500)   return 'Small'
  if (n < 2000)  return 'Mid-size'
  if (n < 10000) return 'Large'
  return 'Enterprise'
}

export default function Dashboard() {

  const [companies, setCompanies]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [selectedCompany, setSelected]  = useState(null)

  const [syncing, setSyncing]           = useState(false)
  const [syncStatus, setSyncStatus]     = useState(null)
  const [enriching, setEnriching]       = useState(false)
  const [enrichStatus, setEnrichStatus] = useState(null)
  const [selectedIds, setSelectedIds]   = useState(new Set())
  const [chartsOpen, setChartsOpen]     = useState(false)
  const [editMode, setEditMode]         = useState(false)

  // ── Filter state (lifted so charts react to filters) ────────
  const [search, setSearch]           = useState('')
  const [stageFilters, setStages]     = useState(new Set())
  const [sizeFilters, setSizeFilters] = useState(new Set())
  const [sizeOpen, setSizeOpen]       = useState(false)
  const [stageOpen, setStageOpen]     = useState(false)
  const [referredOnly, setReferredOnly]   = useState(false)
  const [viaProxyOnly, setViaProxyOnly]   = useState(false)
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')

  // ── Derived filtered list ────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = companies
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((c) =>
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.role ?? '').toLowerCase().includes(q) ||
        (c.recruiter_name ?? '').toLowerCase().includes(q)
      )
    }
    if (stageFilters.size > 0) rows = rows.filter((c) => stageFilters.has(c.stage))
    if (sizeFilters.size > 0)  rows = rows.filter((c) => sizeFilters.has(bucketSize(c.company_size)))
    if (referredOnly)          rows = rows.filter((c) => c.referred)
    if (viaProxyOnly)          rows = rows.filter((c) => isViaProxy(c))
    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      rows = rows.filter((c) => c.last_email_date && new Date(c.last_email_date).getTime() >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000 - 1
      rows = rows.filter((c) => c.last_email_date && new Date(c.last_email_date).getTime() <= to)
    }
    return rows
  }, [companies, search, stageFilters, sizeFilters, referredOnly, viaProxyOnly, dateFrom, dateTo])

  const hasFilter = search || stageFilters.size > 0 || sizeFilters.size > 0 || referredOnly || viaProxyOnly || dateFrom || dateTo

  function clearFilters() { setSearch(''); setStages(new Set()); setSizeFilters(new Set()); setReferredOnly(false); setViaProxyOnly(false); setDateFrom(''); setDateTo(''); setStageOpen(false); setSizeOpen(false) }

  function toggleSize(tier) {
    setSizeFilters((prev) => { const n = new Set(prev); n.has(tier) ? n.delete(tier) : n.add(tier); return n })
  }

  // ── Data loading ─────────────────────────────────────────────
  useEffect(() => {
    getApplications()
      .then(async (res) => {
        const loaded = res.data ?? []
        setCompanies(loaded)
        const { data: { session } } = await supabase.auth.getSession()
        if (session && loaded.some((c) => !c.recruiter_email)) {
          const result = await backfillRecruiterEmails({ userId: session.user.id, accessToken: session.access_token })
          if (result?.updated > 0) {
            const refreshed = await getApplications()
            setCompanies(refreshed.data ?? [])
          }
        }
      })
      .catch((err) => console.error('load error', err))
      .finally(() => setLoading(false))
  }, [])

  // ── Sync ─────────────────────────────────────────────────────
  async function handleSync() {
    if (companies.length > 0) {
      const ok = window.confirm(`You already have ${companies.length} companies loaded.\n\nRe-syncing will update existing records and add new ones.\n\nProceed?`)
      if (!ok) return
    }
    setSyncing(true)
    setSyncStatus({ type: 'info', message: 'Starting…' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const gmailToken         = session?.provider_token
      const gmailRefreshToken  = session?.provider_refresh_token
      const accessToken        = session?.access_token
      const userId             = session?.user?.id
      if (!gmailToken) { setSyncStatus({ type: 'error', message: 'Gmail token missing — sign out and sign back in.' }); return }
      if (!accessToken || !userId) { setSyncStatus({ type: 'error', message: 'Not authenticated. Please refresh.' }); return }
      await syncEmails({
        gmailToken, gmailRefreshToken, userId, accessToken,
        onEvent(event) {
          if (event.step === 'error') {
            setSyncStatus({ type: 'error', message: event.message })
          } else if (event.step === 'done') {
            setSyncStatus({ type: 'done', message: event.message })
            getApplications().then((res) => { setCompanies(res.data ?? []); handleEnrich() })
          } else {
            setSyncStatus({ type: 'info', message: event.message })
          }
        },
      })
    } catch (err) {
      setSyncStatus({ type: 'error', message: err.message })
    } finally {
      setSyncing(false)
    }
  }

  // ── Enrich ───────────────────────────────────────────────────
  async function handleEnrich() {
    setEnriching(true)
    setEnrichStatus({ type: 'info', message: 'Starting enrichment…' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await enrichCompanies({
        userId: session.user.id, accessToken: session.access_token,
        onEvent(event) {
          if (event.step === 'progress') {
            setEnrichStatus({ type: 'info', message: event.message })
            if (event.id) setCompanies((prev) => prev.map((c) =>
              c.id === event.id ? { ...c, industry: event.industry ?? c.industry, company_size: event.company_size ?? c.company_size } : c
            ))
          } else if (event.step === 'done') {
            setEnrichStatus({ type: 'done', message: event.message })
          } else if (event.step === 'error') {
            setEnrichStatus({ type: 'error', message: event.message })
          }
        },
      })
    } catch (err) {
      setEnrichStatus({ type: 'error', message: err.message })
    } finally {
      setEnriching(false)
    }
  }

  function handleUpdate(updated) {
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setSelected(updated)
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return
    const ok = window.confirm(`Delete ${selectedIds.size} application${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)
    if (!ok) return
    await Promise.all([...selectedIds].map((id) => deleteApplication(id)))
    setCompanies((prev) => prev.filter((c) => !selectedIds.has(c.id)))
    if (selectedIds.has(selectedCompany?.id)) setSelected(null)
    setSelectedIds(new Set())
  }

  const totalEmails      = companies.reduce((s, c) => s + (c.email_count ?? 0), 0)
  const totalInterviews  = filtered.reduce((s, c) => s + (c.interview_count ?? 0), 0)

  return (
    <main className="px-6 md:px-10 py-5 max-w-screen-2xl mx-auto flex flex-col gap-4">

        {/* ── Row 1: Filter bar + actions (single line) ── */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none" style={{ fontSize: 15 }}>search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, role, recruiter…"
              className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-sm pl-8 pr-3 py-1.5 rounded-lg transition-all placeholder:text-outline/50 w-60"
            />
            {search && (
              <button onClick={() => setSearch('')} className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface" style={{ fontSize: 13 }}>close</button>
            )}
          </div>

          {/* Stage dropdown */}
          <div className="relative">
            <button
              onClick={() => setStageOpen((o) => !o)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all ${stageFilters.size > 0 ? 'bg-primary-container/20 text-primary-container border-primary-container/30' : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'}`}
            >
              Stage {stageFilters.size > 0 && `(${stageFilters.size})`}
              <span className="material-symbols-outlined" style={{ fontSize: 12, transition: 'transform 0.15s', transform: stageOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
            </button>
            {stageOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStageOpen(false)} />
                <div className="absolute top-full mt-1 left-0 z-20 glass-l1 rounded-xl py-1.5 min-w-[150px] shadow-lg">
                  {STAGES.map((s) => (
                    <label key={s} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-primary-container/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={stageFilters.has(s)}
                        onChange={() => setStages((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })}
                        className="w-3.5 h-3.5 rounded accent-cyan-400 cursor-pointer"
                      />
                      <span className="font-sans text-xs text-on-surface">{s}</span>
                    </label>
                  ))}
                  {stageFilters.size > 0 && (
                    <button
                      onClick={() => { setStages(new Set()); setStageOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-outline hover:text-error font-sans border-t border-outline-variant/30 mt-1 pt-1.5 transition-colors"
                    >Clear</button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Size dropdown */}
          <div className="relative">
            <button
              onClick={() => setSizeOpen((o) => !o)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all ${sizeFilters.size > 0 ? 'bg-primary-container/20 text-primary-container border-primary-container/30' : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'}`}
            >
              Size {sizeFilters.size > 0 && `(${sizeFilters.size})`}
              <span className="material-symbols-outlined" style={{ fontSize: 12, transition: 'transform 0.15s', transform: sizeOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
            </button>
            {sizeOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSizeOpen(false)} />
                <div className="absolute top-full mt-1 left-0 z-20 glass-l1 rounded-xl py-1.5 min-w-[140px] shadow-lg">
                  {SIZE_TIERS.map((tier) => (
                    <label key={tier} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-primary-container/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={sizeFilters.has(tier)}
                        onChange={() => toggleSize(tier)}
                        className="w-3.5 h-3.5 rounded accent-cyan-400 cursor-pointer"
                      />
                      <span className="font-sans text-xs text-on-surface">{tier}</span>
                    </label>
                  ))}
                  {sizeFilters.size > 0 && (
                    <button
                      onClick={() => { setSizeFilters(new Set()); setSizeOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-outline hover:text-error font-sans border-t border-outline-variant/30 mt-1 pt-1.5 transition-colors"
                    >Clear</button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-2 py-1.5 rounded-lg transition-all w-32 [color-scheme:dark]" />
            <span className="text-outline text-xs">→</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="bg-surface-container-highest/30 border border-outline-variant focus:border-primary focus:outline-none text-on-surface font-sans text-xs px-2 py-1.5 rounded-lg transition-all w-32 [color-scheme:dark]" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="material-symbols-outlined text-outline hover:text-on-surface" style={{ fontSize: 14 }}>close</button>
            )}
          </div>

          {/* Referred filter */}
          <button
            onClick={() => setReferredOnly(r => !r)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-display font-bold uppercase tracking-widest text-[10px] border transition-all ${referredOnly ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' : 'text-on-surface-variant border-outline-variant/40 hover:bg-white/5'}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>volunteer_activism</span>
            Referred
          </button>

          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-outline hover:text-on-surface font-sans transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>filter_list_off</span>Clear
            </button>
          )}

          {/* Actions — pushed to right, stay on same line */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
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
            <button onClick={handleSync} disabled={syncing} title="Sync emails"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-l1 border border-outline-variant/40 text-outline hover:text-primary-container hover:border-primary-container/40 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-wait font-display font-bold uppercase tracking-widest text-[10px]">
              <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`} style={{ fontSize: 14, animationDuration: '1s' }}>sync</span>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-10 text-on-surface-variant text-sm">
            <div className="w-4 h-4 rounded-full liquid-neon animate-spin" style={{ animationDuration: '1s' }} />
            Loading…
          </div>
        ) : (
          <>
            {/* ── Row 2: Summary ── */}
            <p className="text-sm text-on-surface-variant font-sans">
              <span className="text-on-surface font-semibold">{filtered.length}</span>
              {filtered.length !== companies.length && <span className="text-outline"> of {companies.length}</span>}
              {' '}companies &nbsp;·&nbsp;
              <span className="text-on-surface font-semibold">{totalEmails.toLocaleString()}</span> emails read &nbsp;·&nbsp;
              <span className="text-on-surface font-semibold">{totalInterviews.toLocaleString()}</span> interviews
            </p>

            {/* Status bars */}
            {syncStatus && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-sans border ${syncStatus.type === 'error' ? 'bg-error/10 border-error/30 text-error' : syncStatus.type === 'done' ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' : 'glass-l1 border-outline-variant/40 text-on-surface-variant'}`}>
                {syncing && <div className="w-3 h-3 rounded-full liquid-neon animate-spin shrink-0" style={{ animationDuration: '1s' }} />}
                {syncStatus.type === 'error' && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>error</span>}
                {syncStatus.type === 'done'  && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>check_circle</span>}
                {syncStatus.message}
              </div>
            )}
            {enrichStatus && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-sans border ${enrichStatus.type === 'error' ? 'bg-error/10 border-error/30 text-error' : enrichStatus.type === 'done' ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' : 'glass-l1 border-outline-variant/40 text-on-surface-variant'}`}>
                {enriching && <div className="w-3 h-3 rounded-full border-2 border-primary-container border-t-transparent animate-spin shrink-0" />}
                {enrichStatus.type === 'error' && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>error</span>}
                {enrichStatus.type === 'done'  && <span className="material-symbols-outlined shrink-0" style={{ fontSize: 14 }}>check_circle</span>}
                {enrichStatus.message}
              </div>
            )}

            {/* ── Main content ── */}
            <div className="flex gap-5 items-start">
              <div className={`min-w-0 flex flex-col gap-4 transition-all duration-300 ${selectedCompany ? 'flex-[3]' : 'flex-1'}`}>

                {/* ── Row 3: Charts (filtered) ── */}
                <div>
                  <button
                    onClick={() => setChartsOpen((o) => !o)}
                    className="flex items-center gap-1.5 mb-2 text-on-surface-variant hover:text-on-surface transition-colors font-display font-bold uppercase tracking-widest text-[10px]"
                  >
                    <span className="material-symbols-outlined transition-transform duration-200" style={{ fontSize: 13, transform: chartsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>expand_more</span>
                    Charts
                  </button>
                  {chartsOpen && <StageChart companies={filtered} />}
                </div>

                {/* ── Row 4: Table ── */}
                <CompanyTable
                  companies={filtered}
                  total={companies.length}
                  selectedId={selectedCompany?.id}
                  onSelect={setSelected}
                  onSelectionChange={setSelectedIds}
                  editMode={editMode}
                />
              </div>

              {selectedCompany && (
                <div className="flex-[2] glass-l1 rounded-xl sticky top-20 h-[calc(100vh-6rem)] overflow-hidden flex flex-col min-h-0">
                  <CompanyPanel
                    company={selectedCompany}
                    onClose={() => setSelected(null)}
                    onUpdate={handleUpdate}
                  />
                </div>
              )}
            </div>
          </>
        )}
    </main>
  )
}
