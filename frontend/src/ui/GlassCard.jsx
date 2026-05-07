/**
 * @param {'l1'|'l2'} level   - Glassmorphism depth level
 * @param {boolean}   glow    - Add neon glow shadow
 * @param {boolean}   hover   - Scale + deepen blur on hover
 */
export function GlassCard({ level = 'l1', glow = false, hover = false, className = '', children, ...props }) {
  return (
    <div
      className={`
        glass-${level}
        rounded-xl p-md
        ${glow ? 'neon-glow' : ''}
        ${hover ? 'transition-all duration-300 hover:scale-[1.02] hover:glass-l2' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}
