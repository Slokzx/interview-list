/**
 * @param {number} value  - 0–100
 * @param {string} label  - optional label above
 */
export function ProgressBar({ value = 0, label, className = '' }) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <div className="flex justify-between items-center">
          <span className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant">
            {label}
          </span>
          <span className="font-display font-bold text-[11px] text-primary">{clamped}%</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full liquid-neon transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
