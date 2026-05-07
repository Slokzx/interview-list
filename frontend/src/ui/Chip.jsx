const colorMap = {
  primary:   'bg-primary/15 text-primary border-primary/20',
  secondary: 'bg-secondary/15 text-secondary border-secondary/20',
  tertiary:  'bg-tertiary/15 text-tertiary border-tertiary/20',
  error:     'bg-error/15 text-error border-error/20',
  outline:   'bg-transparent text-on-surface-variant border-outline-variant',
}

// success/warning use CSS vars so they adapt to light/dark
const cssVarChips = {
  success: { color: 'var(--color-success)', bg: 'var(--color-success)' },
  warning: { color: 'var(--color-warning)', bg: 'var(--color-warning)' },
}

export function Chip({ color = 'primary', icon, children, className = '', ...props }) {
  const css = cssVarChips[color]

  if (css) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-display font-bold uppercase tracking-widest ${className}`}
        style={{
          color: css.color,
          background: `color-mix(in srgb, ${css.bg} 15%, transparent)`,
          borderColor: `color-mix(in srgb, ${css.bg} 25%, transparent)`,
        }}
        {...props}
      >
        {icon && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>}
        {children}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-display font-bold uppercase tracking-widest ${colorMap[color]} ${className}`}
      {...props}
    >
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>}
      {children}
    </span>
  )
}
