import { useMemo, useState } from 'react'
import * as d3 from 'd3'

const STAGE_ORDER = ['Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected']

const STAGE_COLORS = {
  'Applied':      '#00b4d8',
  'Phone Screen': '#f4a261',
  'Technical':    '#9b5de5',
  'Onsite':       '#06d6a0',
  'Offer':        '#52b788',
  'Rejected':     '#e63946',
}

// Map an email's subject + snippet to a stage
const STAGE_RULES = [
  ['Offer',        /offer\s*letter|pleased\s*to\s*offer|extend.{0,6}offer|congratulations.*\bjoin\b|welcome\s*to\s*the\s*team/i],
  ['Rejected',     /not\s*moving\s*forward|not\s*selected|decided\s*to\s*(move|go)\s*with|unfortunately.*position|other\s*candidates|regret|not.*proceed|position\s*has\s*been\s*filled|reject/i],
  ['Onsite',       /on.?site|final\s*(round|interview|loop)|full.{0,4}(loop|day)|in.?person|virtual\s*onsite/i],
  ['Technical',    /technical|coding|code\s*(challenge|assessment|screen)|take.home|hackerrank|codesignal|codility|leetcode|hacker\s*rank|programming\s*challenge|assessment/i],
  ['Phone Screen', /phone\s*(screen|call|interview|chat)|video\s*(call|interview|chat)|quick\s*(call|chat)|recruiter\s*(call|screen|chat)|intro(ductory)?\s*(call|chat)|screening/i],
]

function detectStage(subject = '', snippet = '') {
  const text = `${subject} ${snippet}`
  for (const [stage, re] of STAGE_RULES) {
    if (re.test(text)) return stage
  }
  return 'Applied'
}

function parseEmailDate(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, '')
  const d = new Date(cleaned)
  return isNaN(d) ? null : d
}

function fmtDate(d) {
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Timeline SVG ─────────────────────────────────────────────
function Timeline({ stageData, currentStage }) {
  const [hovered, setHovered] = useState(null)

  // Only show stages up to and including current, plus one ahead
  const currentIdx = STAGE_ORDER.indexOf(currentStage)
  const visible = STAGE_ORDER.filter((s, i) => {
    // Always show up to current + 1 (to show next step)
    if (i <= currentIdx + 1) return true
    // Also show if we have emails there (e.g. jumped stages)
    return stageData[s]?.count > 0
  })

  const VW = 520, VH = 130
  const padX = 36
  const nodeY = 52
  const nodeR = 18

  const xStep = visible.length > 1 ? (VW - padX * 2) / (visible.length - 1) : 0
  const xPos  = (i) => padX + i * xStep

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        {STAGE_ORDER.map(s => (
          <radialGradient key={s} id={`tg-${s.replace(/\s/g, '')}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={STAGE_COLORS[s]} stopOpacity="1" />
            <stop offset="100%" stopColor={STAGE_COLORS[s]} stopOpacity="0.5" />
          </radialGradient>
        ))}
        <filter id="tglow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Connector lines */}
      {visible.slice(0, -1).map((s, i) => {
        const reached = (stageData[s]?.count ?? 0) > 0
        return (
          <line key={s}
            x1={xPos(i) + nodeR} y1={nodeY}
            x2={xPos(i + 1) - nodeR} y2={nodeY}
            stroke={reached ? STAGE_COLORS[s] : 'var(--color-outline-variant)'}
            strokeWidth={reached ? 2 : 1.5}
            strokeOpacity={reached ? 0.5 : 0.3}
            strokeDasharray={reached ? 'none' : '4,3'}
          />
        )
      })}

      {/* Nodes */}
      {visible.map((s, i) => {
        const d = stageData[s]
        const isCurrent = s === currentStage
        const hasData   = (d?.count ?? 0) > 0
        const isHov     = hovered === s
        const r         = isHov ? nodeR + 3 : nodeR
        const color     = STAGE_COLORS[s]
        const x         = xPos(i)

        return (
          <g key={s}
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'default' }}>

            {/* Glow ring for current stage */}
            {isCurrent && (
              <circle cx={x} cy={nodeY} r={nodeR + 6}
                fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.25}
                filter="url(#tglow)" />
            )}

            {/* Main circle */}
            <circle cx={x} cy={nodeY} r={r}
              fill={hasData ? `url(#tg-${s.replace(/\s/g,'')})` : 'var(--color-surface-container-highest)'}
              stroke={color}
              strokeWidth={isCurrent ? 2.5 : hasData ? 1.5 : 1}
              strokeOpacity={hasData ? 0.8 : 0.3}
              style={{ transition: 'r 0.15s ease' }}
            />

            {/* Email count inside node */}
            {hasData && (
              <text x={x} y={nodeY + 1}
                textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Space Grotesk', fill: '#fff', pointerEvents: 'none' }}>
                {d.count}
              </text>
            )}

            {/* Stage label above */}
            <text x={x} y={nodeY - nodeR - 8}
              textAnchor="middle"
              style={{
                fontSize: 9.5,
                fontWeight: isCurrent ? 700 : 600,
                fontFamily: 'Space Grotesk',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                fill: hasData ? color : 'var(--color-outline)',
              }}>
              {s}
            </text>

            {/* Date below */}
            {d?.firstDate && (
              <text x={x} y={nodeY + nodeR + 14}
                textAnchor="middle"
                style={{ fontSize: 10, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface-variant)' }}>
                {fmtDate(d.firstDate)}
              </text>
            )}

            {/* Tooltip on hover */}
            {isHov && hasData && (
              <g transform={`translate(${x}, ${nodeY - nodeR - 32})`} style={{ pointerEvents: 'none' }}>
                <rect x={-44} y={-18} width={88} height={22} rx={5}
                  fill="var(--color-surface-container-high)"
                  stroke={color} strokeOpacity={0.4} strokeWidth={1} />
                <text textAnchor="middle" y={-3}
                  style={{ fontSize: 11, fontWeight: 600, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface)' }}>
                  {d.count} email{d.count !== 1 ? 's' : ''}{d.lastDate && d.firstDate && d.firstDate.getTime() !== d.lastDate.getTime() ? ` · ${fmtDate(d.lastDate)}` : ''}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Bar chart ─────────────────────────────────────────────────
function StageBar({ stageData, currentStage }) {
  const [tooltip, setTooltip] = useState(null)

  const data = STAGE_ORDER
    .map(s => ({ stage: s, count: stageData[s]?.count ?? 0, color: STAGE_COLORS[s] }))
    .filter(d => d.count > 0)

  if (data.length === 0) return null

  const VW = 520, VH = 160
  const m = { top: 8, right: 12, bottom: 28, left: 28 }
  const iW = VW - m.left - m.right
  const iH = VH - m.top  - m.bottom

  const x = d3.scaleBand().domain(data.map(d => d.stage)).range([0, iW]).padding(0.35)
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) || 1]).nice().range([iH, 0])
  const ticks = y.ticks(Math.min(4, d3.max(data, d => d.count) || 1))

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        {data.map(d => (
          <linearGradient key={d.stage} id={`bg-${d.stage.replace(/\s/g,'')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={d.color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={d.color} stopOpacity="0.35" />
          </linearGradient>
        ))}
        <filter id="barglow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g transform={`translate(${m.left},${m.top})`}>
        {/* Grid lines */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={0} x2={iW} y1={y(t)} y2={y(t)}
              stroke="var(--color-outline-variant)" strokeOpacity="0.4" strokeDasharray="4,3" />
            <text x={-5} y={y(t)} textAnchor="end" dominantBaseline="middle"
              style={{ fontSize: 10, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface-variant)' }}>
              {t}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map(d => {
          const bH = iH - y(d.count)
          const bX = x(d.stage)
          const isCurrent = d.stage === currentStage
          return (
            <g key={d.stage}
              onMouseEnter={() => setTooltip({ x: bX + x.bandwidth() / 2, y: y(d.count) - 8, d })}
              onMouseLeave={() => setTooltip(null)}>
              {/* Glow layer */}
              <rect x={bX} y={y(d.count)} width={x.bandwidth()} height={bH}
                rx={5} fill={`url(#bg-${d.stage.replace(/\s/g,'')})`}
                opacity={0.25} filter="url(#barglow)" />
              {/* Solid bar */}
              <rect x={bX} y={y(d.count)} width={x.bandwidth()} height={bH}
                rx={5} fill={`url(#bg-${d.stage.replace(/\s/g,'')})`}
                opacity={isCurrent ? 1 : 0.75} />
              {/* Current stage accent line */}
              {isCurrent && (
                <rect x={bX} y={y(d.count)} width={x.bandwidth()} height={3}
                  rx={2} fill={d.color} />
              )}
            </g>
          )
        })}

        {/* X labels */}
        {data.map(d => (
          <text key={d.stage}
            x={x(d.stage) + x.bandwidth() / 2} y={iH + 16}
            textAnchor="middle"
            style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Space Grotesk', fill: STAGE_COLORS[d.stage] }}>
            {d.stage === 'Phone Screen' ? 'Phone' : d.stage}
          </text>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <g transform={`translate(${tooltip.x},${tooltip.y})`} style={{ pointerEvents: 'none' }}>
            <rect x={-38} y={-22} width={76} height={24} rx={5}
              fill="var(--color-surface-container-high)"
              stroke={STAGE_COLORS[tooltip.d.stage]} strokeOpacity={0.4} strokeWidth={1} />
            <text textAnchor="middle" y={-5}
              style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Space Grotesk', fill: 'var(--color-on-surface)' }}>
              {tooltip.d.count} email{tooltip.d.count !== 1 ? 's' : ''}
            </text>
          </g>
        )}
      </g>
    </svg>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function CompanyInterviewChart({ company }) {
  const stageData = useMemo(() => {
    const emails = Array.isArray(company.raw_emails) ? company.raw_emails : []
    const map = {}

    // Seed with known dates
    if (company.applied_date) {
      const d = new Date(company.applied_date)
      if (!isNaN(d)) {
        map['Applied'] = { count: 0, firstDate: d, lastDate: d }
      }
    }

    for (const email of emails) {
      const stage = detectStage(email.subject, email.snippet)
      const date  = parseEmailDate(email.date)

      if (!map[stage]) {
        map[stage] = { count: 0, firstDate: date, lastDate: date }
      } else {
        if (date) {
          if (!map[stage].firstDate || date < map[stage].firstDate) map[stage].firstDate = date
          if (!map[stage].lastDate  || date > map[stage].lastDate)  map[stage].lastDate  = date
        }
      }
      map[stage].count++
    }

    return map
  }, [company])

  const hasEmails = (company.raw_emails?.length ?? 0) > 0

  if (!hasEmails) {
    return (
      <p className="text-xs text-outline font-sans py-2">No email data to chart.</p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stage timeline */}
      <div>
        <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-3">
          Interview Timeline
        </p>
        <Timeline stageData={stageData} currentStage={company.stage} />
      </div>

      {/* Divider */}
      <div className="border-t border-outline-variant/30" />

      {/* Email activity per stage */}
      <div>
        <p className="font-display font-bold uppercase tracking-widest text-[10px] text-on-surface-variant mb-2">
          Emails per Stage
        </p>
        <StageBar stageData={stageData} currentStage={company.stage} />
      </div>

      <p className="text-[10px] text-outline font-sans">
        Stages inferred from email subjects · {company.raw_emails?.length ?? 0} emails total
      </p>
    </div>
  )
}
