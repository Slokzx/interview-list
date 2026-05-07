import { forwardRef } from 'react'

const base =
  'inline-flex items-center justify-center gap-2 font-display font-bold uppercase tracking-widest text-xs transition-all duration-300 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none'

const variants = {
  primary:
    'liquid-neon text-[#001f24] rounded-lg py-4 px-6 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:shadow-[0_0_30px_rgba(0,229,255,0.5)]',
  ghost:
    'glass-l1 border border-outline-variant/50 hover:border-primary-container/40 hover:bg-primary-container/10 text-on-surface hover:text-primary-container rounded-lg py-3 px-5',
  danger:
    'bg-error/10 border border-error/30 hover:bg-error/20 text-error rounded-lg py-3 px-5',
}

const sizes = {
  sm: 'text-[11px] py-2 px-4',
  md: '',
  lg: 'text-sm py-4 px-8',
}

/**
 * @param {'primary'|'ghost'|'danger'} variant
 * @param {'sm'|'md'|'lg'} size
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})
