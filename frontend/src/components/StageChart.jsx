import { useMemo, useState } from 'react'
import * as d3 from 'd3'

const STAGE_COLORS = {
  'Applied':      '#00b4d8',
  'Phone Screen': '#f4a261',
  'Technical':    '#9b5de5',
  'Onsite':       '#06d6a0',
  'Offer':        '#52b788',
  'Rejected':     '#e63946',
}
const STAGES = ['Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected']

function Card({ title, children }) {
  return (
    <div className="glass-l1 rounded-xl p-5 flex flex-col gap-4 flex-1 min-w-0 overflow-hidden">
      <p className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant shrink-0">
        {title}
      </p>
      {children}
    </div>
  )
}

// ── 1. Stage donut ───────────────────────────────────────────
function StageDonut({ companies }) {
  const [hovered, setHovered] = useState(null)

  const data = useMemo(() =>
    STAGES
      .map((s) => ({ name: s, value: companies.filter((c) => c.stage === s).length, color: STAGE_COLORS[s] }))
      .filter((d) => d.value > 0),
    [companies]
  )

  const W = 190, H = 190, R = 82, IR = 50
  const pie    = d3.pie().value((d) => d.value).sort(null).padAngle(0.03)
  const arc    = d3.arc().innerRadius(IR).outerRadius(R).cornerRadius(3)
  const arcHov = d3.arc().innerRadius(IR - 3).outerRadius(R + 7).cornerRadius(3)
  const slices = pie(data)
  const label  = hovered ? data.find((d) => d.name === hovered) : null

  return (
    <Card title="Stage Breakdown">
      <div className="flex items-center gap-4">
        <svg width={W} height={H} style={{ flexShrink: 0, overflow: 'visible' }}>
          <defs>
            {data.map((d) => (
              <radialGradient key={d.name} id={`sg-${d.name.replace(/\s/g,'')}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={d.color} stopOpacity="1" />
                <stop offset="100%" stopColor={d.color} stopOpacity="0.55" />
              </radialGradient>
            ))}
            <filter id="glow-d">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${W/2},${H/2})`}>
            {slices.map((s) => {
              const isHov = hovered === s.data.name
              return (
                <path key={s.data.name}
                  d={isHov ? arcHov(s) : arc(s)}
                  fill={`url(#sg-${s.data.name.replace(/\s/g,'')})`}
                  filter={isHov ? 'url(#glow-d)' : undefined}
                  style={{ transition: 'all 0.18s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(s.data.name)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}
            <text textAnchor="middle" dy="-7"
              style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', fill: 'var(--color-on-surface)' }}>
              {label ? label.value : companies.length}
            </text>
            <text textAnchor="middle" dy="13"
              style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em', fill: 'var(--color-on-surface-variant)' }}>
              {label ? label.name : 'total'}
            </text>
          </g>
        </svg>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {data.map((d) => {
            const pct = ((d.value / companies.length) * 100).toFixed(0)
            const isHov = hovered === d.name
            return (
              <div key={d.name}
                className="flex items-center gap-2 cursor-default"
                style={{ opacity: hovered && !isHov ? 0.35 : 1, transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(d.name)}
                onMouseLeave={() => setHovered(null)}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: d.color, boxShadow: isHov ? `0 0 7px ${d.color}` : 'none' }} />
                <span className="text-[13px] text-on-surface-variant truncate flex-1">{d.name}</span>
                <span className="text-[13px] font-bold font-display text-on-surface tabular-nums">{d.value}</span>
                <span className="text-[12px] text-outline tabular-nums w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ── 2. Interview distribution ────────────────────────────────
function InterviewBar({ companies }) {
  const [tooltip, setTooltip] = useState(null)

  const data = useMemo(() => {
    const counts = {}
    for (const c of companies) {
      const k = Math.min(c.interview_count ?? 0, 5)
      const label = k === 5 ? '5+' : String(k)
      counts[label] = (counts[label] ?? 0) + 1
    }
    return ['0','1','2','3','4','5+']
      .map((l) => ({ label: l, value: counts[l] ?? 0 }))
  }, [companies])

  // viewBox units — SVG scales to fill container width
  const VW = 360, VH = 200
  const m = { top: 12, right: 12, bottom: 32, left: 34 }
  const iW = VW - m.left - m.right
  const iH = VH - m.top  - m.bottom

  const x = d3.scaleBand().domain(data.map((d) => d.label)).range([0, iW]).padding(0.32)
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.value) || 1]).nice().range([iH, 0])
  const ticks = y.ticks(4)

  return (
    <Card title="Interviews per Company">
      <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="ibg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#7b2ff7" stopOpacity="0.55" />
          </linearGradient>
          <filter id="ibglow">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={iW} y1={y(t)} y2={y(t)} stroke="var(--color-outline-variant)" strokeOpacity="0.5" strokeDasharray="4,3" />
              <text x={-6} y={y(t)} textAnchor="end" dominantBaseline="middle"
                style={{ fontSize: 11, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface-variant)' }}>{t}</text>
            </g>
          ))}

          {data.map((d) => {
            if (!d.value) return null
            const bH = iH - y(d.value)
            const bX = x(d.label)
            return (
              <g key={d.label}
                onMouseEnter={() => setTooltip({ x: bX + x.bandwidth() / 2, y: y(d.value) - 10, d })}
                onMouseLeave={() => setTooltip(null)}>
                <rect x={bX} y={y(d.value)} width={x.bandwidth()} height={bH}
                  rx={4} fill="url(#ibg)" opacity={0.28} filter="url(#ibglow)" />
                <rect x={bX} y={y(d.value)} width={x.bandwidth()} height={bH}
                  rx={4} fill="url(#ibg)" />
              </g>
            )
          })}

          {data.map((d) => (
            <text key={d.label} x={x(d.label) + x.bandwidth() / 2} y={iH + 18}
              textAnchor="middle"
              style={{ fontSize: 12, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface-variant)' }}>{d.label}</text>
          ))}

          {tooltip && (
            <g transform={`translate(${tooltip.x},${tooltip.y})`} style={{ pointerEvents: 'none' }}>
              <rect x={-32} y={-22} width={64} height={24} rx={5}
                fill="var(--color-surface-container-high)" stroke="var(--color-primary-container)" strokeOpacity="0.4" strokeWidth={1} />
              <text textAnchor="middle" y={-5}
                style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface)' }}>
                {tooltip.d.value} co.
              </text>
            </g>
          )}
        </g>
      </svg>
    </Card>
  )
}

// ── 3. Company size donut ────────────────────────────────────
const SIZE_TIERS = [
  { label: 'Startup',    max: 100,    color: '#00e5ff' },
  { label: 'Small',      max: 500,    color: '#06d6a0' },
  { label: 'Mid-size',   max: 2000,   color: '#f4a261' },
  { label: 'Large',      max: 10000,  color: '#9b5de5' },
  { label: 'Enterprise', max: Infinity, color: '#e63946' },
]

function parseSizeToNumber(raw) {
  if (!raw) return null
  // Strip commas and grab the first number (handles "1,500,000+", "500–2,000", "2,100,000+")
  const cleaned = raw.replace(/,/g, '')
  const match = cleaned.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function bucketSize(raw) {
  const n = parseSizeToNumber(raw)
  if (n === null) return null
  return SIZE_TIERS.find((t) => n < t.max)?.label ?? 'Enterprise'
}

function SizeDonut({ companies }) {
  const [hovered, setHovered] = useState(null)

  const data = useMemo(() => {
    const counts = {}
    for (const c of companies) {
      const bucket = bucketSize(c.company_size)
      if (!bucket) continue
      counts[bucket] = (counts[bucket] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((s, v) => s + v, 0)
    return SIZE_TIERS
      .filter((t) => counts[t.label])
      .map((t) => ({ name: t.label, value: counts[t.label], color: t.color, total }))
  }, [companies])

  const withSize = data.reduce((s, d) => s + d.value, 0)

  const W = 190, H = 190, R = 82, IR = 50
  const pie    = d3.pie().value((d) => d.value).sort(null).padAngle(0.03)
  const arc    = d3.arc().innerRadius(IR).outerRadius(R).cornerRadius(3)
  const arcHov = d3.arc().innerRadius(IR - 3).outerRadius(R + 7).cornerRadius(3)
  const slices = pie(data)
  const label  = hovered ? data.find((d) => d.name === hovered) : null

  if (!data.length) return (
    <Card title="Company Size">
      <p className="text-xs text-outline font-sans">Run "Enrich Companies" to populate size data.</p>
    </Card>
  )

  return (
    <Card title="Company Size">
      <div className="flex items-center gap-4">
        <svg width={W} height={H} style={{ flexShrink: 0, overflow: 'visible' }}>
          <defs>
            {data.map((d) => (
              <radialGradient key={d.name} id={`szg-${d.name}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={d.color} stopOpacity="1" />
                <stop offset="100%" stopColor={d.color} stopOpacity="0.55" />
              </radialGradient>
            ))}
            <filter id="glow-sz">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${W / 2},${H / 2})`}>
            {slices.map((s) => {
              const isHov = hovered === s.data.name
              return (
                <path key={s.data.name}
                  d={isHov ? arcHov(s) : arc(s)}
                  fill={`url(#szg-${s.data.name})`}
                  filter={isHov ? 'url(#glow-sz)' : undefined}
                  style={{ transition: 'all 0.18s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setHovered(s.data.name)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}
            <text textAnchor="middle" dy="-7"
              style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', fill: 'var(--color-on-surface)' }}>
              {label ? label.value : withSize}
            </text>
            <text textAnchor="middle" dy="13"
              style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em', fill: 'var(--color-on-surface-variant)' }}>
              {label ? label.name : 'Companies'}
            </text>
          </g>
        </svg>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {data.map((d) => {
            const pct = ((d.value / withSize) * 100).toFixed(0)
            const isHov = hovered === d.name
            return (
              <div key={d.name}
                className="flex items-center gap-2 cursor-default"
                style={{ opacity: hovered && !isHov ? 0.35 : 1, transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(d.name)}
                onMouseLeave={() => setHovered(null)}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: d.color, boxShadow: isHov ? `0 0 7px ${d.color}` : 'none' }} />
                <span className="text-[13px] text-on-surface-variant truncate flex-1">{d.name}</span>
                <span className="text-[13px] font-bold font-display text-on-surface tabular-nums">{d.value}</span>
                <span className="text-[12px] text-outline tabular-nums w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ── Main export ──────────────────────────────────────────────
export default function StageChart({ companies }) {
  if (!companies.length) return null
  return (
    <div className="flex gap-3">
      <StageDonut companies={companies} />
      <InterviewBar companies={companies} />
      <SizeDonut companies={companies} />
    </div>
  )
}
