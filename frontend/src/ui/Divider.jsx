/** Horizontal rule with optional center text (e.g. "Or") */
export function Divider({ label, className = '' }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="h-px flex-1 bg-outline-variant" />
      {label && (
        <span className="font-display font-bold uppercase tracking-widest text-[11px] text-outline shrink-0">
          {label}
        </span>
      )}
      <div className="h-px flex-1 bg-outline-variant" />
    </div>
  )
}
