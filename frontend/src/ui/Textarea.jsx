import { forwardRef, useEffect, useRef } from 'react'

/**
 * Auto-resizing textarea that matches the Input component's visual style.
 * @param {string}  label       - Label above the field
 * @param {string}  icon        - Material Symbol name for leading icon
 * @param {boolean} autoResize  - Grow with content (default true)
 * @param {number}  minRows     - Minimum visible rows (default 1)
 * @param {number}  maxRows     - Cap height at this many rows (default 8)
 */
export const Textarea = forwardRef(function Textarea(
  { label, icon, autoResize = true, minRows = 1, maxRows = 8, className = '', style, ...props },
  forwardedRef
) {
  const innerRef = useRef(null)
  const ref = forwardedRef ?? innerRef

  // Auto-resize on value change
  useEffect(() => {
    if (!autoResize) return
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20
    const minH = lineHeight * minRows + 24  // 24 = vertical padding
    const maxH = lineHeight * maxRows + 24
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minH), maxH)}px`
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  })

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label className="font-display font-bold uppercase tracking-widest text-[11px] text-on-surface-variant px-1">
          {label}
        </label>
      )}
      <div className={`relative input-glow rounded-xl overflow-hidden group`}>
        {icon && (
          <span className="material-symbols-outlined absolute left-4 top-3.5 text-outline group-focus-within:text-primary transition-colors pointer-events-none" style={{ fontSize: 18 }}>
            {icon}
          </span>
        )}
        <textarea
          ref={ref}
          rows={minRows}
          className={`
            w-full bg-surface-container-highest/30
            border border-outline-variant
            focus:border-primary focus:outline-none focus:ring-0
            text-on-surface font-sans text-sm
            ${icon ? 'pl-12' : 'pl-4'} pr-4 py-3
            rounded-xl transition-all resize-none
            placeholder:text-outline/50
            ${className}
          `}
          style={{ overflowY: 'hidden', ...style }}
          {...props}
        />
      </div>
    </div>
  )
})
